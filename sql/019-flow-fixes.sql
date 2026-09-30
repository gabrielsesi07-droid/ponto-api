-- Revisão do fluxo (30/09/2026): intervalo automático por pessoa/dia, fechamento mensal e lembrete de horas.
-- Aditiva: registros existentes ficam com intervalo "custom" e não são recalculados.
ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS break_mode text NOT NULL DEFAULT 'custom';
-- statement-break
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='entries_break_mode' AND conrelid='horacerta.entries'::regclass) THEN
   ALTER TABLE horacerta.entries ADD CONSTRAINT entries_break_mode CHECK(break_mode IN ('automatic','custom'));
 END IF;
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.window_overlap(p_start time, p_end time, p_from integer, p_to integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT greatest(0, least((extract(epoch FROM p_end)/60)::integer, p_to) - greatest((extract(epoch FROM p_start)/60)::integer, p_from))
$$;
-- statement-break
-- Mesma regra de lib/manual-work.ts (automaticBreakForDay): um único intervalo por pessoa/dia.
-- Se o dia (primeira entrada até a última saída) abrange 12h–13h, essa é a janela; senão, 19h–20h.
-- Cada registro automático desconta somente o trecho trabalhado dentro dessa janela.
CREATE OR REPLACE FUNCTION horacerta.recompute_auto_breaks(p_user uuid, p_date date, p_actor uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE first_start time; last_end time; w_from integer := 1140; w_to integer := 1200; changed integer; needs_approval boolean;
BEGIN
 SELECT min(start),max("end") INTO first_start,last_end FROM horacerta.entries
  WHERE user_id=p_user AND date=p_date AND deleted_at IS NULL AND "end" IS NOT NULL;
 IF first_start IS NULL THEN RETURN 0; END IF;
 IF horacerta.window_overlap(first_start,last_end,720,780)>0 THEN w_from := 720; w_to := 780; END IF;
 SELECT coalesce((rules->>'approval_required')::boolean,true) INTO needs_approval FROM horacerta.settings WHERE id=1;
 WITH old AS (
   SELECT * FROM horacerta.entries WHERE user_id=p_user AND date=p_date AND deleted_at IS NULL AND "end" IS NOT NULL
     AND break_mode='automatic' AND break_minutes<>horacerta.window_overlap(start,"end",w_from,w_to) FOR UPDATE
 ), changed_rows AS (
   UPDATE horacerta.entries e SET break_minutes=horacerta.window_overlap(e.start,e."end",w_from,w_to),
     status=CASE WHEN e.status='Aprovado' AND needs_approval THEN 'Pendente' ELSE e.status END,
     version=e.version+1, updated_at=now()
   FROM old WHERE e.id=old.id RETURNING e.*
 )
 INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value)
 SELECT p_actor,changed_rows.id,'auto_break',to_jsonb(old),to_jsonb(changed_rows) FROM changed_rows JOIN old USING(id);
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed;
END $$;
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.month_closings (
 month date PRIMARY KEY CHECK(month=date_trunc('month',month)::date),
 closed_by uuid NOT NULL REFERENCES horacerta.users(id),
 closed_at timestamptz NOT NULL DEFAULT now(),
 summary jsonb NOT NULL DEFAULT '{}'
);
-- statement-break
-- Protege todos os caminhos de gravação (API, relógio legado, funções) contra alterações em mês fechado.
CREATE OR REPLACE FUNCTION horacerta.entries_guard_closed_month() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month=date_trunc('month',OLD.date)::date) THEN
   RAISE EXCEPTION 'O mês % está fechado. O coordenador precisa reabri-lo, com justificativa, antes de qualquer alteração.', to_char(OLD.date,'MM/YYYY');
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month=date_trunc('month',NEW.date)::date) THEN
   RAISE EXCEPTION 'O mês % está fechado. O coordenador precisa reabri-lo, com justificativa, antes de registrar horas nele.', to_char(NEW.date,'MM/YYYY');
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER entries_closed_month BEFORE INSERT OR UPDATE OR DELETE ON horacerta.entries
 FOR EACH ROW EXECUTE FUNCTION horacerta.entries_guard_closed_month();
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.month_action(actor uuid, action text, p_month date, p_user uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u horacerta.users%ROWTYPE;
 first_day date := date_trunc('month',p_month)::date;
 last_day date := (date_trunc('month',p_month)+interval '1 month -1 day')::date;
 local_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 affected integer := 0;
 blocking record;
 summary jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 SELECT * INTO u FROM horacerta.users WHERE id=actor AND active;
 IF NOT FOUND OR u.role<>'coordinator' THEN RAISE EXCEPTION 'Somente o coordenador pode aprovar ou fechar o mês.'; END IF;
 IF first_day>local_today THEN RAISE EXCEPTION 'Não é possível fechar ou aprovar um mês futuro.'; END IF;
 IF action='approve' THEN
   IF EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month=first_day) THEN RAISE EXCEPTION 'Este mês já está fechado.'; END IF;
   WITH old AS (
     SELECT * FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL AND "end" IS NOT NULL
       AND status<>'Aprovado' AND (p_user IS NULL OR user_id=p_user) FOR UPDATE
   ), changed_rows AS (
     UPDATE horacerta.entries e SET status='Aprovado',version=e.version+1,updated_at=now() FROM old WHERE e.id=old.id RETURNING e.*
   )
   INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value)
   SELECT actor,changed_rows.id,'status',to_jsonb(old),to_jsonb(changed_rows) FROM changed_rows JOIN old USING(id);
   GET DIAGNOSTICS affected = ROW_COUNT;
   RETURN jsonb_build_object('ok',true,'approved',affected);
 ELSIF action='close' THEN
   IF EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month=first_day) THEN RAISE EXCEPTION 'Este mês já está fechado.'; END IF;
   IF last_day>=local_today THEN RAISE EXCEPTION 'Feche o mês somente depois do último dia dele.'; END IF;
   SELECT count(*) FILTER (WHERE "end" IS NULL) open_count, count(*) FILTER (WHERE "end" IS NOT NULL AND status<>'Aprovado') pending_count
     INTO blocking FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL;
   IF blocking.open_count>0 THEN RAISE EXCEPTION 'Há % registro(s) sem saída neste mês. Complete-os antes de fechar.', blocking.open_count; END IF;
   IF blocking.pending_count>0 THEN RAISE EXCEPTION 'Há % registro(s) ainda não aprovados neste mês. Aprove-os antes de fechar.', blocking.pending_count; END IF;
   IF EXISTS(SELECT 1 FROM horacerta.timers WHERE (started_at AT TIME ZONE 'America/Sao_Paulo')::date<=last_day) THEN
     RAISE EXCEPTION 'Há cronômetro antigo aberto com início neste mês. Encerre-o antes de fechar.';
   END IF;
   SELECT jsonb_build_object('entries',count(*),'people',count(DISTINCT user_id)) INTO summary
     FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL;
   INSERT INTO horacerta.month_closings(month,closed_by,summary) VALUES(first_day,actor,summary);
   INSERT INTO horacerta.audit(actor_id,action,after_value) VALUES(actor,'Mês fechado',jsonb_build_object('month',first_day)||summary);
   RETURN jsonb_build_object('ok',true,'month',first_day);
 ELSIF action='reopen' THEN
   IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Informe o motivo da reabertura (mínimo de 10 caracteres).'; END IF;
   DELETE FROM horacerta.month_closings WHERE month=first_day RETURNING to_jsonb(month_closings) INTO summary;
   IF summary IS NULL THEN RAISE EXCEPTION 'Este mês não está fechado.'; END IF;
   INSERT INTO horacerta.audit(actor_id,action,before_value,after_value) VALUES(actor,'Mês reaberto',summary,jsonb_build_object('month',first_day,'reason',trim(p_reason)));
   RETURN jsonb_build_object('ok',true,'month',first_day);
 END IF;
 RAISE EXCEPTION 'Ação inválida.';
