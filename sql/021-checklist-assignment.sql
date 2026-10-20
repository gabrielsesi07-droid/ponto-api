-- Specific checklist responsibility; never modifies orders.members or recorded work.
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES horacerta.users(id);
-- statement-break
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES horacerta.users(id);
-- statement-break
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
-- statement-break
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS assignment_reason text;
-- statement-break
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='checklist_assignment_complete' AND conrelid='horacerta.order_checklists'::regclass) THEN
  ALTER TABLE horacerta.order_checklists ADD CONSTRAINT checklist_assignment_complete CHECK(
   (assigned_to IS NULL AND assigned_by IS NULL AND assigned_at IS NULL AND assignment_reason IS NULL)
   OR (assigned_to IS NOT NULL AND assigned_by IS NOT NULL AND assigned_at IS NOT NULL AND assignment_reason IS NOT NULL
    AND length(trim(assignment_reason)) BETWEEN 10 AND 500));
 END IF;
END $$;
-- statement-break
CREATE INDEX IF NOT EXISTS order_checklists_assignee ON horacerta.order_checklists(assigned_to,order_id) WHERE assigned_to IS NOT NULL;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.checklist_can_edit(actor uuid,target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM horacerta.order_checklists c JOIN horacerta.orders o ON o.id=c.order_id
 JOIN horacerta.users u ON u.id=actor AND u.active AND u.role='employee'
 WHERE c.id=target AND c.status='open' AND c.model_id=ANY(o.model_ids) AND o.status<>'Concluída'
 AND ((c.assigned_to IS NULL AND actor=ANY(o.members)) OR c.assigned_to=actor))
$$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.assign_order_checklist(actor uuid,target uuid,expected_version integer,assignee uuid,reason text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c horacerta.order_checklists%ROWTYPE;o horacerta.orders%ROWTYPE;before_value jsonb;assignee_name text;
BEGIN
 -- Same order as save/complete and order lifecycle; user SHARE locks also serialize deactivation.
 PERFORM pg_advisory_xact_lock(2849061701);
 PERFORM 1 FROM horacerta.users WHERE id=actor AND active AND role='coordinator' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Somente o coordenador pode designar responsáveis.'; END IF;
 IF length(trim(coalesce(reason,'')))<10 OR length(trim(reason))>500 THEN RAISE EXCEPTION 'Informe um motivo de 10 a 500 caracteres.'; END IF;
 SELECT name INTO assignee_name FROM horacerta.users WHERE id=assignee AND active AND role='employee' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um colaborador ativo para assumir o checklist.'; END IF;
 SELECT * INTO c FROM horacerta.order_checklists WHERE id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Checklist não encontrado.'; END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=c.order_id FOR UPDATE;
 IF o.status IS DISTINCT FROM 'Em andamento' THEN RAISE EXCEPTION 'A designação é permitida somente em OS em andamento.'; END IF;
 IF c.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'Checklist atualizado. Reabra antes de designar o responsável.'; END IF;
 IF c.status<>'open' THEN RAISE EXCEPTION 'Somente checklists pendentes podem receber um responsável.'; END IF;
 IF NOT c.model_id=ANY(o.model_ids) THEN RAISE EXCEPTION 'Equipamento removido da OS. Histórico somente para consulta.'; END IF;
 IF c.assigned_to IS NOT DISTINCT FROM assignee THEN RAISE EXCEPTION 'Este colaborador já é o responsável atual.'; END IF;
 before_value:=to_jsonb(c);
 UPDATE horacerta.order_checklists SET assigned_to=assignee,assigned_by=actor,assigned_at=clock_timestamp(),assignment_reason=trim(reason),
  updated_by=actor,updated_at=clock_timestamp(),version=version+1 WHERE id=target RETURNING * INTO c;
 INSERT INTO horacerta.checklist_history(checklist_id,actor_id,action,snapshot)
 VALUES(target,actor,'Responsável designado',jsonb_build_object('before',before_value,'after',to_jsonb(c),'reason',trim(reason)));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail)
 VALUES(o.id,actor,'Responsável de checklist designado',c.title||' · '||assignee_name||' · '||trim(reason));
 RETURN jsonb_build_object('ok',true,'id',c.id,'version',c.version,'assignee_id',c.assigned_to);
END $$;
-- statement-break
INSERT INTO horacerta.schema_migrations(name) VALUES('021-checklist-assignment') ON CONFLICT DO NOTHING;
