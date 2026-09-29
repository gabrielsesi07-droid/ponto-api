ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS source_review_pending boolean NOT NULL DEFAULT false;
-- statement-break
ALTER TABLE horacerta.checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_status_check;
-- statement-break
ALTER TABLE horacerta.checklist_templates ADD CONSTRAINT checklist_templates_status_check CHECK(status IN ('draft','imported','active','archived'));
-- statement-break
-- Only untouched machine-imported lists become automatic references. Human drafts
-- and deliberately archived standards remain disabled. No model/document is published.
WITH changed AS (
 UPDATE horacerta.checklist_templates t SET status='imported'
 FROM horacerta.library_documents d
 WHERE t.source_document_id=d.id AND t.status='draft' AND t.updated_by IS NULL AND t.version=1
 AND jsonb_array_length(t.items)>0 AND d.ready AND NOT d.obsolete
 RETURNING t.*
)
INSERT INTO horacerta.checklist_history(template_id,action,snapshot)
SELECT id,'Lista importada disponível como referência, sem aprovação técnica',to_jsonb(changed) FROM changed;
