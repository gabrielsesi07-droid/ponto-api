import { z } from 'zod';
import { member, coordinator, db, failure, ApiError } from '@/lib/server';
import { checklistItemsSchema, checklistProblems, plannedChecklistItems } from '@/lib/checklists';
import { checklistPayload, orderForChecklist } from '@/lib/checklist-server';
import { libraryHeaders } from '@/lib/library-server';
import { checklistAssignmentSchema } from '@/lib/checklist-access';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const me = await member(), sql = db();
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get('order'));
    const order = await orderForChecklist(id, me);
    const [checklists, models, history, assignees] = await Promise.all([
      sql`SELECT c.*,u.name updated_by_name,fin.name completed_by_name,w.name waived_by_name,NOT c.model_id=ANY(${order.model_ids}::uuid[]) detached,
        assigned.name assigned_to_name,assigner.name assigned_by_name,horacerta.checklist_can_edit(${me.id}::uuid,c.id) can_edit,
        coalesce(d.obsolete,false) source_obsolete FROM horacerta.order_checklists c
        JOIN horacerta.users u ON u.id=c.updated_by LEFT JOIN horacerta.users fin ON fin.id=c.completed_by
        LEFT JOIN horacerta.users w ON w.id=c.waived_by
        LEFT JOIN horacerta.users assigned ON assigned.id=c.assigned_to LEFT JOIN horacerta.users assigner ON assigner.id=c.assigned_by
        LEFT JOIN horacerta.library_documents d ON d.id=c.source_document_id WHERE c.order_id=${id}::uuid
        AND (NOT ${order.checklist_only} OR c.assigned_to=${me.id}::uuid) ORDER BY c.model_name`,
      sql`SELECT m.id,m.name,CASE WHEN m.status<>'archived' AND NOT coalesce(d.obsolete,false) AND jsonb_array_length(t.items)>0
        AND (t.source_document_id IS NULL OR d.ready) AND (t.status<>'imported' OR t.source_document_id IS NOT NULL) THEN t.title END template_title FROM horacerta.equipment_models m
        LEFT JOIN horacerta.checklist_templates t ON t.model_id=m.id AND t.status IN ('active','imported')
        LEFT JOIN horacerta.library_documents d ON d.id=t.source_document_id
        WHERE m.id=ANY(${order.model_ids}::uuid[]) AND (NOT ${order.checklist_only} OR EXISTS(
          SELECT 1 FROM horacerta.order_checklists c WHERE c.order_id=${id}::uuid AND c.model_id=m.id AND c.assigned_to=${me.id}::uuid)) ORDER BY m.name`,
      sql`SELECT h.id,h.checklist_id,h.action,h.created_at,u.name,coalesce(h.snapshot->>'reason','') detail FROM horacerta.checklist_history h
        JOIN horacerta.order_checklists c ON c.id=h.checklist_id LEFT JOIN horacerta.users u ON u.id=h.actor_id
        WHERE c.order_id=${id}::uuid AND (NOT ${order.checklist_only} OR c.assigned_to=${me.id}::uuid)
        ORDER BY h.created_at DESC,h.id DESC LIMIT 30`,
      me.role === 'coordinator' ? sql`SELECT u.id,u.name,u.access_code,u.id=ANY(o.members) in_team FROM horacerta.users u
        CROSS JOIN horacerta.orders o WHERE o.id=${id}::uuid AND u.active AND u.role='employee' ORDER BY u.name,u.access_code` : Promise.resolve(undefined),
    ]);
    return Response.json({ order, checklists, models, history, ...(assignees ? { assignees } : {}) }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const me = await member();
    const raw = await checklistPayload(req);
    if (raw.action === 'assign') {
      coordinator(me);
      const p = checklistAssignmentSchema.parse(raw);
      const [out] = await db()`SELECT horacerta.assign_order_checklist(${me.id}::uuid,${p.id}::uuid,${p.version},${p.assignee_id}::uuid,${p.reason}) result`;
      return Response.json(out.result, { headers: libraryHeaders });
    }
    if (raw.action === 'waive') {
      coordinator(me);
      const p=z.object({id:z.string().uuid(),version:z.number().int().positive(),reason:z.string().trim().min(10,'Informe uma justificativa com pelo menos 10 caracteres.').max(500)}).parse(raw);
      const [out]=await db()`SELECT horacerta.waive_order_checklist(${me.id}::uuid,${p.id}::uuid,${p.version},${p.reason}) result`;
      return Response.json(out.result,{headers:libraryHeaders});
    }
    const action = z.enum(['save','complete','reopen','sync','custom']).parse(raw.action);
    let data;
    if (action === 'sync') {
      coordinator(me);
      data = z.object({ order_id: z.string().uuid() }).parse(raw);
    } else if (action === 'custom') {
      coordinator(me);
      data = z.object({ order_id: z.string().uuid(), model_id: z.string().uuid(), title: z.string().trim().min(2).max(180),
        items: checklistItemsSchema.refine(items => items.length > 0, 'Cadastre os itens antes de criar o checklist.').transform(plannedChecklistItems),
      }).parse(raw);
    } else if (action === 'reopen') {
      coordinator(me);
      data = z.object({ id: z.string().uuid(), version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).parse(raw);
    } else {
      if (me.role === 'coordinator') throw new ApiError(403, 'A conferência deve ser realizada pelo login de um colaborador designado para esta OS.');
      data = z.object({ id: z.string().uuid(), version: z.number().int().positive(), title: z.string().trim().min(2).max(180),
        identification: z.string().trim().max(160).default(''), notes: z.string().trim().max(3000).default(''), items: checklistItemsSchema,
      }).parse(raw);
      if (!data.items.length) throw new ApiError(400, 'Mantenha ao menos um item no checklist.');
      if (action === 'complete') { const problems = checklistProblems(data.items); if (problems.length) throw new ApiError(400, problems[0]); }
    }
    const [out] = await db()`SELECT horacerta.checklist_action(${me.id}::uuid,${action},${JSON.stringify(data)}::jsonb) result`;
    return Response.json(out.result, { headers: libraryHeaders });
  } catch (e) { return failure((e as { code?: string }).code === 'P0001' ? new ApiError(409, (e as Error).message) : e); }
}
