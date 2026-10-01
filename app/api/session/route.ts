import {
  db,
  member,
  payload,
  personSchema,
  failure,
  ApiError,
  runtimeEnv,
} from "@/lib/server";
import {
  bootstrapConfigured,
  validBootstrapToken,
  hashPin,
  digest,
  sessionCookie,
} from "@/lib/pin";
import { compensationSchema, DEFAULT_MONTHLY_HOURS } from '@/lib/compensation';
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const sql = db();
    const count = await sql`SELECT count(*)::int AS n FROM horacerta.users`;
    if (!count[0].n)
      return Response.json(
        { setup: bootstrapConfigured(runtimeEnv("HORACERTA_BOOTSTRAP_TOKEN")), login: !bootstrapConfigured(runtimeEnv("HORACERTA_BOOTSTRAP_TOKEN")) },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      const me = await member({ allowPinChange: true });
      const { credential_version: _version, ...publicMe } = me;
      void _version;
      return Response.json(
        { me: me.pin_change_required ? { id: me.id, name: me.name, access_code: me.access_code, role: me.role, job: me.job, phone: me.phone, pin_change_required: true, pin_change_prompted: me.pin_change_prompted } : publicMe },
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
    const body = await payload(req);
    if (!(await validBootstrapToken(body.bootstrap_token, runtimeEnv("HORACERTA_BOOTSTRAP_TOKEN"))))
      throw new ApiError(403, "Configuração inicial não autorizada.");
    if (typeof body.pin !== "string" || !/^\d{6}$/.test(body.pin) || body.pin === "123456")
      throw new ApiError(400, "Defina um PIN pessoal de 6 números diferente do PIN inicial antigo.");
    const
      p = personSchema.parse({
        ...body,
        email:
          typeof body.email === "string" && body.email
            ? body.email
            : crypto.randomUUID() + "@horacerta.local",
      });
    if ('hourly_rate' in body && body.monthly_salary == null)
      throw new ApiError(400, 'Atualize a página. O valor-hora agora é calculado a partir do salário mensal.');
    const pay = body.monthly_salary == null ? null : compensationSchema.parse(body);
    const sql = db(),
      pin = await hashPin(body.pin),
      token = crypto.randomUUID() + crypto.randomUUID(),
      tokenHash = await digest(token),
      result = await sql.transaction([
        sql`SELECT id FROM horacerta.settings WHERE id=1 FOR UPDATE`,
        sql`WITH created AS (INSERT INTO horacerta.users(name,username,email,role,job,phone,hourly_rate,monthly_salary,monthly_hours,pin_hash,pin_change_required,pin_change_prompted) SELECT ${p.name},${p.username || null},${p.email},'coordinator',${p.job},${p.phone},0,${pay?.monthly_salary ?? null},${pay?.monthly_hours ?? DEFAULT_MONTHLY_HOURS},${pin},false,true WHERE NOT EXISTS(SELECT 1 FROM horacerta.users) RETURNING id,name,access_code,job,credential_version), issued AS (INSERT INTO horacerta.sessions(token_hash,user_id,credential_version,expires_at) SELECT ${tokenHash},id,credential_version,now()+interval '30 days' FROM created RETURNING user_id) SELECT created.id,created.name,created.access_code,created.job FROM created JOIN issued ON issued.user_id=created.id`,
      ]);
    if (!result[1].length)
      throw new ApiError(409, "O primeiro acesso já foi configurado.");
    return Response.json(
      {
        ok: true,
        person: {
          name: result[1][0].name,
          access_code: result[1][0].access_code,
          job: result[1][0].job,
        },
      },
      { headers: { "Set-Cookie": sessionCookie(token, req), "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
