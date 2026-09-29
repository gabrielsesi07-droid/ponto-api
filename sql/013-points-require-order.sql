-- Legacy entry point cannot create new unlinked timers.
CREATE OR REPLACE FUNCTION horacerta.clock_start(p_user uuid,p_started_at timestamptz,p_company text,p_service text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Selecione a OS deste trabalho. Não é possível iniciar um ponto avulso.';
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.clock_start_for_order(p_user uuid,p_order uuid,p_started_at timestamptz,p_notes text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u horacerta.users%ROWTYPE;
 o horacerta.orders%ROWTYPE;
 current_time_value timestamptz := clock_timestamp();
 start_time_value timestamptz := date_trunc('minute',coalesce(p_started_at,current_time_value));
 current_rules jsonb;
 local_day date := (start_time_value AT TIME ZONE 'America/Sao_Paulo')::date;
 local_time time := (start_time_value AT TIME ZONE 'America/Sao_Paulo')::time;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF p_order IS NULL THEN RAISE EXCEPTION 'Selecione a OS deste trabalho.'; END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF NOT p_user=ANY(o.members) THEN RAISE EXCEPTION 'Você não está designado para esta OS.'; END IF;
 IF o.status NOT IN ('Agendada','Em andamento') THEN RAISE EXCEPTION 'Esta OS já está encerrada. Use a marcação manual para um serviço esquecido.'; END IF;
 IF local_day<(o.starts_at AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'O ponto não pode começar antes do dia agendado da OS.'; END IF;
 SELECT * INTO u FROM horacerta.users WHERE id=p_user AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 SELECT rules INTO current_rules FROM horacerta.settings WHERE id=1;
 IF local_day<>(current_time_value AT TIME ZONE 'America/Sao_Paulo')::date AND NOT (current_rules->>'allow_retro')::boolean THEN
   RAISE EXCEPTION 'Ajustes de data anteriores estão desabilitados.';
 END IF;
 IF start_time_value<current_time_value-interval '7 days' THEN RAISE EXCEPTION 'O início do serviço pode ser ajustado em até 7 dias.'; END IF;
 IF start_time_value>current_time_value+interval '5 minutes' THEN RAISE EXCEPTION 'O horário de início não pode estar no futuro.'; END IF;
 IF EXISTS(SELECT 1 FROM horacerta.timers WHERE user_id=p_user) THEN RAISE EXCEPTION 'Já existe um serviço em andamento.'; END IF;
 IF EXISTS(SELECT 1 FROM horacerta.entries WHERE user_id=p_user AND deleted_at IS NULL AND "end" IS NULL) THEN RAISE EXCEPTION 'Finalize a saída do registro em aberto antes de iniciar.'; END IF;
 IF EXISTS(SELECT 1 FROM horacerta.entries WHERE user_id=p_user AND deleted_at IS NULL AND date>=local_day
     AND (date>local_day OR coalesce("end",'24:00'::time)>local_time)) THEN
   RAISE EXCEPTION 'Há horários lançados após o início informado. Revise os registros.';
 END IF;
 INSERT INTO horacerta.timers(user_id,order_id,started_at,company,service,notes,rate,rules)
 VALUES(p_user,o.id,start_time_value,o.client_name,o.title,trim(coalesce(p_notes,'')),u.hourly_rate,current_rules);
 RETURN jsonb_build_object('ok',true,'action','start','order_id',o.id);
END $$;
-- statement-break
-- Called inside the manual entry transaction, under the same lifecycle lock as OS actions.
CREATE OR REPLACE FUNCTION horacerta.point_entry_order(p_user uuid,p_order uuid,p_date date,p_end time,p_existing uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o horacerta.orders%ROWTYPE; old_entry horacerta.entries%ROWTYPE;
BEGIN
 IF p_existing IS NOT NULL THEN
   SELECT * INTO old_entry FROM horacerta.entries WHERE id=p_existing AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Marcação não encontrada ou já alterada.'; END IF;
   IF old_entry.order_id IS NOT NULL AND p_order IS DISTINCT FROM old_entry.order_id THEN RAISE EXCEPTION 'O vínculo desta marcação com a OS não pode ser removido ou trocado.'; END IF;
 END IF;
 IF p_order IS NULL THEN
   IF old_entry.id IS NULL THEN RAISE EXCEPTION 'Selecione a OS deste trabalho. Não é possível criar uma marcação avulsa.'; END IF;
   RETURN to_jsonb(old_entry); -- Only a pre-existing unlinked record can retain its history.
 END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF old_entry.order_id IS DISTINCT FROM o.id THEN
   IF NOT p_user=ANY(o.members) THEN RAISE EXCEPTION 'O colaborador não está designado para esta OS.'; END IF;
   IF p_date<(o.starts_at AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'A data do ponto não pode ser anterior ao dia agendado da OS.'; END IF;
 END IF;
 IF o.status IN ('Concluída','Cancelada') AND p_end IS NULL THEN RAISE EXCEPTION 'Para uma OS encerrada, informe a entrada e a saída do trabalho realizado.'; END IF;
 IF old_entry.order_id=o.id THEN RETURN to_jsonb(old_entry); END IF;
 RETURN jsonb_build_object('order_id',o.id,'client_id',o.client_id,'company',o.client_name,'service',o.title);
END $$;
