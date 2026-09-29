import { z } from 'zod';
import { member, coordinator, db, payload, failure, ApiError } from '@/lib/server';
import { libraryHeaders } from '@/lib/library-server';
import { normalizeSearch } from '@/lib/library';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const me = await member(), admin = me.role === 'coordinator', sql = db();
    const params = new URL(req.url).searchParams;
    const q = normalizeSearch(z.string().max(120).parse(params.get('q') || '').trim());
    const category = z.enum(['', 'checklist', 'catalog', 'manual']).parse(params.get('category') || '');
    const status = z.enum(['', 'pending', 'published', 'archived']).parse(params.get('status') || '');
    const model = z.string().uuid().nullable().parse(params.get('model'));
    const order = z.string().uuid().nullable().parse(params.get('order'));
    const page = z.coerce.number().int().min(1).max(10000).parse(params.get('page') || '1');
    let orderModels: string[] = [];
    if (order) {
      const [o] = await sql`SELECT model_ids FROM horacerta.orders WHERE id=${order}::uuid AND (${admin} OR ${me.id}::uuid=ANY(members))`;
      if (!o) throw new ApiError(404, 'OS não encontrada.');
      orderModels = o.model_ids;
    }
    const predicate = sql`ready AND (${admin} OR (d.status='published' AND NOT d.obsolete))
      AND (${category}='' OR d.category=${category}) AND (${status}='' OR d.status=${status})
      AND (${q}='' OR position(${q} in d.search_text)>0)
      AND (${model}::uuid IS NULL OR EXISTS(SELECT 1 FROM horacerta.library_model_documents md WHERE md.document_id=d.id AND md.model_id=${model}::uuid))
      AND (${order}::uuid IS NULL OR EXISTS(SELECT 1 FROM horacerta.library_model_documents md WHERE md.document_id=d.id AND md.model_id=ANY(${orderModels}::uuid[])))`;
    const [documents, total, models, recent] = await Promise.all([
      sql`SELECT d.id,d.name,d.extension,d.size,d.category,d.status,d.obsolete,d.warnings,d.section_count,d.chunk_count,d.version,d.sha256,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name)) FROM horacerta.library_model_documents md JOIN horacerta.equipment_models m ON m.id=md.model_id WHERE md.document_id=d.id AND (${admin} OR m.status='published')),'[]') models
        FROM horacerta.library_documents d WHERE ${predicate} ORDER BY d.name,d.id LIMIT 24 OFFSET ${(page - 1) * 24}`,
      sql`SELECT count(*)::int total FROM horacerta.library_documents d WHERE ${predicate}`,
      sql`SELECT m.id,m.name,m.family,m.status,m.version,
        (SELECT count(*)::int FROM horacerta.library_model_documents md JOIN horacerta.library_documents d ON d.id=md.document_id WHERE md.model_id=m.id AND d.ready AND (${admin} OR (d.status='published' AND NOT d.obsolete))) document_count
        FROM horacerta.equipment_models m WHERE ${admin} OR m.status='published' ORDER BY m.name`,
      admin ? sql`SELECT created_at,finished_at,summary FROM horacerta.library_imports ORDER BY created_at DESC LIMIT 1` : Promise.resolve([]),
    ]);
    return Response.json({ documents, total: total[0].total, models, recent: recent[0] || null }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const me = await member(); coordinator(me);
    const body = z.object({ kind: z.enum(['document', 'model']), id: z.string().uuid(), version: z.number().int().positive(),
      status: z.enum(['pending', 'published', 'archived']),
      model_ids: z.array(z.string().uuid()).max(30).optional(),
    }).parse(await payload(req));
    const sql = db();
    // One statement: stale reviews cannot change links or append audit events.
    const result = body.kind === 'document' ? await sql`WITH updated AS (
      UPDATE horacerta.library_documents SET status=${body.status},version=version+1,reviewed_by=${me.id}::uuid,reviewed_at=now(),updated_at=now()
      WHERE id=${body.id}::uuid AND version=${body.version} AND ready AND (NOT obsolete OR ${body.status}<>'published') RETURNING id
    ), removed AS (
      DELETE FROM horacerta.library_model_documents md USING updated u WHERE md.document_id=u.id
      AND ${body.model_ids !== undefined} AND NOT md.model_id=ANY(${body.model_ids || []}::uuid[]) RETURNING md.document_id
    ), added AS (
      INSERT INTO horacerta.library_model_documents(model_id,document_id)
      SELECT DISTINCT unnest(${body.model_ids || []}::uuid[]),u.id FROM updated u ON CONFLICT DO NOTHING
    ), audited AS (
      INSERT INTO horacerta.library_reviews(document_id,actor_id,action) SELECT id,${me.id}::uuid,${body.status} FROM updated
    ) SELECT id FROM updated`
    : await sql`WITH updated AS (
      UPDATE horacerta.equipment_models SET status=${body.status},version=version+1,updated_at=now() WHERE id=${body.id}::uuid AND version=${body.version} RETURNING id
    ), audited AS (
      INSERT INTO horacerta.library_reviews(model_id,actor_id,action) SELECT id,${me.id}::uuid,${body.status} FROM updated
    ) SELECT id FROM updated`;
    if (!result.length) throw new ApiError(409, 'Material atualizado ou obsoleto. Reabra antes de revisar; obsoletos não podem ser liberados.');
    return Response.json({ ok: true }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
