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
      sql`SELECT DISTINCT d.id,d.name,d.status FROM horacerta.library_documents d
        JOIN horacerta.library_model_documents md ON md.document_id=d.id
        WHERE md.model_id=${model}::uuid AND d.category='checklist' AND d.ready AND NOT d.obsolete ORDER BY d.name`,
    ]);
    const source = z.string().uuid().nullable().parse(params.get('source'));
    let suggested = null;
    if (source) {
      if (!sources.some(s => s.id === source)) throw new ApiError(404, 'Vincule o documento a este modelo na Biblioteca antes de importar.');
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
    const [out] = await db()`SELECT horacerta.checklist_action(${me.id}::uuid,'save_template',${JSON.stringify({ ...body, items })}::jsonb) result`;
    return Response.json(out.result, { headers: libraryHeaders });
  } catch (e) { return failure((e as { code?: string }).code === 'P0001' ? new ApiError(409, (e as Error).message) : e); }
}
