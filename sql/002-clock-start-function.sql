CREATE OR REPLACE FUNCTION horacerta.clock_start(
 p_user uuid,
 p_started_at timestamptz,
 p_company text,
 p_service text,
 p_notes text
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u horacerta.users%ROWTYPE;
 current_time_value timestamptz := clock_timestamp();
 start_time_value timestamptz := date_trunc('minute',coalesce(p_started_at,current_time_value));
 current_rules jsonb;
 local_day date := (start_time_value AT TIME ZONE 'America/Sao_Paulo')::date;
 local_time time := (start_time_value AT TIME ZONE 'America/Sao_Paulo')::time;
BEGIN
 SELECT * INTO u FROM horacerta.users WHERE id=p_user AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 SELECT rules INTO current_rules FROM horacerta.settings WHERE id=1;
 IF local_day<>(current_time_value AT TIME ZONE 'America/Sao_Paulo')::date AND NOT (current_rules->>'allow_retro')::boolean THEN
   RAISE EXCEPTION 'Ajustes de data anteriores estão desabilitados.';
 END IF;
 IF start_time_value<current_time_value-interval '7 days' THEN
   RAISE EXCEPTION 'O início do serviço pode ser ajustado em até 7 dias.';
 END IF;
 IF start_time_value>current_time_value+interval '5 minutes' THEN
   RAISE EXCEPTION 'O horário de início não pode estar no futuro.';
 END IF;
 IF length(trim(coalesce(p_company,'')))<2 THEN
   RAISE EXCEPTION 'Informe a empresa atendida.';
 END IF;
 IF length(trim(coalesce(p_service,'')))<2 THEN
   RAISE EXCEPTION 'Informe o serviço que será realizado.';
 END IF;
 IF EXISTS(SELECT 1 FROM horacerta.timers WHERE user_id=p_user) THEN
   RAISE EXCEPTION 'Já existe um serviço em andamento.';
 END IF;
 IF EXISTS(SELECT 1 FROM horacerta.entries WHERE user_id=p_user AND deleted_at IS NULL AND "end" IS NULL) THEN
   RAISE EXCEPTION 'Finalize a saída do registro em aberto antes de iniciar.';
 END IF;
 IF EXISTS(
   SELECT 1 FROM horacerta.entries
   WHERE user_id=p_user AND deleted_at IS NULL AND date=local_day
     AND coalesce("end",'24:00'::time)>local_time
 ) THEN
   RAISE EXCEPTION 'Há horários lançados após o início informado. Revise os registros.';
 END IF;
 INSERT INTO horacerta.timers(user_id,started_at,company,service,notes,rate,rules)
 VALUES(p_user,start_time_value,trim(p_company),trim(p_service),trim(coalesce(p_notes,'')),u.hourly_rate,current_rules);
 RETURN jsonb_build_object('ok',true,'action','start');
END $$;
