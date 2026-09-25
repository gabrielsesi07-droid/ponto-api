import { db, member, failure, ApiError } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const me = await member(),
      sql = db(),
      query = new URL(req.url).searchParams,
      from = query.get("from"),
      to = query.get("to");
    if (
      !from ||
      !to ||
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !Number.isFinite(new Date(from).getTime()) ||
      !Number.isFinite(new Date(to).getTime()) ||
      from > to ||
      new Date(to).getTime() - new Date(from).getTime() > 370 * 86400000
    )
      throw new ApiError(400, "Selecione um período de até um ano.");
    const [users, clients, entries, settings, timers, teamTimers] =
      await Promise.all([
        me.role === "coordinator"
          ? sql`SELECT id,name,access_code,username,email,role,job,phone,hourly_rate,active,can_edit FROM horacerta.users ORDER BY role,name,access_code`
          : Promise.resolve([me]),
        Promise.resolve([]),
        sql`SELECT id,user_id,client_id,date::text,start::text,"end"::text,break_minutes,service,service_type,notes,holiday,status,rate,rules,version FROM horacerta.entries WHERE deleted_at IS NULL AND (date BETWEEN ${from}::date AND ${to}::date OR "end" IS NULL) AND (${me.role === "coordinator"} OR user_id=${me.id}::uuid) ORDER BY date DESC,start DESC`,
        sql`SELECT rules FROM horacerta.settings WHERE id=1`,
        sql`SELECT * FROM horacerta.timers WHERE user_id=${me.id}`,
        me.role === "coordinator"
          ? sql`SELECT user_id,started_at,paused_at FROM horacerta.timers`
          : Promise.resolve([]),
      ]);
    return Response.json(
      {
        me,
        users,
        clients,
        entries,
        settings: settings[0].rules,
        timer: timers[0] || null,
        teamTimers,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
