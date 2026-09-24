import { z } from "zod";
import {
  db,
  member,
  coordinator,
  payload,
  personSchema,
  clientSchema,
  rulesSchema,
  failure,
  ApiError,
} from "@/lib/server";
import { hashPin } from "@/lib/pin";
export async function POST(req: Request) {
  try {
    const me = await member(),
      body = z
        .object({
          entity: z.enum(["profile", "user", "client", "settings"]),
          data: z.record(z.unknown()),
        })
        .parse(await payload(req)),
      sql = db();
    if (body.entity === "profile") {
      const p = personSchema.parse({
        ...body.data,
        id: me.id,
        email: me.email,
        username: me.username,
      });
      const pin = p.pin ? await hashPin(p.pin) : null;
      await sql.transaction([
        sql`UPDATE horacerta.users SET name=${p.name},job=${p.job},phone=${p.phone},hourly_rate=${p.hourly_rate},pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END WHERE id=${me.id}`,
        ...(pin
          ? [sql`DELETE FROM horacerta.sessions WHERE user_id=${me.id}`]
          : []),
      ]);
      return Response.json({ ok: true });
    }
    coordinator(me);
    if (body.entity === "user") {
      const old = body.data.id
        ? (
            await sql`SELECT * FROM horacerta.users WHERE id=${z.string().uuid().parse(body.data.id)}`
          )[0]
        : null;
      if (body.data.id && !old)
        throw new ApiError(404, "Colaborador não encontrado.");
      const p = personSchema.parse({
        ...body.data,
        email: old?.email || crypto.randomUUID() + "@horacerta.local",
        hourly_rate: old?.hourly_rate || 0,
      });
      if (old?.role === "coordinator" && !p.active)
        throw new ApiError(400, "O coordenador deve permanecer ativo.");
      const pin = p.pin ? await hashPin(p.pin) : null;
      if (p.id) {
        await sql.transaction([
          sql`UPDATE horacerta.users SET name=${p.name},username=${p.username},job=${p.job},phone=${p.phone},active=${p.active},can_edit=${p.can_edit},pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END WHERE id=${p.id}`,
          ...(pin || !p.active
            ? [sql`DELETE FROM horacerta.sessions WHERE user_id=${p.id}`]
            : []),
        ]);
      } else {
        if (!pin)
          throw new ApiError(400, "Defina um PIN inicial de 6 números.");
        const r = await sql.transaction([
          sql`SELECT id FROM horacerta.settings WHERE id=1 FOR UPDATE`,
          sql`INSERT INTO horacerta.users(name,username,email,role,job,phone,hourly_rate,active,can_edit,pin_hash) SELECT ${p.name},${p.username},${p.email},'employee',${p.job},${p.phone},0,${p.active},${p.can_edit},${pin} WHERE (SELECT count(*) FROM horacerta.users)<4 RETURNING id`,
        ]);
        if (!r[1].length)
          throw new ApiError(409, "Limite de quatro pessoas atingido.");
      }
    } else if (body.entity === "client") {
      const p = clientSchema.parse(body.data);
      if (p.id)
        await sql`UPDATE horacerta.clients SET name=${p.name},city=${p.city},state=${p.state},service_type=${p.service_type},notes=${p.notes},active=${p.active} WHERE id=${p.id}`;
      else
        await sql`INSERT INTO horacerta.clients(name,city,state,service_type,notes,active) VALUES(${p.name},${p.city},${p.state},${p.service_type},${p.notes},${p.active})`;
    } else if (body.entity === "settings") {
      const p = rulesSchema.parse(body.data),
        old = (await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0]
          .rules;
      if (
        p.currency !== old.currency &&
        (await sql`SELECT 1 FROM horacerta.entries LIMIT 1`).length
      )
        throw new ApiError(
          400,
          "A moeda não pode mudar após o primeiro registro.",
        );
      await sql`UPDATE horacerta.settings SET rules=${JSON.stringify(p)}::jsonb WHERE id=1`;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
