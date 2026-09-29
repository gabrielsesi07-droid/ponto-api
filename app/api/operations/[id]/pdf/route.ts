import { z } from "zod";
import { db, member, coordinator, failure, ApiError } from "@/lib/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  try {
    const me = await member(),
      id = z
        .string()
        .uuid()
        .parse((await ctx.params).id);
    const rows =
      await db()`SELECT p.content,p.name FROM horacerta.order_pdfs p JOIN horacerta.orders o ON o.id=p.order_id WHERE o.id=${id}::uuid AND (${me.role === "coordinator"} OR ${me.id}::uuid=ANY(o.members))`;
    if (!rows[0]) throw new ApiError(404, "PDF não encontrado.");
    return new Response(Buffer.from(rows[0].content, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(rows[0].name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const me = await member();
    coordinator(me);
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      throw new ApiError(403, "Origem inválida.");
    const id = z
        .string()
        .uuid()
        .parse((await ctx.params).id),
      limit = 3 * 1024 * 1024;
    if (Number(req.headers.get("content-length")) > limit)
      throw new ApiError(413, "Use um PDF de até 3 MB.");
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, "Selecione um PDF.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "Use um PDF de até 3 MB.");
      }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new ApiError(400, "O arquivo precisa ser um PDF válido.");
    const name = decodeURIComponent(
      req.headers.get("x-file-name") || "ordem-de-servico.pdf",
    )
      .replace(/[\r\n/\\]/g, "_")
      .slice(0, 160);
    const sql = db();
    const results = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(2849061701)`,
      sql`WITH allowed AS (SELECT id FROM horacerta.orders WHERE id=${id}::uuid AND status IN ('Agendada','Em andamento') FOR UPDATE), saved AS (
        INSERT INTO horacerta.order_pdfs(order_id,name,content,size) SELECT id,${name},${bytes.toString("base64")},${size} FROM allowed
        ON CONFLICT(order_id) DO UPDATE SET name=excluded.name,content=excluded.content,size=excluded.size RETURNING order_id
      ), changed AS (UPDATE horacerta.orders SET version=version+1 WHERE id IN (SELECT order_id FROM saved) RETURNING id)
      INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) SELECT id,${me.id}::uuid,'PDF anexado',${name} FROM changed RETURNING order_id`,
    ]);
    if (!results[1].length)
      throw new ApiError(409, "OS não encontrada ou já encerrada.");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
