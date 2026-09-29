import { z } from "zod";
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
export async function GET() {
  try {
    const me = await member(),
      sql = db(),
      admin = me.role === "coordinator";
    const [orders, vehicles, clients, people] = await Promise.all([
      sql`SELECT o.*,
        (SELECT name FROM horacerta.order_pdfs WHERE order_id=o.id) pdf_name,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'access_code',u.access_code) ORDER BY u.name) FROM horacerta.users u WHERE u.id=ANY(o.members)),'[]') team,
        coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM horacerta.order_acknowledgements a WHERE a.order_id=o.id),'[]') acknowledgements,
        coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.departed_at DESC) FROM horacerta.vehicle_trips t WHERE t.order_id=o.id),'[]') trips,
        coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM (SELECT e.id,u.name,e.action,e.detail,e.created_at FROM horacerta.order_events e JOIN horacerta.users u ON u.id=e.actor_id WHERE e.order_id=o.id ORDER BY e.created_at DESC LIMIT 100) e),'[]') events
        FROM horacerta.orders o WHERE (${admin} OR ${me.id}::uuid=ANY(o.members)) ORDER BY o.starts_at DESC`,
      sql`SELECT v.* FROM horacerta.vehicles v WHERE ${admin} OR EXISTS(SELECT 1 FROM horacerta.orders o WHERE o.vehicle_id=v.id AND ${me.id}::uuid=ANY(o.members)) ORDER BY plate`,
      admin
        ? sql`SELECT id,name,address,contact,phone,notes,active FROM horacerta.clients ORDER BY name`
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
        ])
        .parse(body.action);
    let data;
    if (action.startsWith("save_") || action === "cancel") coordinator(me);
    if (action === "save_order") data = orderSchema.parse(body.data);
    else if (action === "save_client")
      data = serviceClientSchema.parse(body.data);
    else if (action === "save_vehicle") data = vehicleSchema.parse(body.data);
    else
      data = z
        .object({
          id: z.string().uuid(),
          km: z.number().int().min(0).max(9999999).optional(),
          notes: z.string().trim().max(5000).default(""),
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
    return Response.json(result[0].result);
  } catch (e) {
    if ((e as { code?: string }).code === "P0001")
      return failure(new ApiError(409, (e as Error).message));
    return failure(e);
  }
}
