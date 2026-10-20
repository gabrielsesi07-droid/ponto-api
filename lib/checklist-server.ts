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
  const [o] = await db()`SELECT o.id,o.number,o.official_number,o.title,o.client_name,o.address,o.starts_at,o.ends_at,o.status,o.model_ids,
    NOT (${me.role === 'coordinator'} OR ${me.id}::uuid=ANY(o.members)) checklist_only,
    coalesce((SELECT string_agg(name,', ' ORDER BY name) FROM horacerta.users WHERE id=ANY(o.members)),'') team_names,
    (SELECT plate||' · '||model FROM horacerta.vehicles WHERE id=o.vehicle_id) vehicle,
    (SELECT count(*)::int FROM horacerta.users u WHERE active AND role='employee' AND EXISTS(
      SELECT 1 FROM horacerta.order_checklists c WHERE c.order_id=o.id AND c.status='open' AND c.model_id=ANY(o.model_ids)
      AND ((c.assigned_to IS NULL AND u.id=ANY(o.members)) OR c.assigned_to=u.id))) checker_count
    FROM horacerta.orders o WHERE o.id=${id}::uuid AND (${me.role === 'coordinator'} OR ${me.id}::uuid=ANY(o.members) OR EXISTS(
      SELECT 1 FROM horacerta.order_checklists c WHERE c.order_id=o.id AND c.assigned_to=${me.id}::uuid))`;
  if (!o) throw new ApiError(404, 'OS não encontrada.');
  if (o.checklist_only) {
    // Do not disclose unrelated equipment or team labels through the checklist-specific read path.
    const models = await db()`SELECT model_id FROM horacerta.order_checklists WHERE order_id=${id}::uuid AND assigned_to=${me.id}::uuid`;
    o.model_ids = models.filter(m => o.model_ids.includes(m.model_id)).map(m => m.model_id);
    o.team_names = '';
    o.vehicle = null;
  }
  return o;
}
