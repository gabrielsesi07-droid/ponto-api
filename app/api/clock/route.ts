import { db, member, payload, failure, ApiError } from "@/lib/server";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const user = await member(),
      { action } = z
        .object({ action: z.enum(["start", "pause", "resume", "stop"]) })
        .parse(await payload(req));
    const sql = db();
    const r =
      await sql`SELECT horacerta.clock_action(${user.id}::uuid,${action}) AS result`;
    return Response.json(r[0].result);
  } catch (e) {
    if ((e as { code?: string }).code === "P0001")
      return failure(new ApiError(409, (e as Error).message));
    return failure(e);
  }
}
