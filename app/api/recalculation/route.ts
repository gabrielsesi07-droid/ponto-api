import { z } from 'zod';
import { db, member, coordinator, payload, failure, ApiError } from '@/lib/server';
import { monthBounds, type Entry, type Rules, type Shift } from '@/lib/domain';
import { digest } from '@/lib/pin';
import { rulesSchema } from '@/lib/work-rules';
import { recalculationPreview } from '@/lib/recalculation';
export const dynamic = 'force-dynamic';
const scopeSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  user_id: z.string().uuid().nullable().default(null),
  fill_missing_rates: z.boolean().default(false),
  use_current_shifts: z.boolean().default(false),
});

async function preview(scope: z.infer<typeof scopeSchema>) {
  const sql = db(), bounds = monthBounds(scope.month);
  const [entries, settings, people, closings, savedShifts] = await Promise.all([
    sql`SELECT e.*,e.date::text,e.start::text,e."end"::text,e.break_start::text FROM horacerta.entries e WHERE e.deleted_at IS NULL AND e.date BETWEEN ${bounds.from}::date AND ${bounds.to}::date AND (${scope.user_id}::uuid IS NULL OR e.user_id=${scope.user_id}::uuid) ORDER BY e.date,e.start,e.id`,
    sql`SELECT rules FROM horacerta.settings WHERE id=1`,
    sql`SELECT id,hourly_rate FROM horacerta.users ORDER BY id`,
    sql`SELECT month FROM horacerta.month_closings WHERE month=${bounds.from}::date`,
    scope.use_current_shifts ? sql`SELECT e.id,s.shift,s.version FROM horacerta.entries e JOIN horacerta.order_shifts s ON s.order_id=e.order_id AND s.user_id=e.user_id AND s.work_type=e.work_type WHERE e.deleted_at IS NULL AND e.date BETWEEN ${bounds.from}::date AND ${bounds.to}::date AND (${scope.user_id}::uuid IS NULL OR e.user_id=${scope.user_id}::uuid) ORDER BY e.id` : Promise.resolve([]),
  ]);
  if (closings.length) throw new ApiError(409, 'Reabra o mês com justificativa antes de recalcular seus registros.');
  const rules = rulesSchema.parse(settings[0].rules) as Rules;
  if (rules.calculation_version !== 2) throw new ApiError(409, 'Salve as novas regras de cálculo antes de recalcular.');
  const rates: Record<string, number> = Object.fromEntries(people.map(p => [p.id, Number(p.hourly_rate)]));
  const shifts: Record<string,Shift> = Object.fromEntries(savedShifts.map(s => [s.id,s.shift as Shift]));
  const summary = recalculationPreview(entries as Entry[], rules, rates, scope.fill_missing_rates,shifts);
  const token = await digest(JSON.stringify({scope,entries,rules,rates,savedShifts}));
  return {summary,token,rules,rates,shifts};
}

export async function GET(req: Request) {
  try {
    coordinator(await member());
    const query = new URL(req.url).searchParams;
    const scope = scopeSchema.parse({month:query.get('month'),user_id:query.get('user_id') || null,fill_missing_rates:query.get('fill_missing_rates') === 'true',use_current_shifts:query.get('use_current_shifts') === 'true'});
    const {summary,token} = await preview(scope);
    return Response.json({...summary,token}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
  try {
    const me = await member(); coordinator(me);
    const p = scopeSchema.extend({token:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(10,'Informe o motivo do recálculo (mínimo de 10 caracteres).').max(1000)}).parse(await payload(req));
    const scope = scopeSchema.parse(p), current = await preview(scope);
    if (current.token !== p.token) throw new ApiError(409, 'Os registros, salários ou regras mudaram. Confira uma nova prévia.');
    const result = await db()`SELECT horacerta.recalculate_entries(${me.id}::uuid,${monthBounds(p.month).from}::date,${p.user_id}::uuid,${JSON.stringify(current.rules)}::jsonb,${JSON.stringify(current.summary.versions)}::jsonb,${JSON.stringify(current.rates)}::jsonb,${p.fill_missing_rates},${p.reason},${p.use_current_shifts},${JSON.stringify(current.shifts)}::jsonb) result`;
    return Response.json(result[0].result);
  } catch (error) {
    if ((error as {code?: string}).code === 'P0001') return failure(new ApiError(409,(error as Error).message));
    return failure(error);
  }
}
