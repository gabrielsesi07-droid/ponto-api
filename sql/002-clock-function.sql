CREATE OR REPLACE FUNCTION horacerta.clock_action(p_user uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 t horacerta.timers%ROWTYPE;
 u horacerta.users%ROWTYPE;
 current_time_value timestamptz := clock_timestamp();
 current_rules jsonb;
 day_value date;
 first_day date;
 final_day date;
 segment_start timestamptz;
 segment_end timestamptz;
 midnight_value timestamptz;
 break_value integer;
 end_value time;
 entry_id uuid;
 total_records integer := 0;
BEGIN
 IF p_action='start' THEN
   RETURN horacerta.clock_start(p_user,current_time_value,'Empresa não informada','Serviço técnico','');
 END IF;
 SELECT * INTO u FROM horacerta.users WHERE id=p_user AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 SELECT rules INTO current_rules FROM horacerta.settings WHERE id=1;
 SELECT * INTO t FROM horacerta.timers WHERE user_id=p_user;
 IF t.user_id IS NULL THEN RAISE EXCEPTION 'Não há serviço em andamento.'; END IF;
 IF p_action='pause' THEN
   IF t.paused_at IS NOT NULL THEN RAISE EXCEPTION 'O serviço já está pausado.'; END IF;
   UPDATE horacerta.timers SET paused_at=current_time_value WHERE user_id=p_user;
   RETURN jsonb_build_object('ok',true,'action','pause');
 END IF;
 IF p_action='resume' THEN
   IF t.paused_at IS NULL THEN RAISE EXCEPTION 'O serviço não está pausado.'; END IF;
   UPDATE horacerta.timers SET pauses=pauses||jsonb_build_array(jsonb_build_object('start',paused_at,'end',current_time_value)),paused_at=NULL WHERE user_id=p_user;
   RETURN jsonb_build_object('ok',true,'action','resume');
 END IF;
 IF p_action<>'stop' THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 -- Point records have minute precision; the live timer keeps exact seconds.
 current_time_value := date_trunc('minute',current_time_value);
 t.started_at := date_trunc('minute',t.started_at);
 t.paused_at := date_trunc('minute',t.paused_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object('start',date_trunc('minute',(p->>'start')::timestamptz),'end',date_trunc('minute',(p->>'end')::timestamptz))),'[]'::jsonb) INTO t.pauses FROM jsonb_array_elements(t.pauses) p;
 IF t.paused_at IS NOT NULL THEN
   t.pauses := t.pauses||jsonb_build_array(jsonb_build_object('start',t.paused_at,'end',current_time_value));
 END IF;
 first_day := (t.started_at AT TIME ZONE 'America/Sao_Paulo')::date;
 final_day := (current_time_value AT TIME ZONE 'America/Sao_Paulo')::date;
 FOR day_value IN SELECT generate_series(first_day,final_day,'1 day'::interval)::date LOOP
   midnight_value := day_value::timestamp AT TIME ZONE 'America/Sao_Paulo';
   segment_start := greatest(t.started_at,midnight_value);
   segment_end := least(current_time_value,(day_value+1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
   IF segment_end<=segment_start AND first_day<>final_day THEN CONTINUE; END IF;
   SELECT coalesce(sum(greatest(0,extract(epoch FROM (least((pause->>'end')::timestamptz,segment_end)-greatest((pause->>'start')::timestamptz,segment_start))))/60),0)::integer INTO break_value FROM jsonb_array_elements(t.pauses) pause;
   end_value := CASE WHEN segment_end=(day_value+1)::timestamp AT TIME ZONE 'America/Sao_Paulo' THEN '24:00'::time ELSE (segment_end AT TIME ZONE 'America/Sao_Paulo')::time END;
   IF EXISTS(SELECT 1 FROM horacerta.entries WHERE user_id=p_user AND date=day_value AND deleted_at IS NULL AND start<end_value AND coalesce("end",'24:00'::time)>(segment_start AT TIME ZONE 'America/Sao_Paulo')::time) THEN
     RAISE EXCEPTION 'Há um registro sobreposto. Revise os horários antes de encerrar.';
   END IF;
   INSERT INTO horacerta.entries(user_id,client_id,date,start,"end",break_minutes,company,service,notes,status,rate,rules)
   VALUES(p_user,NULL,day_value,(segment_start AT TIME ZONE 'America/Sao_Paulo')::time,end_value,break_value,coalesce(nullif(trim(t.company),''),'Empresa não informada'),coalesce(nullif(trim(t.service),''),'Serviço técnico'),coalesce(t.notes,''),CASE WHEN (current_rules->>'approval_required')::boolean THEN 'Pendente' ELSE 'Aprovado' END,t.rate,t.rules)
   RETURNING id INTO entry_id;
   INSERT INTO horacerta.audit(actor_id,entry_id,action,after_value)
     SELECT p_user,id,'clock',to_jsonb(e) FROM horacerta.entries e WHERE id=entry_id;
   total_records:=total_records+1;
 END LOOP;
 DELETE FROM horacerta.timers WHERE user_id=p_user;
 RETURN jsonb_build_object('ok',true,'action','stop','records',total_records);
END $$;
