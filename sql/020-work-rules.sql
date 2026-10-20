-- Regras v2: os snapshots dos pontos e cronômetros antigos são preservados.
ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS work_type text NOT NULL DEFAULT 'work';
ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS shift jsonb;
ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS break_start time;
-- statement-break
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='entries_work_type' AND conrelid='horacerta.entries'::regclass) THEN
  ALTER TABLE horacerta.entries ADD CONSTRAINT entries_work_type CHECK(work_type IN ('work','travel'));
 END IF;
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.recalculate_entries(actor uuid, p_month date, p_user uuid, p_rules jsonb, p_versions jsonb, p_rates jsonb, p_fill_missing boolean, p_reason text, p_use_shifts boolean DEFAULT false, p_shifts jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actual_versions jsonb; actual_rates jsonb; actual_shifts jsonb; affected integer; first_day date:=date_trunc('month',p_month)::date; last_day date:=(date_trunc('month',p_month)+interval '1 month -1 day')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF NOT EXISTS(SELECT 1 FROM horacerta.users WHERE id=actor AND active AND role='coordinator') THEN RAISE EXCEPTION 'Somente o coordenador pode recalcular pontos.'; END IF;
 IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Informe o motivo do recálculo (mínimo de 10 caracteres).'; END IF;
 IF EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month=first_day) THEN RAISE EXCEPTION 'Reabra o mês antes de recalcular.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM horacerta.settings WHERE id=1 AND rules=p_rules AND (rules->>'calculation_version')::int=2) THEN RAISE EXCEPTION 'As regras mudaram. Confira uma nova prévia.'; END IF;
 PERFORM id FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL AND (p_user IS NULL OR user_id=p_user) FOR UPDATE;
 SELECT coalesce(jsonb_object_agg(id::text,version),'{}') INTO actual_versions FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL AND (p_user IS NULL OR user_id=p_user);
 IF actual_versions<>p_versions THEN RAISE EXCEPTION 'Os registros mudaram. Confira uma nova prévia.'; END IF;
 IF p_fill_missing THEN
  PERFORM id FROM horacerta.users ORDER BY id FOR SHARE;
  SELECT jsonb_object_agg(id::text,hourly_rate) INTO actual_rates FROM horacerta.users;
  IF actual_rates<>p_rates THEN RAISE EXCEPTION 'Os valores-hora mudaram. Confira uma nova prévia.'; END IF;
 END IF;
 IF p_use_shifts THEN
  SELECT coalesce(jsonb_object_agg(e.id::text,s.shift),'{}') INTO actual_shifts FROM horacerta.entries e JOIN horacerta.order_shifts s ON s.order_id=e.order_id AND s.user_id=e.user_id AND s.work_type=e.work_type WHERE e.date BETWEEN first_day AND last_day AND e.deleted_at IS NULL AND (p_user IS NULL OR e.user_id=p_user);
  IF actual_shifts<>p_shifts THEN RAISE EXCEPTION 'Os turnos mudaram. Confira uma nova prévia.'; END IF;
 END IF;
 WITH old AS MATERIALIZED (
  SELECT * FROM horacerta.entries WHERE date BETWEEN first_day AND last_day AND deleted_at IS NULL AND (p_user IS NULL OR user_id=p_user)
 ), changed AS (
  UPDATE horacerta.entries e SET rules=p_rules,
   shift=CASE WHEN p_use_shifts THEN coalesce(p_shifts->e.id::text,e.shift) ELSE e.shift END,
   rate=CASE WHEN p_fill_missing AND e.rate=0 THEN greatest(0,coalesce((p_rates->>e.user_id::text)::numeric,0)) ELSE e.rate END,
   status=CASE WHEN e."end" IS NULL OR (p_rules->>'approval_required')::boolean THEN 'Pendente' ELSE 'Aprovado' END,
   version=e.version+1,updated_at=now() FROM old WHERE e.id=old.id RETURNING e.*
 )
 INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value)
 SELECT actor,changed.id,'Recálculo de horas',to_jsonb(old),to_jsonb(changed)||jsonb_build_object('reason',p_reason) FROM changed JOIN old USING(id);
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'updated',affected);
END $$;
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.order_shifts (
 order_id uuid NOT NULL REFERENCES horacerta.orders(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES horacerta.users(id),
 work_type text NOT NULL CHECK(work_type IN ('work','travel')),
 shift jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 locked_at timestamptz NOT NULL DEFAULT now(), locked_by uuid NOT NULL REFERENCES horacerta.users(id),
 PRIMARY KEY(order_id,user_id,work_type)
);
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.order_shift_save(actor uuid, p_order uuid, p_user uuid, p_type text, p_shift jsonb, p_version integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u horacerta.users%ROWTYPE; o horacerta.orders%ROWTYPE; old horacerta.order_shifts%ROWTYPE; changed horacerta.order_shifts%ROWTYPE;
 s time; e time; bs time; be time;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 SELECT * INTO u FROM horacerta.users WHERE id=actor AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 IF actor<>p_user AND u.role<>'coordinator' THEN RAISE EXCEPTION 'Confirme somente seu próprio turno.'; END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR NOT p_user=ANY(o.members) THEN RAISE EXCEPTION 'Colaborador não designado para esta OS.'; END IF;
 IF o.status='Cancelada' THEN RAISE EXCEPTION 'Não é possível confirmar turno em OS cancelada.'; END IF;
 IF p_type NOT IN ('work','travel') THEN RAISE EXCEPTION 'Tipo de jornada inválido.'; END IF;
 s:=(p_shift->>'start')::time; e:=(p_shift->>'end')::time; bs:=(p_shift->>'break_start')::time; be:=(p_shift->>'break_end')::time;
 IF s IS NULL OR e IS NULL OR bs IS NULL OR be IS NULL OR s>=e OR bs<s OR be>e OR bs>be OR (e-s)<=(be-bs) THEN RAISE EXCEPTION 'Confira o turno e o intervalo previsto.'; END IF;
 SELECT * INTO old FROM horacerta.order_shifts WHERE order_id=p_order AND user_id=p_user AND work_type=p_type FOR UPDATE;
 IF old.order_id IS NOT NULL THEN
  IF u.role<>'coordinator' THEN RAISE EXCEPTION 'Seu turno já está confirmado. Peça ao coordenador uma correção justificada.'; END IF;
  IF p_version IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'O turno já foi alterado. Atualize a tela.'; END IF;
  IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Informe o motivo da correção do turno (mínimo de 10 caracteres).'; END IF;
 END IF;
 INSERT INTO horacerta.order_shifts(order_id,user_id,work_type,shift,locked_by) VALUES(p_order,p_user,p_type,p_shift,actor)
 ON CONFLICT(order_id,user_id,work_type) DO UPDATE SET shift=excluded.shift,version=order_shifts.version+1,locked_at=now(),locked_by=actor RETURNING * INTO changed;
 INSERT INTO horacerta.audit(actor_id,action,before_value,after_value) VALUES(actor,'Turno da OS',CASE WHEN old.order_id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(changed)||jsonb_build_object('reason',trim(coalesce(p_reason,''))));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) VALUES(p_order,actor,'Turno confirmado',p_type||' · '||(SELECT name FROM horacerta.users WHERE id=p_user)||' · '||s::text||'–'||e::text||CASE WHEN old.order_id IS NULL THEN '' ELSE ' · '||p_reason END);
 RETURN jsonb_build_object('ok',true,'version',changed.version);
END $$;
-- statement-break
-- Resolvido dentro da transação do ponto: o cliente não pode escolher um turno arbitrário.
CREATE OR REPLACE FUNCTION horacerta.point_entry_order_for_type(p_user uuid,p_order uuid,p_date date,p_end time,p_existing uuid,p_type text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE checked_day date:=p_date;
BEGIN
 -- A ida pode anteceder a previsão do atendimento; a data real continua sendo a do INSERT.
 IF p_type='travel' THEN
  SELECT greatest(p_date,(starts_at AT TIME ZONE 'America/Sao_Paulo')::date) INTO checked_day FROM horacerta.orders WHERE id=p_order;
 END IF;
 RETURN horacerta.point_entry_order(p_user,p_order,coalesce(checked_day,p_date),p_end,p_existing);
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.point_entry_context(actor uuid, p_user uuid, p_existing uuid, p_date date, p_start time, p_end time, p_break integer, p_mode text, p_break_start time)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u horacerta.users%ROWTYPE; owner horacerta.users%ROWTYPE; old horacerta.entries%ROWTYPE; current_rules jsonb; saved_rules jsonb; local_today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 SELECT * INTO u FROM horacerta.users WHERE id=actor AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 SELECT * INTO owner FROM horacerta.users WHERE id=p_user AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador inativo ou inexistente.'; END IF;
 IF (u.role<>'coordinator' AND actor<>p_user) OR (p_existing IS NULL AND actor<>p_user) THEN RAISE EXCEPTION 'Novas marcações pertencem sempre à pessoa conectada.'; END IF;
 SELECT rules INTO current_rules FROM horacerta.settings WHERE id=1;
 IF p_existing IS NOT NULL THEN
  SELECT * INTO old FROM horacerta.entries WHERE id=p_existing AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já alterado.'; END IF;
  IF u.role<>'coordinator' AND (NOT u.can_edit OR (old.status='Aprovado' AND (current_rules->>'approval_required')::boolean)) THEN RAISE EXCEPTION 'Este lançamento não pode ser editado por você.'; END IF;
 END IF;
 IF p_date>local_today THEN RAISE EXCEPTION 'Informe uma data válida, até hoje.'; END IF;
 IF u.role<>'coordinator' AND NOT (current_rules->>'allow_retro')::boolean AND (p_date<>local_today OR (old.id IS NOT NULL AND old.date<>local_today)) THEN RAISE EXCEPTION 'Lançamentos e edições retroativas estão desabilitados.'; END IF;
 saved_rules:=coalesce(old.rules,current_rules);
 IF (saved_rules->>'calculation_version')::int=2 AND p_mode='custom' AND p_break>0 AND (p_break_start IS NULL OR p_break_start<p_start OR extract(epoch FROM p_break_start)/60+p_break>extract(epoch FROM p_end)/60) THEN RAISE EXCEPTION 'Informe o início real do intervalo dentro da jornada.'; END IF;
 RETURN jsonb_build_object('rules',saved_rules,'rate',coalesce(old.rate,owner.hourly_rate),'status',CASE WHEN p_end IS NULL OR (current_rules->>'approval_required')::boolean THEN 'Pendente' ELSE 'Aprovado' END);
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.point_entry_shift(p_user uuid, p_order uuid, p_type text, p_rules jsonb, p_existing uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE old horacerta.entries%ROWTYPE; saved jsonb;
BEGIN
 IF coalesce((p_rules->>'calculation_version')::int,1)<>2 THEN RETURN NULL; END IF;
 IF p_existing IS NOT NULL THEN
  SELECT * INTO old FROM horacerta.entries WHERE id=p_existing AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF old.work_type=p_type AND old.shift IS NOT NULL THEN RETURN old.shift; END IF;
 END IF;
 IF p_type='travel' AND coalesce(p_rules->>'travel_mode','daily')<>'shift' THEN RETURN NULL; END IF;
 SELECT shift INTO saved FROM horacerta.order_shifts WHERE order_id=p_order AND user_id=p_user AND work_type=p_type;
 IF saved IS NULL THEN RAISE EXCEPTION 'Confirme seu turno nesta OS antes de registrar as horas. Para deslocamento, selecione o tipo correto.'; END IF;
 RETURN saved;
END $$;
-- statement-break
DO $$ BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF EXISTS(SELECT 1 FROM horacerta.schema_migrations WHERE name='020-work-rules') THEN RETURN; END IF;
 UPDATE horacerta.settings SET rules=rules||jsonb_build_object(
  'calculation_version',2,'daily_minutes',480,'approval_required',false,'travel_mode','daily',
  'day_policies',jsonb_build_object(
   'weekday',jsonb_build_object('normal_minutes',480,'tiers',jsonb_build_array(jsonb_build_object('up_to_minutes',NULL,'bonus',coalesce((rules->>'weekday_bonus')::numeric,50)))),
   'saturday',jsonb_build_object('normal_minutes',480,'tiers',jsonb_build_array(jsonb_build_object('up_to_minutes',180,'bonus',60),jsonb_build_object('up_to_minutes',NULL,'bonus',100))),
   'sunday',jsonb_build_object('normal_minutes',0,'tiers',jsonb_build_array(jsonb_build_object('up_to_minutes',NULL,'bonus',100))),
   'holiday',jsonb_build_object('normal_minutes',0,'tiers',jsonb_build_array(jsonb_build_object('up_to_minutes',NULL,'bonus',coalesce((rules->>'holiday_bonus')::numeric,100))))
  )) WHERE id=1 AND coalesce((rules->>'calculation_version')::int,1)<>2;
 INSERT INTO horacerta.schema_migrations(name) VALUES('020-work-rules');
END $$;
