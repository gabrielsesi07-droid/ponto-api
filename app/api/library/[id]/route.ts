import { z } from 'zod';
import { member, db, failure } from '@/lib/server';
import { accessibleDocument, libraryHeaders } from '@/lib/library-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const me = await member(), { id } = await context.params;
    const doc = await accessibleDocument(id, me);
    const p = new URL(req.url).searchParams;
    const offset = z.coerce.number().int().min(0).max(100000).parse(p.get('offset') || '0');
    const sections = await db()`SELECT position,locator,content FROM horacerta.library_sections WHERE document_id=${id}::uuid ORDER BY position LIMIT 20 OFFSET ${offset}`;
    return Response.json({ document: doc, sections }, { headers: libraryHeaders });
  } catch (e) { return failure(e); }
}
