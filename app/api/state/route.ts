import { db, member, failure, ApiError } from "@/lib/server";
import { isCalendarDate } from '@/lib/date-validation';
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
      !isCalendarDate(from) ||
      !isCalendarDate(to) ||
      from > to ||
      new Date(to).getTime() - new Date(from).getTime() > 370 * 86400000
    )
      throw new ApiError(400, "Selecione um período de até um ano.");
    const [users, clients, entries, settings, timers, teamTimers, closings] =
      await Promise.all([
        me.role === "coordinator"
          ? sql`SELECT id,name,access_code,username,email,role,job,phone,hourly_rate,active,can_edit,pin_change_required,pin_change_prompted FROM horacerta.users ORDER BY role,name,access_code`
          : Promise.resolve([me]),
        Promise.resolve([]),
        sql`SELECT id,user_id,client_id,order_id,(SELECT number FROM horacerta.orders WHERE id=e.order_id) order_number,(SELECT official_number FROM horacerta.orders WHERE id=e.order_id) order_official_number,date::text,start::text,"end"::text,break_minutes,break_mode,company,service,service_type,notes,holiday,status,rate,rules,version FROM horacerta.entries e WHERE deleted_at IS NULL AND (date BETWEEN ${from}::date AND ${to}::date OR "end" IS NULL) AND (${me.role === "coordinator"} OR user_id=${me.id}::uuid) ORDER BY date DESC,start DESC`,
        sql`SELECT rules FROM horacerta.settings WHERE id=1`,
        sql`SELECT t.*,(SELECT number FROM horacerta.orders WHERE id=t.order_id) order_number,(SELECT official_number FROM horacerta.orders WHERE id=t.order_id) order_official_number FROM horacerta.timers t WHERE user_id=${me.id}`,
        me.role === "coordinator"
          ? sql`SELECT user_id,started_at,paused_at FROM horacerta.timers`
          : Promise.resolve([]),
        sql`SELECT to_char(c.month,'YYYY-MM') AS month,c.closed_at,u.name AS closed_by FROM horacerta.month_closings c JOIN horacerta.users u ON u.id=c.closed_by ORDER BY c.month DESC`,
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
        closedMonths: closings,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
