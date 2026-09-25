import {
  db,
  member,
  payload,
  personSchema,
  failure,
  ApiError,
} from "@/lib/server";
import {
  DEFAULT_INITIAL_PIN,
  hashPin,
  digest,
  sessionCookie,
} from "@/lib/pin";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const sql = db();
    const count = await sql`SELECT count(*)::int AS n FROM horacerta.users`;
    if (!count[0].n)
      return Response.json(
        { setup: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      return Response.json(
        { me: await member() },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        return Response.json(
          { login: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const body = await payload(req),
      p = personSchema.parse({
        ...body,
        email:
          typeof body.email === "string" && body.email
            ? body.email
            : crypto.randomUUID() + "@horacerta.local",
      });
    const sql = db(),
      pin = await hashPin(DEFAULT_INITIAL_PIN),
      result = await sql.transaction([
        sql`SELECT id FROM horacerta.settings WHERE id=1 FOR UPDATE`,
        sql`INSERT INTO horacerta.users(name,username,email,role,job,phone,hourly_rate,pin_hash,pin_change_required,pin_change_prompted) SELECT ${p.name},${p.username || null},${p.email},'coordinator',${p.job},${p.phone},${p.hourly_rate},${pin},true,false WHERE NOT EXISTS(SELECT 1 FROM horacerta.users) RETURNING id,name,access_code,job`,
      ]);
    if (!result[1].length)
      throw new ApiError(409, "O primeiro acesso já foi configurado.");
    const token = crypto.randomUUID() + crypto.randomUUID();
    await sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${await digest(token)},${result[1][0].id},now()+interval '30 days')`;
    return Response.json(
      {
        ok: true,
        person: {
          name: result[1][0].name,
          access_code: result[1][0].access_code,
          job: result[1][0].job,
        },
      },
      { headers: { "Set-Cookie": sessionCookie(token, req) } },
    );
  } catch (e) {
    return failure(e);
  }
}
