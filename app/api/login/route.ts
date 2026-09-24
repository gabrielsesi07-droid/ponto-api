import { db, payload, failure, ApiError } from "@/lib/server";
import { digest, verifyPin, pinPattern, sessionCookie } from "@/lib/pin";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const p = z
        .object({
          username: z.string().trim().toLowerCase().min(3).max(40),
          pin: z.string().regex(pinPattern, "O PIN precisa ter 6 números."),
          remember: z.boolean().default(true),
        })
        .parse(await payload(req)),
      sql = db();
    const r =
      await sql`UPDATE horacerta.users SET login_attempts=CASE WHEN attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' THEN 1 ELSE login_attempts+1 END, attempt_window=CASE WHEN attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' THEN now() ELSE attempt_window END WHERE username=${p.username} AND active=true AND pin_hash IS NOT NULL AND (attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' OR login_attempts<5) RETURNING id,pin_hash`;
    if (!r.length)
      throw new ApiError(
        429,
        "Acesso temporariamente bloqueado. Aguarde 15 minutos ou fale com o coordenador.",
      );
    if (!(await verifyPin(p.pin, r[0].pin_hash)))
      throw new ApiError(401, "PIN incorreto. Confira os 6 números.");
    const token = crypto.randomUUID() + crypto.randomUUID(),
      hashed = await digest(token),
      days = p.remember ? 30 : 0.5;
    await sql.transaction([
      sql`UPDATE horacerta.users SET login_attempts=0,attempt_window=NULL WHERE id=${r[0].id}`,
      sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${hashed},${r[0].id},now()+(${days}*interval '1 day'))`,
      sql`DELETE FROM horacerta.sessions WHERE expires_at<now()`,
    ]);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(token, req, days),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    await payload(req);
    const value = (req.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("hc_session="))
      ?.slice(11);
    if (value)
      await db()`DELETE FROM horacerta.sessions WHERE token_hash=${await digest(value)}`;
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie("", req, 0) } },
    );
  } catch (e) {
    return failure(e);
  }
}
