import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { member, coordinator, db, failure, ApiError } from '@/lib/server';
import { checklistItemsSchema, suggestChecklistItems } from '@/lib/checklists';
import { checklistPayload } from '@/lib/checklist-server';
import { libraryHeaders } from '@/lib/library-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const me = await member(); coordinator(me);
    const params = new URL(req.url).searchParams, sql = db();
    const model = z.string().uuid().parse(params.get('model'));
    const [equipment] = await sql`SELECT id,name,status FROM horacerta.equipment_models WHERE id=${model}::uuid`;
    if (!equipment) throw new ApiError(404, 'Modelo não encontrado.');
    const [templates, sources] = await Promise.all([
      sql`SELECT * FROM horacerta.checklist_templates WHERE model_id=${model}::uuid`,
      sql`SELECT d.id,d.name,d.status,
        EXISTS(SELECT 1 FROM horacerta.library_model_documents md WHERE md.document_id=d.id AND md.model_id=${model}::uuid) linked
        FROM horacerta.library_documents d
        WHERE d.category='checklist' AND d.ready AND NOT d.obsolete AND d.status<>'archived' ORDER BY linked DESC,d.name,d.id`,
    ]);
    const source = z.string().uuid().nullable().parse(params.get('source'));
    let suggested = null;
    if (source) {
      if (!sources.some(s => s.id === source)) throw new ApiError(404, 'Documento indisponível, arquivado ou obsoleto. Escolha outro checklist da Biblioteca.');
      const sections = await sql`SELECT content FROM horacerta.library_sections WHERE document_id=${source}::uuid ORDER BY position`;
      suggested = suggestChecklistItems(sections as { content: string }[], randomUUID);
    }
    return Response.json({ model: equipment, template: templates[0] || null, sources, suggested }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const me = await member(); coordinator(me);
    const body = z.object({ model_id: z.string().uuid(), version: z.number().int().min(0), title: z.string().trim().min(2).max(180),
      items: checklistItemsSchema, source_document_id: z.string().uuid().nullable(), status: z.enum(['draft','active','archived']),
    }).parse(await checklistPayload(req));
    if (body.status === 'active' && !body.items.length) throw new ApiError(400, 'Adicione ao menos um item.');
    const items = body.items.map(i => ({ ...i, outgoing: false, incoming: false, outgoing_qty: null, incoming_qty: null, na: false, notes: '' }));
    const sql = db();
    // Save the template, additive library link and audit together. A stale edit must not leave a link behind.
    const [, saved] = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(2849061701)`,
      sql`WITH source AS MATERIALIZED (
        SELECT id FROM horacerta.library_documents WHERE id=${body.source_document_id}::uuid AND ready AND category='checklist'
        AND (${body.status === 'archived'} OR (NOT obsolete AND status<>'archived')) FOR SHARE
      ), saved AS MATERIALIZED (
        SELECT horacerta.checklist_action(${me.id}::uuid,'save_template',${JSON.stringify({ ...body, items })}::jsonb) result
        WHERE ${body.source_document_id}::uuid IS NULL OR EXISTS(SELECT 1 FROM source)
      ), linked AS (
        INSERT INTO horacerta.library_model_documents(model_id,document_id)
        SELECT ${body.model_id}::uuid,source.id FROM source,saved
        WHERE ${body.status !== 'archived'} ON CONFLICT DO NOTHING RETURNING model_id,document_id
      ), audited AS (
        INSERT INTO horacerta.library_reviews(model_id,document_id,actor_id,action)
        SELECT model_id,document_id,${me.id}::uuid,'Checklist de referência vinculado ao equipamento' FROM linked
      ), document_version AS (
        UPDATE horacerta.library_documents d SET version=version+1,updated_at=now()
        FROM linked WHERE d.id=linked.document_id RETURNING d.id
      ) SELECT result FROM saved`,
    ]);
    const out = saved[0];
    if (!out) throw new ApiError(409, 'Documento indisponível, arquivado ou obsoleto. Reabra a configuração e escolha outro checklist.');
    return Response.json(out.result, { headers: libraryHeaders });
  } catch (e) { return failure((e as { code?: string }).code === 'P0001' ? new ApiError(409, (e as Error).message) : e); }
}
