import { db, payload, failure, ApiError } from "@/lib/server";
import { digest, verifyPin, pinPattern, sessionCookie } from "@/lib/pin";
import { z } from "zod";
import { pushSubscriptionSchema } from '@/lib/push-validation';
import { logoutUserLockSql, logoutPushSql } from '@/lib/logout-push';
export const dynamic = "force-dynamic";
export async function GET() {
  // Public discovery never reveals names, jobs or access codes.
  return Response.json({ people: [] }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  try {
    const p = z
        .object({
          access_code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^HC-\d{6}$/, "Selecione seu cadastro novamente."),
          pin: z.string().regex(pinPattern, "O PIN precisa ter 6 números."),
          remember: z.boolean().default(true),
        })
        .parse(await payload(req)),
      sql = db();
    const r =
      await sql`UPDATE horacerta.users SET login_attempts=CASE WHEN attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' THEN 1 ELSE login_attempts+1 END, attempt_window=CASE WHEN attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' THEN now() ELSE attempt_window END WHERE access_code=${p.access_code} AND active=true AND pin_hash IS NOT NULL AND (attempt_window IS NULL OR attempt_window<now()-interval '15 minutes' OR login_attempts<5) RETURNING id,pin_hash,credential_version`;
    if (!r.length)
      throw new ApiError(
        401,
        "Código ou PIN inválido, expirado ou temporariamente bloqueado. Aguarde 15 minutos ou fale com o coordenador.",
      );
    if (!(await verifyPin(p.pin, r[0].pin_hash)))
      throw new ApiError(401, "Código ou PIN inválido, expirado ou temporariamente bloqueado. Aguarde 15 minutos ou fale com o coordenador.");
    const token = crypto.randomUUID() + crypto.randomUUID(),
      hashed = await digest(token),
      days = p.remember ? 30 : 0.5;
    const authenticated = await sql`SELECT horacerta.complete_pin_login(${r[0].id}::uuid,${r[0].pin_hash},${r[0].credential_version},${hashed},${days}) AS person`;
    const person = authenticated[0]?.person;
    if (!person) throw new ApiError(401, "Código ou PIN inválido, expirado ou temporariamente bloqueado. Aguarde 15 minutos ou fale com o coordenador.");
    return Response.json(
      {
        ok: true,
        person,
      },
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
    const p = z.object({ push_endpoint: pushSubscriptionSchema.shape.endpoint.optional() }).parse(await payload(req, { allowEmpty: true }));
    const value = (req.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("hc_session="))
      ?.slice(11);
    if (value) {
      const sql = db(), hashed = await digest(value);
      // The owner proof must be checked before deleting the session, in the same transaction.
      // No operational member()/PIN gate: logout remains usable during mandatory PIN changes.
      await sql.transaction([
        sql.query(logoutUserLockSql, [hashed]),
        sql.query(logoutPushSql, [hashed, p.push_endpoint ?? null]),
        sql`DELETE FROM horacerta.sessions WHERE token_hash=${hashed}`,
      ]);
    }
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie("", req, 0) } },
    );
  } catch (e) {
    return failure(e);
  }
}
