import { db, member, payload, failure, ApiError } from "@/lib/server";
import { z } from "zod";

const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    started_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/),
    company: z.string().trim().min(2).max(160),
    service: z.string().trim().min(2).max(500),
    notes: z.string().trim().max(2000).default(""),
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
        !Number.isFinite(started.getTime()) ||
        started.getTime() < Date.now() - 7 * 24 * 60 * 60_000 ||
        started.getTime() > Date.now() + 5 * 60_000
      )
        throw new ApiError(
          400,
          "Informe um início válido dos últimos 7 dias, sem usar um horário futuro.",
        );
      const r =
        await sql`SELECT horacerta.clock_start(${user.id}::uuid,${started.toISOString()}::timestamptz,${p.company},${p.service},${p.notes}) AS result`;
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
