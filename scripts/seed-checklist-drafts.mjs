// Derive imported reference lists from explicitly linked FPO documents.
// Does not technically approve or publish original documents/models, or overwrite templates.
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { suggestChecklistItems } from '../lib/checklists.ts';
const sql = neon(process.env.DATABASE_URL);
const models = await sql`SELECT id,name FROM horacerta.equipment_models ORDER BY name`;
let created = 0;
for (const m of models) {
  const docs = await sql`SELECT d.id,d.name,d.sha256 FROM horacerta.library_model_documents md JOIN horacerta.library_documents d ON d.id=md.document_id
    WHERE md.model_id=${m.id} AND d.ready AND NOT d.obsolete AND d.category='checklist' AND d.name LIKE 'FPO-3-1D_Checklist%'`;
  if (docs.length !== 1) continue;
  const d = docs[0], sections = await sql`SELECT content FROM horacerta.library_sections WHERE document_id=${d.id} ORDER BY position`;
  const items = suggestChecklistItems(sections, randomUUID);
  if (!items.length) continue;
  const rows = await sql`INSERT INTO horacerta.checklist_templates(model_id,title,items,source_document_id,source_name,source_hash,status)
    VALUES(${m.id},${'Checklist — ' + m.name},${JSON.stringify(items)}::jsonb,${d.id},${d.name},${d.sha256},'imported') ON CONFLICT(model_id) DO NOTHING RETURNING id`;
  created += rows.length;
}
console.log('Listas importadas criadas:', created, '(referência para conferência; sem aprovação técnica automática)');
