import { z } from 'zod';
import { member, coordinator, db, failure, ApiError } from '@/lib/server';
import { checklistItemsSchema, checklistProblems } from '@/lib/checklists';
import { checklistPayload, orderForChecklist } from '@/lib/checklist-server';
import { libraryHeaders } from '@/lib/library-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const me = await member(), sql = db();
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get('order'));
    const order = await orderForChecklist(id, me);
    const [checklists, models, history] = await Promise.all([
      sql`SELECT c.*,u.name updated_by_name,fin.name completed_by_name,NOT c.model_id=ANY(${order.model_ids}::uuid[]) detached,
        coalesce(d.obsolete,false) source_obsolete FROM horacerta.order_checklists c
        JOIN horacerta.users u ON u.id=c.updated_by LEFT JOIN horacerta.users fin ON fin.id=c.completed_by
        LEFT JOIN horacerta.library_documents d ON d.id=c.source_document_id WHERE c.order_id=${id}::uuid ORDER BY c.model_name`,
      sql`SELECT m.id,m.name,CASE WHEN m.status='published' AND NOT coalesce(d.obsolete,false) THEN t.title END template_title FROM horacerta.equipment_models m
        LEFT JOIN horacerta.checklist_templates t ON t.model_id=m.id AND t.status='active'
        LEFT JOIN horacerta.library_documents d ON d.id=t.source_document_id
        WHERE m.id=ANY(${order.model_ids}::uuid[]) ORDER BY m.name`,
      sql`SELECT h.id,h.checklist_id,h.action,h.created_at,u.name FROM horacerta.checklist_history h
        JOIN horacerta.order_checklists c ON c.id=h.checklist_id LEFT JOIN horacerta.users u ON u.id=h.actor_id
        WHERE c.order_id=${id}::uuid ORDER BY h.created_at DESC,h.id DESC LIMIT 30`,
    ]);
    return Response.json({ order, checklists, models, history }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const me = await member();
    const raw = await checklistPayload(req);
    const action = z.enum(['save','complete','reopen','sync','custom']).parse(raw.action);
    let data;
    if (action === 'sync' || action === 'custom') {
      coordinator(me);
      data = z.object({ order_id: z.string().uuid(), model_id: z.string().uuid().optional() }).parse(raw);
      if (action === 'custom' && !data.model_id) throw new ApiError(400, 'Informe o equipamento.');
    } else if (action === 'reopen') {
      coordinator(me);
      data = z.object({ id: z.string().uuid(), version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).parse(raw);
    } else {
      data = z.object({ id: z.string().uuid(), version: z.number().int().positive(), title: z.string().trim().min(2).max(180),
        identification: z.string().trim().max(160).default(''), notes: z.string().trim().max(3000).default(''), items: checklistItemsSchema,
      }).parse(raw);
      if (action === 'complete') { const problems = checklistProblems(data.items); if (problems.length) throw new ApiError(400, problems[0]); }
    }
    const [out] = await db()`SELECT horacerta.checklist_action(${me.id}::uuid,${action},${JSON.stringify(data)}::jsonb) result`;
    return Response.json(out.result, { headers: libraryHeaders });
  } catch (e) { return failure((e as { code?: string }).code === 'P0001' ? new ApiError(409, (e as Error).message) : e); }
}
