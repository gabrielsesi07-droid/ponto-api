import { db, member, payload, failure, ApiError } from "@/lib/server";
import { z } from "zod";
import { isCalendarDate } from '@/lib/date-validation';

const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/),
    notes: z.string().trim().max(2000).default(""),
    order_id: z.string({ required_error: 'Selecione a OS deste trabalho. Não é possível iniciar um ponto avulso.' }).uuid('Selecione uma OS válida.'),
  }),
  z.object({ action: z.enum(["pause", "resume", "stop"]) }),
]);

export async function POST(req: Request) {
  try {
    const user = await member(),
      p = command.parse(await payload(req));
    const sql = db();
    if (p.action === "start") {
      const started = new Date(p.started_at + ":00-03:00");
      if (
        !isCalendarDate(p.started_at.slice(0, 10)) || !Number.isFinite(started.getTime()) ||
        started.getTime() < Date.now() - 7 * 24 * 60 * 60_000 ||
        started.getTime() > Date.now() + 5 * 60_000
      )
        throw new ApiError(
          400,
          "Informe um início válido dos últimos 7 dias, sem usar um horário futuro.",
        );
      const r = await sql`SELECT horacerta.order_action(${user.id}::uuid,'start_clock',${JSON.stringify({ id: p.order_id, started_at: started.toISOString(), notes: p.notes })}::jsonb) AS result`;
      return Response.json(r[0].result);
    }
    const r =
      await sql`SELECT horacerta.clock_action(${user.id}::uuid,${p.action}) AS result`;
    return Response.json(r[0].result);
  } catch (e) {
    if ((e as { code?: string }).code === "P0001")
      return failure(new ApiError(409, (e as Error).message));
    return failure(e);
  }
}

export async function GET(req: Request) {
  try {
    const me = await member(), sql = db(), entryId = new URL(req.url).searchParams.get('entry_id');
    let userId = me.id, existingOrderId: string | null = null;
    if (entryId) {
      z.string().uuid().parse(entryId);
      const [entry] = await sql`SELECT user_id,order_id FROM horacerta.entries WHERE id=${entryId} AND deleted_at IS NULL AND (${me.role === 'coordinator'} OR user_id=${me.id})`;
      if (!entry) throw new ApiError(404, 'Marcação não encontrada.');
      userId = entry.user_id; existingOrderId = entry.order_id;
    }
    const orders = await sql`SELECT id,number,title,client_name,status,(starts_at AT TIME ZONE 'America/Sao_Paulo')::date::text start_date,${userId}::uuid=ANY(members) assigned
      FROM horacerta.orders WHERE ${userId}::uuid=ANY(members) OR id=${existingOrderId}::uuid ORDER BY starts_at DESC,number DESC`;
    return Response.json({orders}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (e) { return failure(e); }
}
