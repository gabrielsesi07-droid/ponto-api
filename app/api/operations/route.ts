import { z } from "zod";
import {after} from 'next/server';
import {dispatchPushSafely} from '@/lib/push-server';
import {
  db,
  member,
  coordinator,
  failure,
  ApiError,
} from "@/lib/server";
import { orderSchema, vehicleSchema, serviceClientSchema } from "@/lib/orders";
import { checklistPayload } from '@/lib/checklist-server';
export const dynamic = "force-dynamic";
export const maxDuration=60;
export async function GET() {
  try {
    const me = await member(),
      sql = db(),
      admin = me.role === "coordinator";
    const [orders, vehicles, clients, people] = await Promise.all([
      sql`SELECT o.*,
        horacerta.order_can_delete(o.id) can_delete,
        horacerta.order_pending_checklists(o.id) pending_checklists,
        ((SELECT count(*)::int FROM horacerta.timers t WHERE t.order_id=o.id) +
         (SELECT count(*)::int FROM horacerta.entries e WHERE e.order_id=o.id AND e."end" IS NULL AND e.deleted_at IS NULL)) active_points,
        EXISTS(SELECT 1 FROM horacerta.timers t WHERE t.order_id=o.id AND t.user_id=${me.id}::uuid) my_point_active,
        coalesce((SELECT array_agg(DISTINCT e.user_id) FROM horacerta.entries e WHERE e.order_id=o.id AND e.deleted_at IS NULL AND (${admin} OR e.user_id=${me.id}::uuid)),'{}') logged_members,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'family',m.family) ORDER BY m.name) FROM horacerta.equipment_models m WHERE m.id=ANY(o.model_ids)),'[]') equipment_models,
        (SELECT name FROM horacerta.order_pdfs WHERE order_id=o.id) pdf_name,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'access_code',u.access_code) ORDER BY u.name) FROM horacerta.users u WHERE u.id=ANY(o.members)),'[]') team,
        coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM horacerta.order_acknowledgements a WHERE a.order_id=o.id),'[]') acknowledgements,
        coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.departed_at DESC) FROM horacerta.vehicle_trips t WHERE t.order_id=o.id),'[]') trips,
        coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM (SELECT e.id,u.name,e.action,e.detail,e.created_at FROM horacerta.order_events e JOIN horacerta.users u ON u.id=e.actor_id WHERE e.order_id=o.id ORDER BY e.created_at DESC LIMIT 100) e),'[]') events
        FROM horacerta.orders o WHERE (${admin} OR ${me.id}::uuid=ANY(o.members)) ORDER BY o.starts_at DESC`,
      sql`SELECT v.* FROM horacerta.vehicles v WHERE ${admin} OR EXISTS(SELECT 1 FROM horacerta.orders o WHERE o.vehicle_id=v.id AND ${me.id}::uuid=ANY(o.members)) ORDER BY plate`,
      admin
        ? sql`SELECT id,name,address,contact,phone,notes,active,horacerta.client_has_history(id) has_history FROM horacerta.clients ORDER BY name`
        : Promise.resolve([]),
      admin
        ? sql`SELECT id,name,access_code,active FROM horacerta.users ORDER BY name,access_code`
        : Promise.resolve([]),
    ]);
    return Response.json(
      { orders, vehicles, clients, people },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const me = await member(),
      body = await checklistPayload(req),
      action = z
        .enum([
          "save_order",
          "save_client",
          "save_vehicle",
          "ack",
          "depart",
          "return",
          "begin",
          "finish",
          "cancel",
          "delete_order",
          "delete_client",
          "archive_client",
          "restore_client",
        ])
        .parse(body.action);
    let data;
    if (action.startsWith("save_") || action === "cancel" || action.startsWith('delete_') || action === 'archive_client' || action === 'restore_client') coordinator(me);
    if (action === "save_order") data = orderSchema.parse(body.data);
    else if (action === "save_client")
      data = serviceClientSchema.parse(body.data);
    else if (action === "save_vehicle") data = vehicleSchema.parse(body.data);
    else if (['delete_client','archive_client','restore_client'].includes(action))
      data = z.object({ id: z.string().uuid(), confirmation: z.string().trim().min(2).max(160) }).parse(body.data);
    else if (action === "delete_order")
      data = z.object({ id: z.string().uuid(), version: z.number().int().positive(),
        confirmation: z.string().trim().regex(/^OS-\d+$/, "Digite o número completo da OS para confirmar.") }).parse(body.data);
    else
      data = z
        .object({
          id: z.string().uuid(),
          km: z.number().int().min(0).max(9999999).optional(),
          notes: z.string().trim().max(5000).default(""),
          version: z.number().int().positive().optional(),
        })
        .parse(body.data);
    if (
      (action === "save_order" || action === "save_vehicle") &&
      data.id &&
      !("version" in data && data.version)
    )
      throw new ApiError(400, "Atualize a página antes de editar.");
    const result =
      await db()`SELECT horacerta.order_action(${me.id}::uuid,${action},${JSON.stringify(data)}::jsonb) result`;
    if (action==='save_order' || action==='finish' || action==='cancel') after(dispatchPushSafely);
    return Response.json(result[0].result);
  } catch (e) {
    if ((e as { code?: string }).code === "P0001")
      return failure(new ApiError(409, (e as Error).message));
    return failure(e);
  }
}
