-- Alterações de previsão e correção de datas de viagem: sem recalcular pontos ou quilometragem.
-- Reaplicável. Nenhuma data existente é alterada pela migração.
CREATE OR REPLACE FUNCTION horacerta.order_reschedule(actor uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 o horacerta.orders%ROWTYPE;
 changed horacerta.orders%ROWTYPE;
 planned_start timestamptz := (p->>'starts_at')::timestamptz;
 planned_end timestamptz := (p->>'ends_at')::timestamptz;
 reason text := trim(coalesce(p->>'reason',''));
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF NOT EXISTS(SELECT 1 FROM horacerta.users WHERE id=actor AND active AND role='coordinator') THEN
   RAISE EXCEPTION 'Somente o coordenador pode alterar a previsão da OS.';
 END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF (p->>'version')::int IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'A OS foi atualizada. Reabra a previsão antes de alterar.'; END IF;
 IF o.status NOT IN ('Agendada','Em andamento') THEN RAISE EXCEPTION 'Somente OS abertas podem ser reprogramadas.'; END IF;
 IF planned_start IS NULL OR planned_end IS NULL OR NOT isfinite(planned_start) OR NOT isfinite(planned_end) OR planned_end<=planned_start THEN
   RAISE EXCEPTION 'A previsão de término deve ser após o início.';
 END IF;
 IF length(reason)<10 OR length(reason)>1000 THEN RAISE EXCEPTION 'Explique a alteração em 10 a 1000 caracteres.'; END IF;
 IF planned_start=o.starts_at AND planned_end=o.ends_at THEN RAISE EXCEPTION 'Altere o início ou o término previsto antes de salvar.'; END IF;
 -- A previsão não pode invalidar as datas de pontos que já existem nesta OS.
 IF EXISTS(SELECT 1 FROM horacerta.entries WHERE order_id=o.id AND deleted_at IS NULL AND work_type<>'travel' AND date<(planned_start AT TIME ZONE 'America/Sao_Paulo')::date)
   OR EXISTS(SELECT 1 FROM horacerta.timers WHERE order_id=o.id AND (started_at AT TIME ZONE 'America/Sao_Paulo')::date<(planned_start AT TIME ZONE 'America/Sao_Paulo')::date) THEN
   RAISE EXCEPTION 'O início previsto não pode ficar depois de horas já registradas nesta OS. Confira os pontos antes de reprogramar.';
 END IF;
 IF EXISTS(SELECT 1 FROM horacerta.orders x WHERE x.id<>o.id AND x.status IN ('Agendada','Em andamento')
   AND x.starts_at<planned_end AND x.ends_at>planned_start AND (x.members && o.members OR x.vehicle_id=o.vehicle_id)) THEN
   RAISE EXCEPTION 'Um colaborador ou veículo já está reservado nesse horário.';
 END IF;
 UPDATE horacerta.orders SET starts_at=planned_start,ends_at=planned_end,version=version+1 WHERE id=o.id RETURNING * INTO changed;
 INSERT INTO horacerta.audit(actor_id,action,before_value,after_value)
 VALUES(actor,'Previsão da OS alterada',to_jsonb(o),to_jsonb(changed)||jsonb_build_object('reason',reason));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail)
 VALUES(o.id,actor,'Previsão da OS alterada',
   to_char(o.starts_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' → '||to_char(planned_start AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||
   ' (início); '||to_char(o.ends_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' → '||to_char(planned_end AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' (término). Motivo: '||reason);
 RETURN jsonb_build_object('ok',true,'id',o.id,'version',changed.version);
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.trip_update_dates(actor uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 t horacerta.vehicle_trips%ROWTYPE;
 changed horacerta.vehicle_trips%ROWTYPE;
 actual_departure timestamptz := (p->>'departed_at')::timestamptz;
 actual_return timestamptz := (p->>'returned_at')::timestamptz;
 reason text := trim(coalesce(p->>'reason',''));
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF NOT EXISTS(SELECT 1 FROM horacerta.users WHERE id=actor AND active AND role='coordinator') THEN
   RAISE EXCEPTION 'Somente o coordenador pode corrigir datas de viagem.';
 END IF;
 PERFORM 1 FROM horacerta.orders WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 SELECT * INTO t FROM horacerta.vehicle_trips WHERE id=(p->>'trip_id')::uuid AND order_id=(p->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada nesta OS.'; END IF;
 IF (p->>'expected_departed_at')::timestamptz IS DISTINCT FROM t.departed_at OR (p->>'expected_returned_at')::timestamptz IS DISTINCT FROM t.returned_at THEN
   RAISE EXCEPTION 'A viagem foi atualizada. Reabra as datas antes de corrigir.';
 END IF;
 IF actual_departure IS NULL OR NOT isfinite(actual_departure) OR (actual_return IS NOT NULL AND NOT isfinite(actual_return)) OR actual_departure>now() OR actual_return>now() THEN
   RAISE EXCEPTION 'Informe quando a viagem realmente aconteceu, sem datas futuras.';
 END IF;
 IF (t.return_km IS NULL)<>(actual_return IS NULL) THEN RAISE EXCEPTION 'A correção de data deve manter a situação atual da viagem. Use Registrar retorno para encerrar.'; END IF;
 IF actual_return<actual_departure THEN RAISE EXCEPTION 'O retorno não pode ser anterior à saída.'; END IF;
 IF length(reason)<10 OR length(reason)>1000 THEN RAISE EXCEPTION 'Explique a alteração em 10 a 1000 caracteres.'; END IF;
 IF actual_departure=t.departed_at AND actual_return IS NOT DISTINCT FROM t.returned_at THEN RAISE EXCEPTION 'Altere uma data da viagem antes de salvar.'; END IF;
 -- Datas corrigidas respeitam a sequência de viagens e a evolução do painel do mesmo veículo.
 IF EXISTS(SELECT 1 FROM horacerta.vehicle_trips x WHERE x.vehicle_id=t.vehicle_id AND x.id<>t.id AND (
   (x.departed_at<actual_departure AND (x.returned_at IS NULL OR x.returned_at>actual_departure OR x.return_km>t.departure_km)) OR
   (x.departed_at>=actual_departure AND (actual_return IS NULL OR actual_return>x.departed_at OR coalesce(t.return_km,t.departure_km)>x.departure_km)))) THEN
   RAISE EXCEPTION 'Essas datas conflitam com outra viagem ou com a sequência de quilometragem deste veículo.';
 END IF;
 UPDATE horacerta.vehicle_trips SET departed_at=actual_departure,returned_at=actual_return WHERE id=t.id RETURNING * INTO changed;
 INSERT INTO horacerta.audit(actor_id,action,before_value,after_value)
 VALUES(actor,'Datas de viagem corrigidas',to_jsonb(t),to_jsonb(changed)||jsonb_build_object('reason',reason));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail)
 VALUES(t.order_id,actor,'Datas de viagem corrigidas','Viagem '||t.id::text||': saída '||to_char(t.departed_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' → '||
   to_char(actual_departure AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'; retorno '||coalesce(to_char(t.returned_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'pendente')||' → '||
   coalesce(to_char(actual_return AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'pendente')||'. Motivo: '||reason);
 RETURN jsonb_build_object('ok',true,'id',t.order_id,'trip_id',t.id);
END $$;
