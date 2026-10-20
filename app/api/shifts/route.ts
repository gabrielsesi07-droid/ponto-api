import { z } from 'zod';
import { db, member, payload, failure, ApiError } from '@/lib/server';
import { shiftSchema } from '@/lib/work-rules';
import { workTypeSchema } from '@/lib/entry-validation';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const me = await member(), sql = db(), query = new URL(req.url).searchParams;
    const orderId = z.string().uuid().parse(query.get('order_id'));
    const userId = z.string().uuid().parse(query.get('user_id') || me.id);
    if (userId !== me.id && me.role !== 'coordinator') throw new ApiError(403, 'Consulte somente seu próprio turno.');
    const orders = await sql`SELECT id FROM horacerta.orders WHERE id=${orderId}::uuid AND (${me.role === 'coordinator'} OR ${me.id}::uuid=ANY(members))`;
    if (!orders.length) throw new ApiError(404, 'OS não encontrada.');
    const [shifts, settings] = await Promise.all([
      sql`SELECT work_type,shift,version,locked_at FROM horacerta.order_shifts WHERE order_id=${orderId}::uuid AND user_id=${userId}::uuid`,
      sql`SELECT rules FROM horacerta.settings WHERE id=1`,
    ]);
    return Response.json({ shifts, rules: settings[0].rules }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
  try {
    const me = await member();
    const p = z.object({
      order_id: z.string().uuid(), user_id: z.string().uuid().optional(),
      work_type: workTypeSchema, shift: shiftSchema,
      version: z.number().int().positive().optional(), reason: z.string().trim().max(1000).default(''),
    }).parse(await payload(req));
    const result = await db()`SELECT horacerta.order_shift_save(${me.id}::uuid,${p.order_id}::uuid,${p.user_id || me.id}::uuid,${p.work_type},${JSON.stringify(p.shift)}::jsonb,${p.version ?? null}::int,${p.reason}) result`;
    return Response.json(result[0].result);
  } catch (error) {
    if ((error as {code?: string}).code === 'P0001') return failure(new ApiError(409, (error as Error).message));
    return failure(error);
  }
}