END $$;
-- statement-break
-- Notificações passam a ter tipo: designação (existente) e lembrete de horas após concluir a OS.
ALTER TABLE horacerta.push_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'assigned';
-- statement-break
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='push_jobs_kind' AND conrelid='horacerta.push_jobs'::regclass) THEN
   ALTER TABLE horacerta.push_jobs ADD CONSTRAINT push_jobs_kind CHECK(kind IN ('assigned','hours'));
 END IF;
 ALTER TABLE horacerta.push_jobs DROP CONSTRAINT IF EXISTS push_jobs_order_id_subscription_id_key;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='push_jobs_order_subscription_kind' AND conrelid='horacerta.push_jobs'::regclass) THEN
   ALTER TABLE horacerta.push_jobs ADD CONSTRAINT push_jobs_order_subscription_kind UNIQUE(order_id,subscription_id,kind);
 END IF;
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.queue_hours_reminder(p_order uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE queued integer;
BEGIN
 INSERT INTO horacerta.push_jobs(order_id,user_id,subscription_id,kind)
 SELECT o.id,s.user_id,s.id,'hours' FROM horacerta.orders o
 JOIN horacerta.push_subscriptions s ON s.user_id=ANY(o.members)
 JOIN horacerta.sessions session ON session.token_hash=s.session_hash AND session.expires_at>now()
 JOIN horacerta.users u ON u.id=s.user_id AND u.active
 WHERE o.id=p_order AND NOT EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.order_id=o.id AND e.user_id=s.user_id AND e.deleted_at IS NULL)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS queued = ROW_COUNT;
 RETURN queued;
END $$;
