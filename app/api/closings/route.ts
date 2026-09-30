import { z } from "zod";
import { db, member, coordinator, payload, failure, ApiError } from "@/lib/server";

const command = z.object({
  action: z.enum(["approve", "close", "reopen"]),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Selecione um mês válido."),
  user_id: z.string().uuid().nullable().default(null),
  reason: z.string().trim().max(500).default(""),
});

/** Aprovação em lote e fechamento mensal. As regras ficam em horacerta.month_action. */
export async function POST(req: Request) {
  try {
    const me = await member();
    coordinator(me);
    const p = command.parse(await payload(req));
    const [row] = await db()`SELECT horacerta.month_action(${me.id}::uuid,${p.action},${p.month + "-01"}::date,${p.user_id}::uuid,${p.reason}) AS result`;
    return Response.json(row.result);
  } catch (e) {
    if ((e as { code?: string }).code === "P0001") return failure(new ApiError(409, (e as Error).message));
    return failure(e);
  }
}
