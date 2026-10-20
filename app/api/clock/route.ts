import { db, member, payload, failure, ApiError } from "@/lib/server";
import { z } from "zod";

// Only pause/resume/stop remain, to close legacy timers opened before hours were logged after the work.
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).passthrough(),
  z.object({ action: z.enum(["pause", "resume", "stop"]) }),
]);

export async function POST(req: Request) {
  try {
    const user = await member(),
      p = command.parse(await payload(req));
    if (p.action === "start")
      throw new ApiError(409, 'O cronômetro foi substituído. Atualize a página e use Registrar horas trabalhadas, informando entrada, saída e intervalo.');
    const r =
      await db()`SELECT horacerta.clock_action(${user.id}::uuid,${p.action}) AS result`;
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
    const orders = await sql`SELECT id,number,official_number,title,client_name,status,(starts_at AT TIME ZONE 'America/Sao_Paulo')::date::text start_date,${userId}::uuid=ANY(members) assigned
      FROM horacerta.orders WHERE ${userId}::uuid=ANY(members) OR id=${existingOrderId}::uuid ORDER BY starts_at DESC,number DESC`;
    return Response.json({orders}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (e) { return failure(e); }
}
