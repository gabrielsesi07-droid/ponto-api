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
  INSERT INTO horacerta.order_checklists(order_id,model_id,model_name,template_id,template_version,title,source_document_id,source_name,source_hash,items,updated_by)
  SELECT o.id,m.id,m.name,t.id,t.version,t.title,t.source_document_id,t.source_name,t.source_hash,t.items,actor
  FROM horacerta.orders o JOIN horacerta.equipment_models m ON m.id=ANY(o.model_ids)
  JOIN horacerta.checklist_templates t ON t.model_id=m.id AND t.status='active'
  LEFT JOIN horacerta.library_documents d ON d.id=t.source_document_id
  WHERE o.id=target AND o.status IN ('Agendada','Em andamento') AND m.status='published'
  AND (t.source_document_id IS NULL OR (d.ready AND NOT d.obsolete))
  ON CONFLICT(order_id,model_id) DO NOTHING RETURNING *
 ), audit AS (
  INSERT INTO horacerta.checklist_history(checklist_id,actor_id,action,snapshot)
  SELECT id,actor,'Checklist vinculado',to_jsonb(added) FROM added
 ) SELECT count(*) INTO total FROM added;
 RETURN total;
END $$;
