CREATE OR REPLACE FUNCTION horacerta.order_action(actor uuid, action text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u horacerta.users%ROWTYPE;
 o horacerta.orders%ROWTYPE;
 v horacerta.vehicles%ROWTYPE;
 t horacerta.vehicle_trips%ROWTYPE;
 target uuid := coalesce((p->>'id')::uuid,gen_random_uuid());
 team uuid[];
 selected_models uuid[];
 client_label text;
 km integer;
 detail_value text := '';
 result jsonb;
BEGIN
 -- Serializes scheduling, odometer changes and lifecycle transitions across all API instances.
 PERFORM pg_advisory_xact_lock(2849061701);
 SELECT * INTO u FROM horacerta.users WHERE id=actor AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 IF action IN ('save_order','save_vehicle','save_client') AND u.role<>'coordinator' THEN
   RAISE EXCEPTION 'Somente o coordenador pode realizar este cadastro.';
 END IF;
 IF action='save_client' THEN
   IF p ? 'id' AND NOT EXISTS(SELECT 1 FROM horacerta.clients WHERE id=target) THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
   INSERT INTO horacerta.clients(id,name,address,contact,phone,notes,active)
   VALUES(target,p->>'name',p->>'address',p->>'contact',p->>'phone',p->>'notes',(p->>'active')::boolean)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,contact=excluded.contact,phone=excluded.phone,notes=excluded.notes,active=excluded.active;
   RETURN jsonb_build_object('ok',true,'id',target);
 END IF;
 IF action='save_vehicle' THEN
   SELECT * INTO v FROM horacerta.vehicles WHERE id=target FOR UPDATE;
   IF p ? 'id' AND (v.id IS NULL OR v.version<>(p->>'version')::int) THEN RAISE EXCEPTION 'Veículo atualizado. Reabra o formulário.'; END IF;
   IF v.id IS NOT NULL AND (p->>'odometer')::int<>v.odometer THEN RAISE EXCEPTION 'O km de um veículo cadastrado é atualizado pelas viagens da OS.'; END IF;
   IF NOT (p->>'active')::boolean AND EXISTS(SELECT 1 FROM horacerta.orders WHERE vehicle_id=target AND status IN ('Agendada','Em andamento')) THEN RAISE EXCEPTION 'Há OS abertas para este veículo. Reagende ou encerre antes de desativá-lo.'; END IF;
   INSERT INTO horacerta.vehicles(id,plate,model,odometer,maintenance_km,active,notes)
   VALUES(target,p->>'plate',p->>'model',(p->>'odometer')::int,(p->>'maintenance_km')::int,(p->>'active')::boolean,p->>'notes')
   ON CONFLICT(id) DO UPDATE SET plate=excluded.plate,model=excluded.model,maintenance_km=excluded.maintenance_km,active=excluded.active,notes=excluded.notes,version=horacerta.vehicles.version+1;
   RETURN jsonb_build_object('ok',true,'id',target);
 END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=target FOR UPDATE;
 IF action='save_order' THEN
   IF p ? 'id' AND (o.id IS NULL OR o.version<>(p->>'version')::int) THEN RAISE EXCEPTION 'OS atualizada por outra pessoa. Reabra o formulário.'; END IF;
   IF o.id IS NOT NULL AND (o.status<>'Agendada' OR EXISTS(SELECT 1 FROM horacerta.vehicle_trips WHERE order_id=target)) THEN RAISE EXCEPTION 'Só é possível editar uma OS antes do início do atendimento.'; END IF;
   SELECT array_agg(value::uuid) INTO team FROM jsonb_array_elements_text(p->'members');
   SELECT coalesce(array_agg(DISTINCT value::uuid),'{}'::uuid[]) INTO selected_models FROM jsonb_array_elements_text(coalesce(p->'model_ids','[]'::jsonb));
   IF EXISTS(SELECT 1 FROM unnest(selected_models) AS selected(model_id) WHERE NOT EXISTS(SELECT 1 FROM horacerta.equipment_models m WHERE m.id=selected.model_id AND (m.status='published' OR m.id=ANY(coalesce(o.model_ids,'{}'::uuid[]))))) THEN RAISE EXCEPTION 'Valide os modelos na Biblioteca antes de vinculá-los à OS.'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(team) AS assigned(user_id) WHERE NOT EXISTS(SELECT 1 FROM horacerta.users x WHERE x.id=assigned.user_id AND x.active)) THEN RAISE EXCEPTION 'Selecione apenas colaboradores ativos.'; END IF;
   IF p->>'client_id' IS NOT NULL THEN
     SELECT name INTO client_label FROM horacerta.clients WHERE id=(p->>'client_id')::uuid AND active;
     IF NOT FOUND THEN RAISE EXCEPTION 'Cliente indisponível. Informe apenas o nome ou escolha outro cadastro.'; END IF;
     -- Retain the recorded name when editing an existing linked OS.
     client_label := coalesce(nullif(trim(p->>'client_name'),''),client_label);
   ELSE
     client_label := trim(coalesce(p->>'client_name',''));
   END IF;
   IF length(client_label)<2 OR length(client_label)>160 THEN RAISE EXCEPTION 'Informe o nome do cliente (2 a 160 caracteres).'; END IF;
   IF p->>'vehicle_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM horacerta.vehicles WHERE id=(p->>'vehicle_id')::uuid AND active) THEN RAISE EXCEPTION 'Selecione um veículo ativo.'; END IF;
   IF EXISTS(SELECT 1 FROM horacerta.orders x WHERE x.id<>target AND x.status IN ('Agendada','Em andamento')
     AND x.starts_at<(p->>'ends_at')::timestamptz AND x.ends_at>(p->>'starts_at')::timestamptz
     AND (x.members && team OR x.vehicle_id=(p->>'vehicle_id')::uuid)) THEN
     RAISE EXCEPTION 'Um colaborador ou veículo já está reservado nesse horário.';
   END IF;
   INSERT INTO horacerta.orders(id,title,client_id,client_name,address,place_id,contact,phone,starts_at,ends_at,members,vehicle_id,equipment,instructions,priority,created_by)
   VALUES(target,p->>'title',(p->>'client_id')::uuid,client_label,p->>'address',p->>'place_id',p->>'contact',p->>'phone',(p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,team,(p->>'vehicle_id')::uuid,p->>'equipment',p->>'instructions',p->>'priority',actor)
   ON CONFLICT(id) DO UPDATE SET title=excluded.title,client_id=excluded.client_id,client_name=excluded.client_name,address=excluded.address,place_id=excluded.place_id,contact=excluded.contact,phone=excluded.phone,starts_at=excluded.starts_at,ends_at=excluded.ends_at,members=excluded.members,vehicle_id=excluded.vehicle_id,equipment=excluded.equipment,instructions=excluded.instructions,priority=excluded.priority,version=horacerta.orders.version+1;
   INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) VALUES(target,actor,CASE WHEN o.id IS NULL THEN 'OS criada' ELSE 'OS reprogramada' END,p->>'title');
   UPDATE horacerta.orders SET model_ids=selected_models WHERE id=target;
   RETURN jsonb_build_object('ok',true,'id',target);
 END IF;
 IF o.id IS NULL THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF u.role<>'coordinator' AND NOT actor=ANY(o.members) THEN RAISE EXCEPTION 'Você não está designado para esta OS.'; END IF;
 IF action='ack' THEN
   INSERT INTO horacerta.order_acknowledgements VALUES(target,actor,o.version) ON CONFLICT(order_id,user_id) DO UPDATE SET version=excluded.version;
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF o.status IN ('Concluída','Cancelada') THEN RAISE EXCEPTION 'Esta OS já está encerrada.'; END IF;
 IF action IN ('depart','begin','start_clock') AND (now() AT TIME ZONE 'America/Sao_Paulo')::date<(o.starts_at AT TIME ZONE 'America/Sao_Paulo')::date THEN
   RAISE EXCEPTION 'Esta OS só pode começar a partir do dia agendado.';
 END IF;
 IF action='start_clock' THEN
   IF NOT actor=ANY(o.members) THEN RAISE EXCEPTION 'O ponto só pode ser iniciado por uma pessoa designada.'; END IF;
   result := horacerta.clock_start(actor,(p->>'started_at')::timestamptz,o.client_name,o.title,p->>'notes');
   UPDATE horacerta.timers SET order_id=target WHERE user_id=actor;
   UPDATE horacerta.orders SET status='Em andamento' WHERE id=target;
   INSERT INTO horacerta.order_events(order_id,actor_id,action) VALUES(target,actor,'Ponto iniciado');
   RETURN result;
 ELSIF action IN ('depart','return') THEN
   IF o.vehicle_id IS NULL THEN RAISE EXCEPTION 'Esta OS não possui veículo.'; END IF;
   SELECT * INTO v FROM horacerta.vehicles WHERE id=o.vehicle_id FOR UPDATE;
   km := (p->>'km')::int;
   IF km IS NULL OR km<0 OR km>9999999 OR km<v.odometer THEN RAISE EXCEPTION 'O km deve ser igual ou maior que o km atual do veículo.'; END IF;
   IF action='depart' THEN
     IF NOT v.active THEN RAISE EXCEPTION 'Veículo desativado.'; END IF;
     IF EXISTS(SELECT 1 FROM horacerta.vehicle_trips WHERE vehicle_id=v.id AND return_km IS NULL) THEN RAISE EXCEPTION 'Este veículo já está em viagem. Registre o retorno primeiro.'; END IF;
     INSERT INTO horacerta.vehicle_trips(order_id,vehicle_id,departure_km,departed_by) VALUES(target,v.id,km,actor);
     UPDATE horacerta.orders SET status='Em andamento' WHERE id=target;
   ELSE
     SELECT * INTO t FROM horacerta.vehicle_trips WHERE order_id=target AND vehicle_id=v.id AND return_km IS NULL FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Não há saída aberta para esta OS.'; END IF;
     IF km<t.departure_km THEN RAISE EXCEPTION 'O retorno não pode ser menor que a saída.'; END IF;
     UPDATE horacerta.vehicle_trips SET return_km=km,returned_at=now(),returned_by=actor WHERE id=t.id;
   END IF;
   UPDATE horacerta.vehicles SET odometer=km,version=version+1 WHERE id=v.id;
   detail_value := km::text || ' km';
 ELSIF action='begin' THEN
   IF o.status<>'Agendada' THEN RAISE EXCEPTION 'O atendimento já foi iniciado.'; END IF;
   UPDATE horacerta.orders SET status='Em andamento' WHERE id=target;
 ELSIF action IN ('finish','cancel') THEN
   IF action='cancel' AND u.role<>'coordinator' THEN RAISE EXCEPTION 'Somente o coordenador pode cancelar a OS.'; END IF;
   IF EXISTS(SELECT 1 FROM horacerta.vehicle_trips WHERE order_id=target AND return_km IS NULL) THEN RAISE EXCEPTION 'Registre o km de retorno antes de encerrar a OS.'; END IF;
   IF EXISTS(SELECT 1 FROM horacerta.timers WHERE order_id=target) THEN RAISE EXCEPTION 'Há pontos em andamento nesta OS. Cada pessoa precisa encerrar seu ponto.'; END IF;
   IF action='finish' AND o.status<>'Em andamento' THEN RAISE EXCEPTION 'Inicie o atendimento antes de concluir.'; END IF;
   IF length(trim(coalesce(p->>'notes','')))<3 THEN RAISE EXCEPTION 'Descreva o resultado ou motivo do encerramento.'; END IF;
   UPDATE horacerta.orders SET status=CASE WHEN action='finish' THEN 'Concluída' ELSE 'Cancelada' END,completion=p->>'notes' WHERE id=target;
   detail_value := p->>'notes';
 ELSE RAISE EXCEPTION 'Ação inválida.';
 END IF;
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) VALUES(target,actor,
   CASE action WHEN 'depart' THEN 'Saída do veículo' WHEN 'return' THEN 'Retorno do veículo' WHEN 'begin' THEN 'Atendimento iniciado' WHEN 'finish' THEN 'OS concluída' ELSE 'OS cancelada' END,detail_value);
 RETURN jsonb_build_object('ok',true,'id',target);
END $$;
