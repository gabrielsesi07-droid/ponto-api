import { z } from 'zod';
import { ApiError, db } from './server';
import type { Person } from './domain';
export async function checklistPayload(req: Request) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) throw new ApiError(403, 'Origem inválida.');
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, 'Informe os dados.');
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 150000) { await reader.cancel(); throw new ApiError(413, 'Checklist muito grande. Limite as observações.'); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new ApiError(400, 'Dados inválidos.'); }
}
export async function orderForChecklist(id: string, me: Person) {
  z.string().uuid().parse(id);
  const [o] = await db()`SELECT o.id,o.number,o.title,o.client_name,o.address,o.starts_at,o.ends_at,o.status,o.model_ids,
    coalesce((SELECT string_agg(name,', ' ORDER BY name) FROM horacerta.users WHERE id=ANY(o.members)),'') team_names,
    (SELECT plate||' · '||model FROM horacerta.vehicles WHERE id=o.vehicle_id) vehicle
    FROM horacerta.orders o WHERE o.id=${id}::uuid AND (${me.role === 'coordinator'} OR ${me.id}::uuid=ANY(o.members))`;
  if (!o) throw new ApiError(404, 'OS não encontrada.');
  return o;
}
