import { z } from 'zod';
import { member, db, failure, ApiError } from '@/lib/server';
import { accessibleDocument, libraryHeaders } from '@/lib/library-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const me = await member(), { id } = await context.params;
    const doc = await accessibleDocument(id, me);
    const part = z.coerce.number().int().min(0).max(100).parse(new URL(req.url).searchParams.get('part') || '0');
    if (part >= doc.chunk_count) throw new ApiError(404, 'Parte não encontrada.');
    const [chunk] = await db()`SELECT data FROM horacerta.library_chunks WHERE document_id=${id}::uuid AND position=${part}`;
    if (!chunk) throw new ApiError(404, 'Parte não encontrada.');
    return new Response(Buffer.from(chunk.data, 'base64'), { headers: { ...libraryHeaders, 'Content-Type': 'application/octet-stream' } });
  } catch (e) { return failure(e); }
}
