CREATE TABLE IF NOT EXISTS horacerta.checklist_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid NOT NULL UNIQUE REFERENCES horacerta.equipment_models(id),
 title text NOT NULL, items jsonb NOT NULL DEFAULT '[]',
 source_document_id uuid REFERENCES horacerta.library_documents(id), source_name text NOT NULL DEFAULT '',source_hash text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 version integer NOT NULL DEFAULT 1, updated_by uuid REFERENCES horacerta.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)<=80)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.order_checklists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES horacerta.orders(id),
 model_id uuid NOT NULL REFERENCES horacerta.equipment_models(id),model_name text NOT NULL,
 template_id uuid REFERENCES horacerta.checklist_templates(id),template_version integer,
 title text NOT NULL,source_document_id uuid REFERENCES horacerta.library_documents(id),source_name text NOT NULL DEFAULT '',source_hash text NOT NULL DEFAULT '',
 items jsonb NOT NULL DEFAULT '[]',notes text NOT NULL DEFAULT '',identification text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES horacerta.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 completed_by uuid REFERENCES horacerta.users(id),completed_at timestamptz,
 UNIQUE(order_id,model_id),CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)<=80)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.checklist_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,checklist_id uuid REFERENCES horacerta.order_checklists(id),
 template_id uuid REFERENCES horacerta.checklist_templates(id),actor_id uuid REFERENCES horacerta.users(id),
 action text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.attach_order_checklists(target uuid,actor uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
 -- Called inside order_action's scheduling lock or the checklist action lock.
 WITH added AS (
  INSERT INTO horacerta.order_checklists(order_id,model_id,model_name,template_id,template_version,title,source_document_id,source_name,source_hash,items,updated_by,source_review_pending)
  SELECT o.id,m.id,m.name,t.id,t.version,t.title,t.source_document_id,t.source_name,t.source_hash,t.items,actor,t.status='imported'
  FROM horacerta.orders o JOIN horacerta.equipment_models m ON m.id=ANY(o.model_ids)
  JOIN horacerta.checklist_templates t ON t.model_id=m.id AND t.status IN ('active','imported') AND jsonb_array_length(t.items)>0
  LEFT JOIN horacerta.library_documents d ON d.id=t.source_document_id
  WHERE o.id=target AND o.status IN ('Agendada','Em andamento') AND m.status<>'archived'
  AND (t.source_document_id IS NULL OR (d.ready AND NOT d.obsolete))
  AND (t.status<>'imported' OR t.source_document_id IS NOT NULL)
  ON CONFLICT(order_id,model_id) DO UPDATE SET
   template_id=excluded.template_id,template_version=excluded.template_version,title=excluded.title,
   source_document_id=excluded.source_document_id,source_name=excluded.source_name,source_hash=excluded.source_hash,
   items=excluded.items,source_review_pending=excluded.source_review_pending,updated_by=actor,updated_at=now(),version=horacerta.order_checklists.version+1
  WHERE horacerta.order_checklists.status='open' AND horacerta.order_checklists.version=1
   AND horacerta.order_checklists.template_id IS NULL AND jsonb_array_length(horacerta.order_checklists.items)=0
   AND horacerta.order_checklists.notes='' AND horacerta.order_checklists.identification=''
  RETURNING *
 ), audit AS (
  INSERT INTO horacerta.checklist_history(checklist_id,actor_id,action,snapshot)
  SELECT id,actor,CASE WHEN version=1 THEN 'Checklist vinculado' ELSE 'Checklist vazio recuperado da referência do equipamento' END,to_jsonb(added) FROM added
 ) SELECT count(*) INTO total FROM added;
 RETURN total;
END $$;
