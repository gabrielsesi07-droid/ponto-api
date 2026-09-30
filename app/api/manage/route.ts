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
import { DEFAULT_INITIAL_PIN, hashPin } from "@/lib/pin";
import { compensationSchema, DEFAULT_MONTHLY_HOURS } from '@/lib/compensation';
export async function POST(req: Request) {
  try {
    const me = await member(),
      body = z
        .object({
          entity: z.enum([
            "profile",
            "user",
            "client",
            "settings",
            "pin_prompt",
          ]),
          data: z.record(z.unknown()),
        })
        .parse(await payload(req)),
      sql = db();
    if (body.entity === "pin_prompt") {
      await sql`UPDATE horacerta.users SET pin_change_prompted=true WHERE id=${me.id}`;
      return Response.json({ ok: true });
    }
    if (body.entity === "profile") {
      const hasSalary = body.data.monthly_salary !== undefined && body.data.monthly_salary !== null;
      if ('hourly_rate' in body.data && !hasSalary)
        throw new ApiError(400, 'Atualize a página e informe seu salário mensal; o valor-hora agora é calculado automaticamente.');
      if (body.data.monthly_salary === null && me.monthly_salary != null)
        throw new ApiError(400, 'Informe seu salário mensal para atualizar o cálculo.');
      const pay = hasSalary ? compensationSchema.parse(body.data) : null;
      const p = personSchema.parse({
        ...body.data,
        id: me.id,
        email: me.email,
        username: me.username || undefined,
      });
      const pin = p.pin ? await hashPin(p.pin) : null;
      await sql.transaction([
        sql`UPDATE horacerta.users SET name=${p.name},job=${p.job},phone=${p.phone},monthly_salary=CASE WHEN ${!!pay} THEN ${pay?.monthly_salary ?? null} ELSE monthly_salary END,monthly_hours=CASE WHEN ${!!pay} THEN ${pay?.monthly_hours ?? DEFAULT_MONTHLY_HOURS} ELSE monthly_hours END,pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END,pin_change_required=CASE WHEN ${!!pin} THEN false ELSE pin_change_required END,pin_change_prompted=CASE WHEN ${!!pin} THEN true ELSE pin_change_prompted END WHERE id=${me.id}`,
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
      });
      if (old?.role === "coordinator" && !p.active)
        throw new ApiError(400, "O coordenador deve permanecer ativo.");
      const pin = p.pin ? await hashPin(p.pin) : null;
      if (p.id) {
        await sql.transaction([
          sql`UPDATE horacerta.users SET name=${p.name},username=${p.username || old?.username || null},job=${p.job},phone=${p.phone},active=${p.active},can_edit=${p.can_edit},pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END,pin_change_required=CASE WHEN ${!!pin} THEN true ELSE pin_change_required END,pin_change_prompted=CASE WHEN ${!!pin} THEN false ELSE pin_change_prompted END WHERE id=${p.id}`,
          ...(pin || !p.active
            ? [sql`DELETE FROM horacerta.sessions WHERE user_id=${p.id}`]
            : []),
        ]);
      } else {
        const initialPin = pin || (await hashPin(DEFAULT_INITIAL_PIN));
        await sql`INSERT INTO horacerta.users(name,username,email,role,job,phone,hourly_rate,active,can_edit,pin_hash,pin_change_required,pin_change_prompted) VALUES(${p.name},${p.username || null},${p.email},'employee',${p.job},${p.phone},0,${p.active},${p.can_edit},${initialPin},true,false)`;
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
