CREATE OR REPLACE FUNCTION horacerta.checklist_action(actor uuid,action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u horacerta.users%ROWTYPE;o horacerta.orders%ROWTYPE;c horacerta.order_checklists%ROWTYPE;
 t horacerta.checklist_templates%ROWTYPE;m horacerta.equipment_models%ROWTYPE;d horacerta.library_documents%ROWTYPE;
 target uuid := (p->>'id')::uuid;added integer;event text;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 SELECT * INTO u FROM horacerta.users WHERE id=actor AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível.'; END IF;
 IF action='save_template' THEN
  IF u.role<>'coordinator' THEN RAISE EXCEPTION 'Somente o coordenador configura modelos.'; END IF;
  SELECT * INTO m FROM horacerta.equipment_models WHERE id=(p->>'model_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipamento não encontrado.'; END IF;
  SELECT * INTO t FROM horacerta.checklist_templates WHERE model_id=m.id FOR UPDATE;
  IF (t.id IS NOT NULL AND t.version<>(p->>'version')::int) OR (t.id IS NULL AND (p->>'version')::int<>0) THEN RAISE EXCEPTION 'Modelo atualizado. Reabra antes de salvar.'; END IF;
  IF p->>'source_document_id' IS NOT NULL THEN
   SELECT * INTO d FROM horacerta.library_documents WHERE id=(p->>'source_document_id')::uuid AND ready AND category='checklist';
   IF NOT FOUND THEN RAISE EXCEPTION 'Documento de origem indisponível.'; END IF;
   IF d.obsolete AND p->>'status'='active' THEN RAISE EXCEPTION 'Documento obsoleto não pode originar um checklist ativo.'; END IF;
  END IF;
  IF p->>'status'='active' AND jsonb_array_length(p->'items')=0 THEN RAISE EXCEPTION 'Inclua ao menos um item antes de ativar.'; END IF;
  INSERT INTO horacerta.checklist_templates(model_id,title,items,source_document_id,source_name,source_hash,status,updated_by)
  VALUES(m.id,p->>'title',p->'items',d.id,coalesce(d.name,''),coalesce(d.sha256,''),p->>'status',actor)
  ON CONFLICT(model_id) DO UPDATE SET title=excluded.title,items=excluded.items,source_document_id=excluded.source_document_id,source_name=excluded.source_name,source_hash=excluded.source_hash,status=excluded.status,version=horacerta.checklist_templates.version+1,updated_by=actor,updated_at=now() RETURNING * INTO t;
  -- The UI explicitly asks to activate the checklist AND validate this catalogue model.
  IF t.status='active' THEN UPDATE horacerta.equipment_models SET status='published',version=version+1,updated_at=now() WHERE id=m.id AND status<>'published'; END IF;
  INSERT INTO horacerta.checklist_history(template_id,actor_id,action,snapshot) VALUES(t.id,actor,'Modelo '||t.status,to_jsonb(t));
  RETURN jsonb_build_object('ok',true,'id',t.id,'version',t.version);
 END IF;
 IF action IN ('sync','custom') THEN
  IF u.role<>'coordinator' THEN RAISE EXCEPTION 'Somente o coordenador vincula checklists.'; END IF;
  SELECT * INTO o FROM horacerta.orders WHERE id=(p->>'order_id')::uuid FOR UPDATE;
 ELSE
  SELECT * INTO c FROM horacerta.order_checklists WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checklist não encontrado.'; END IF;
  SELECT * INTO o FROM horacerta.orders WHERE id=c.order_id FOR UPDATE;
 END IF;
 IF o.id IS NULL THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF u.role<>'coordinator' AND NOT actor=ANY(o.members) THEN RAISE EXCEPTION 'Você não está designado para esta OS.'; END IF;
 IF o.status NOT IN ('Agendada','Em andamento') THEN RAISE EXCEPTION 'OS encerrada: checklists disponíveis somente para consulta e impressão.'; END IF;
 IF action='sync' THEN
  added := horacerta.attach_order_checklists(o.id,actor);
  RETURN jsonb_build_object('ok',true,'added',added);
 ELSIF action='custom' THEN
  SELECT * INTO m FROM horacerta.equipment_models WHERE id=(p->>'model_id')::uuid AND id=ANY(o.model_ids);
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um equipamento desta OS.'; END IF;
  IF coalesce(jsonb_array_length(p->'items'),0)=0 THEN RAISE EXCEPTION 'Cadastre os itens antes de criar o checklist.'; END IF;
  INSERT INTO horacerta.order_checklists(order_id,model_id,model_name,title,items,updated_by)
  VALUES(o.id,m.id,m.name,p->>'title',p->'items',actor) ON CONFLICT(order_id,model_id) DO NOTHING RETURNING * INTO c;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Já existe checklist para este equipamento nesta OS.'; END IF;
  event := 'Checklist personalizado criado';
 ELSE
  IF NOT c.model_id=ANY(o.model_ids) THEN RAISE EXCEPTION 'Equipamento removido da OS. Checklist preservado somente para histórico.'; END IF;
  IF c.version<>(p->>'version')::int THEN RAISE EXCEPTION 'Outra pessoa atualizou este checklist. Reabra para não perder alterações.'; END IF;
  IF action='reopen' THEN
   IF u.role<>'coordinator' OR c.status<>'completed' THEN RAISE EXCEPTION 'Somente o coordenador reabre um checklist concluído.'; END IF;
   IF length(trim(coalesce(p->>'reason','')))<3 THEN RAISE EXCEPTION 'Informe o motivo da reabertura.'; END IF;
   UPDATE horacerta.order_checklists SET status='open',completed_at=NULL,completed_by=NULL,version=version+1,updated_at=now(),updated_by=actor WHERE id=c.id RETURNING * INTO c;
   event := 'Checklist reaberto: '||(p->>'reason');
  ELSIF action IN ('save','complete') THEN
   IF u.role<>'employee' OR NOT actor=ANY(o.members) THEN RAISE EXCEPTION 'A conferência deve ser realizada por um colaborador designado para esta OS.'; END IF;
   IF c.status<>'open' THEN RAISE EXCEPTION 'Checklist concluído. Peça a reabertura ao coordenador.'; END IF;
   IF coalesce(jsonb_array_length(p->'items'),0)=0 THEN RAISE EXCEPTION 'Mantenha ao menos um item no checklist.'; END IF;
   UPDATE horacerta.order_checklists SET title=p->>'title',items=p->'items',notes=p->>'notes',identification=p->>'identification',
    status=CASE WHEN action='complete' THEN 'completed' ELSE 'open' END,version=version+1,updated_at=now(),updated_by=actor,
    completed_at=CASE WHEN action='complete' THEN now() ELSE NULL END,completed_by=CASE WHEN action='complete' THEN actor ELSE NULL END
   WHERE id=c.id RETURNING * INTO c;
   event := CASE WHEN action='complete' THEN 'Checklist concluído' ELSE 'Checklist salvo' END;
  ELSE RAISE EXCEPTION 'Ação inválida.';
  END IF;
 END IF;
 INSERT INTO horacerta.checklist_history(checklist_id,actor_id,action,snapshot) VALUES(c.id,actor,event,to_jsonb(c));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) VALUES(o.id,actor,event,c.title);
 RETURN jsonb_build_object('ok',true,'id',c.id,'version',c.version);
END $$;
