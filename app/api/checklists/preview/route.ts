import { z } from 'zod';
import { member, coordinator, db, failure } from '@/lib/server';
import { libraryHeaders } from '@/lib/library-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    coordinator(await member());
    const ids = z.array(z.string().uuid()).min(1).max(30).parse((new URL(req.url).searchParams.get('models') || '').split(','));
    const rows = await db()`SELECT m.id model_id,m.name, t.id template_id,t.title,t.version template_version,t.status,
      CASE WHEN t.status IN ('active','imported') AND NOT coalesce(d.obsolete,false) AND m.status<>'archived'
        AND (t.source_document_id IS NULL OR d.ready) AND (t.status<>'imported' OR t.source_document_id IS NOT NULL) THEN t.items ELSE '[]'::jsonb END items,
      coalesce(d.obsolete,false) source_obsolete FROM horacerta.equipment_models m
      LEFT JOIN horacerta.checklist_templates t ON t.model_id=m.id LEFT JOIN horacerta.library_documents d ON d.id=t.source_document_id
      WHERE m.id=ANY(${ids}::uuid[]) ORDER BY m.name`;
    return Response.json({ models: rows }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
