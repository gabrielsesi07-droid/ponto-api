import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { checklistAssignmentSchema, checklistOnlyOrder } from '../lib/checklist-access.ts';

test('assignment validates version, employee identifier and a trimmed substantive reason', () => {
  const valid = { id: randomUUID(), version: 1, assignee_id: randomUUID(), reason: '  Assumir conferência pendente.  ' };
  assert.equal(checklistAssignmentSchema.parse(valid).reason, 'Assumir conferência pendente.');
  for (const patch of [{ version: 0 }, { version: 1.1 }, { assignee_id: 'invalid' }, { reason: 'short' }, { reason: ' '.repeat(20) }, { reason: 'a'.repeat(501) }])
    assert.equal(checklistAssignmentSchema.safeParse({ ...valid, ...patch }).success, false);
});

test('checklist-only OS projection never discloses membership, work, trips or unrelated new fields', () => {
  const order = { id: randomUUID(), title: 'Conferência', number: 42, members: ['original-member'], team: [{ name: 'Original team' }],
    trips: [{ departure_km: 500 }], events: [{ detail: 'private work history' }], contact: 'private contact', phone: 'private phone',
    completion: 'private result', internal_future_field: 'must not leak', assigned_model_ids: ['assigned-model'],
    assigned_equipment_models: [{ id: 'assigned-model', name: 'Assigned model' }], assigned_pending_checklists: 1 };
  const projected = checklistOnlyOrder(order);
  assert.equal(projected.title, order.title); assert.equal(projected.number, 42); assert.equal(projected.checklist_only, true);
  for (const key of ['members', 'team', 'trips', 'events', 'logged_members', 'acknowledgements']) assert.deepEqual(projected[key], []);
  for (const key of ['contact', 'phone', 'completion']) assert.equal(projected[key], '');
  assert.equal('internal_future_field' in projected, false);
  assert.deepEqual(projected.model_ids, ['assigned-model']); assert.equal(projected.pending_checklists, 1);
  assert.equal(projected.can_delete, false); assert.equal(projected.pdf_name, null);
  assert.deepEqual(order.members, ['original-member'], 'Projection must not mutate original membership');
});
