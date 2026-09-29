import { ApiError, db } from './server';
import type { Person } from './domain';
import { z } from 'zod';
export const libraryHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function accessibleDocument(id: string, me: Person) {
  z.string().uuid().parse(id);
  const rows = await db()`SELECT id,name,extension,size,sha256,category,obsolete,status,warnings,section_count,chunk_count,version,
    CASE WHEN ${me.role === 'coordinator'} THEN origins ELSE NULL END origins
    FROM horacerta.library_documents WHERE id=${id}::uuid AND ready
    AND (${me.role === 'coordinator'} OR (status='published' AND NOT obsolete))`;
  if (!rows[0]) throw new ApiError(404, 'Documento não encontrado ou ainda não liberado.');
  return rows[0];
}
