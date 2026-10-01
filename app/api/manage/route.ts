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
import { randomTemporaryPin, TEMPORARY_PIN_HOURS, hashPin, verifyPin } from "@/lib/pin";
import { compensationSchema, DEFAULT_MONTHLY_HOURS } from '@/lib/compensation';
export async function POST(req: Request) {
  try {
    const me = await member({ allowPinChange: true }),
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
    if (me.pin_change_required && (body.entity !== "profile" || !body.data.pin))
      throw new ApiError(403, "Troque seu PIN temporário antes de continuar.", "PIN_CHANGE_REQUIRED");
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
        name: me.name,
        job: me.job,
        phone: me.phone,
        ...body.data,
        id: me.id,
        email: me.email,
        username: me.username || undefined,
      });
      const pin = p.pin ? await hashPin(p.pin) : null;
      if (p.pin) {
        if (p.pin === "123456") throw new ApiError(400, "Escolha um PIN diferente do PIN inicial antigo.");
        const [credential] = await sql`SELECT pin_hash FROM horacerta.users WHERE id=${me.id} AND credential_version=${me.credential_version}`;
        if (!credential) throw new ApiError(401, "Sua credencial mudou. Entre novamente.");
        if (await verifyPin(p.pin, credential.pin_hash)) throw new ApiError(400, "Escolha um PIN diferente do atual.");
      }
      // The database trigger increments the credential version and revokes sessions atomically.
      const changed = await sql`UPDATE horacerta.users SET name=${p.name},job=${p.job},phone=${p.phone},monthly_salary=CASE WHEN ${!!pay} THEN ${pay?.monthly_salary ?? null} ELSE monthly_salary END,monthly_hours=CASE WHEN ${!!pay} THEN ${pay?.monthly_hours ?? DEFAULT_MONTHLY_HOURS} ELSE monthly_hours END,pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END,attempt_window=CASE WHEN ${!!pin} THEN NULL ELSE attempt_window END,pin_change_required=CASE WHEN ${!!pin} THEN false ELSE pin_change_required END,pin_change_prompted=CASE WHEN ${!!pin} THEN true ELSE pin_change_prompted END,temporary_pin_expires_at=CASE WHEN ${!!pin} THEN NULL ELSE temporary_pin_expires_at END,temporary_pin_used_at=CASE WHEN ${!!pin} THEN NULL ELSE temporary_pin_used_at END WHERE id=${me.id} AND active=true AND credential_version=${me.credential_version} RETURNING id`;
      if (!changed.length) throw new ApiError(401, "Sua credencial mudou. Entre novamente.");
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
      const reset = !p.id || body.data.reset_pin === true || !!p.pin;
      const temporaryPin = reset ? randomTemporaryPin() : null;
      const pin = temporaryPin ? await hashPin(temporaryPin) : null;
      let person;
      if (p.id) {
        [person] = await sql`UPDATE horacerta.users SET name=${p.name},username=${p.username || old?.username || null},job=${p.job},phone=${p.phone},active=${p.active},can_edit=${p.can_edit},pin_hash=coalesce(${pin},pin_hash),login_attempts=CASE WHEN ${!!pin} THEN 0 ELSE login_attempts END,attempt_window=CASE WHEN ${!!pin} THEN NULL ELSE attempt_window END,pin_change_required=CASE WHEN ${!!pin} THEN true ELSE pin_change_required END,pin_change_prompted=CASE WHEN ${!!pin} THEN false ELSE pin_change_prompted END,temporary_pin_expires_at=CASE WHEN ${!!pin} THEN now()+(${TEMPORARY_PIN_HOURS}*interval '1 hour') ELSE temporary_pin_expires_at END,temporary_pin_used_at=CASE WHEN ${!!pin} THEN NULL ELSE temporary_pin_used_at END WHERE id=${p.id} RETURNING id,name,access_code,job,temporary_pin_expires_at`;
      } else {
        [person] = await sql`INSERT INTO horacerta.users(name,username,email,role,job,phone,hourly_rate,active,can_edit,pin_hash,pin_change_required,pin_change_prompted,temporary_pin_expires_at) VALUES(${p.name},${p.username || null},${p.email},'employee',${p.job},${p.phone},0,${p.active},${p.can_edit},${pin},true,false,now()+(${TEMPORARY_PIN_HOURS}*interval '1 hour')) RETURNING id,name,access_code,job,temporary_pin_expires_at`;
      }
      if (temporaryPin) return Response.json({ ok: true, person: { id: person.id, name: person.name, access_code: person.access_code, job: person.job }, temporary_pin: temporaryPin, temporary_pin_expires_at: person.temporary_pin_expires_at }, { headers: { "Cache-Control": "no-store" } });
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
