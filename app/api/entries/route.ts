import { z } from "zod";
import {
  db,
  member,
  coordinator,
  payload,
  failure,
  ApiError,
} from "@/lib/server";
import { minutes, today, type Entry, type Rules } from "@/lib/domain";
const schema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().optional(),
  user_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z
    .string()
    .regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/)
    .nullable(),
  break_minutes: z.coerce.number().int().min(0).max(1439),
  company: z.string().trim().min(2).max(160),
  service: z
    .string()
    .trim()
    .max(2000).default('Serviço técnico'),
  service_type: z.string().max(120).default(""),
  notes: z.string().max(2000).default(""),
  holiday: z.boolean().default(false),
});
export async function POST(req: Request) {
  try {
    const me = await member(),
      p = schema.parse(await payload(req)),
      sql = db();
    if (me.role !== "coordinator" && p.user_id !== me.id)
      throw new ApiError(403, "Você só pode registrar a própria jornada.");
    if(!p.id&&p.user_id!==me.id)throw new ApiError(403,'Novas marcações pertencem sempre à pessoa conectada.');
    if (
      !Number.isFinite(new Date(p.date + "T12:00:00Z").getTime()) ||
      new Date(p.date + "T12:00:00Z").toISOString().slice(0, 10) !== p.date ||
      p.date > today()
    )
      throw new ApiError(400, "Informe uma data válida, até hoje.");
    if (
      p.end &&
      (minutes(p.end) <= minutes(p.start) ||
        minutes(p.end) - minutes(p.start) <= p.break_minutes)
    )
      throw new ApiError(
        400,
        "A saída deve ser após a entrada, com intervalo menor que a jornada. Para viradas de dia, use um registro em cada data.",
      );
    const settings = (
      await sql`SELECT rules FROM horacerta.settings WHERE id=1`
    )[0].rules as Rules;
    if (
      me.role !== "coordinator" &&
      !settings.allow_retro &&
      p.date !== today()
    )
      throw new ApiError(403, "Lançamentos retroativos estão desabilitados.");
    let old: Entry | undefined;
    if (p.id) {
      old = (
        await sql`SELECT *,date::text FROM horacerta.entries WHERE id=${p.id} AND deleted_at IS NULL`
      )[0] as Entry | undefined;
      if (!old) throw new ApiError(404, "Registro não encontrado.");
      if (
        me.role !== "coordinator" &&
        !settings.allow_retro &&
        old.date !== today()
      )
        throw new ApiError(403, "Edições retroativas estão desabilitadas.");
      if (old.user_id !== p.user_id)
        throw new ApiError(
          400,
          "Não é possível trocar o colaborador de um registro.",
        );
      if (
        me.role !== "coordinator" &&
        (old.user_id !== me.id || !me.can_edit || old.status === "Aprovado")
      )
        throw new ApiError(
          403,
          "Este lançamento não pode ser editado por você.",
        );
    }
    const person = (
      await sql`SELECT * FROM horacerta.users WHERE id=${p.user_id} AND active=true`
    )[0];
    if (!person) throw new ApiError(400, "Colaborador inativo ou inexistente.");
    const client = p.client_id ? (
      await sql`SELECT * FROM horacerta.clients WHERE id=${p.client_id} AND (active=true OR id=${old?.client_id || null}::uuid)`
    )[0] : null;
    if (p.client_id&&!client) throw new ApiError(400, "Cliente inativo ou inexistente.");
    const rate = old?.rate ?? person.hourly_rate,
      rules = old?.rules ?? settings,
      status = settings.approval_required || !p.end ? "Pendente" : "Aprovado",
      id = p.id || crypto.randomUUID();
    const mutation = sql`WITH changed AS (
 INSERT INTO horacerta.entries AS current(id,user_id,client_id,date,start,"end",break_minutes,company,service,service_type,notes,holiday,status,rate,rules)
 SELECT ${id}::uuid,${p.user_id}::uuid,${p.client_id}::uuid,${p.date}::date,${p.start}::time,${p.end}::time,${p.break_minutes},${p.company},${p.service},${p.service_type},${p.notes},${p.holiday},${status},${rate},${JSON.stringify(rules)}::jsonb
 WHERE NOT EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.user_id=${p.user_id}::uuid AND e.date=${p.date}::date AND e.deleted_at IS NULL AND e.id<>${id}::uuid AND e.start<coalesce(${p.end}::time,'24:00'::time) AND coalesce(e."end",'24:00'::time)>${p.start}::time)
 AND NOT EXISTS(SELECT 1 FROM horacerta.timers t WHERE t.user_id=${p.user_id}::uuid AND (t.started_at AT TIME ZONE 'America/Sao_Paulo')<(${p.date}::date+coalesce(${p.end}::time,'24:00'::time)))
 ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,date=excluded.date,start=excluded.start,"end"=excluded."end",break_minutes=excluded.break_minutes,company=excluded.company,service=excluded.service,service_type=excluded.service_type,notes=excluded.notes,holiday=excluded.holiday,status=excluded.status,version=current.version+1,updated_at=now()
 WHERE current.version=${p.version ?? 0} AND current.deleted_at IS NULL
 RETURNING * ) INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value) SELECT ${me.id}::uuid,id,${old ? "edit" : "create"},${old ? JSON.stringify(old) : null}::jsonb,to_jsonb(changed) FROM changed RETURNING entry_id`;
    const result = await sql.transaction([
      sql`SELECT id FROM horacerta.users WHERE id=${p.user_id} FOR UPDATE`,
      mutation,
    ]);
    if (!result[1].length)
      throw new ApiError(
        409,
        "Existe sobreposição de horários ou o registro foi atualizado por outra pessoa. Atualize a lista.",
      );
    return Response.json({ ok: true, id });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    const me = await member();
    coordinator(me);
    const p = z
        .object({
          id: z.string().uuid(),
          version: z.number().int(),
          status: z.enum(["Pendente", "Aprovado", "Revisado"]),
        })
        .parse(await payload(req)),
      sql = db();
    const r =
      await sql`WITH old AS (SELECT * FROM horacerta.entries WHERE id=${p.id} AND version=${p.version} AND deleted_at IS NULL FOR UPDATE), changed AS (UPDATE horacerta.entries e SET status=${p.status},version=e.version+1,updated_at=now() FROM old WHERE e.id=old.id AND (${p.status !== "Aprovado"} OR e."end" IS NOT NULL) RETURNING e.*) INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value) SELECT ${me.id}::uuid,changed.id,'status',to_jsonb(old),to_jsonb(changed) FROM changed JOIN old USING(id) RETURNING entry_id`;
    if (!r.length)
      throw new ApiError(
        409,
        "Atualize a lista. Registros incompletos não podem ser aprovados.",
      );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const me = await member();
    coordinator(me);
    const p = z
        .object({ id: z.string().uuid(), version: z.number().int() })
        .parse(await payload(req)),
      sql = db();
    const r =
      await sql`WITH old AS (SELECT * FROM horacerta.entries WHERE id=${p.id} AND version=${p.version} AND deleted_at IS NULL FOR UPDATE), changed AS (UPDATE horacerta.entries e SET deleted_at=now(),version=e.version+1 FROM old WHERE e.id=old.id RETURNING e.*) INSERT INTO horacerta.audit(actor_id,entry_id,action,before_value,after_value) SELECT ${me.id}::uuid,changed.id,'delete',to_jsonb(old),to_jsonb(changed) FROM changed JOIN old USING(id) RETURNING entry_id`;
    if (!r.length)
      throw new ApiError(409, "Registro já alterado. Atualize a lista.");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
