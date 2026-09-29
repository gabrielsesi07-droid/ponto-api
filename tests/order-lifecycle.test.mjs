import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCancelledPending, matchesOrderFilter, matchesOrderSection } from '../lib/order-lifecycle.ts';

const cancelled = { status: 'Cancelada', trips: [], active_points: 0, pending_checklists: 0 };
test('Canceladas com ponto, viagem ou conferência pendente permanecem visíveis', () => {
  for (const patch of [{ active_points: 1 }, { pending_checklists: 1 }, { trips: [{ return_km: null }] }]) {
    const order = { ...cancelled, ...patch };
    assert.equal(hasCancelledPending(order), true);
    for (const filter of ['Pendências', 'Cancelada', 'Todas']) assert.equal(matchesOrderFilter(order, filter), true);
    assert.equal(matchesOrderFilter(order, 'Abertas'), false);
    assert.equal(matchesOrderFilter(order, 'Concluída'), false);
  }
});
test('Histórico e área operacional não misturam situações, mesmo com filtro Todas', () => {
  for (const status of ['Agendada', 'Em andamento', 'Concluída', 'Cancelada']) {
    const order = { ...cancelled, status, active_points: 1 };
    const closed = ['Concluída', 'Cancelada'].includes(status);
    assert.equal(matchesOrderSection(order, true, 'Todas'), closed);
    assert.equal(matchesOrderSection(order, false, 'Todas'), !closed);
    assert.equal(matchesOrderSection(order, true, 'Pendências'), status === 'Cancelada');
  }
});
test('Pendências resolvidas saem de abertas e permanecem no histórico', () => {
  const order = { ...cancelled, trips: [{ return_km: 0 }] };
  assert.equal(hasCancelledPending(order), false);
  for (const filter of ['Abertas', 'Pendências']) assert.equal(matchesOrderFilter(order, filter), false);
  for (const filter of ['Todas', 'Cancelada']) assert.equal(matchesOrderFilter(order, filter), true);
});
test('Filtros preservam OS agendadas, em andamento e concluídas', () => {
  for (const status of ['Agendada', 'Em andamento', 'Concluída']) {
    const order = { ...cancelled, status };
    assert.equal(matchesOrderFilter(order, 'Abertas'), status !== 'Concluída');
    assert.equal(matchesOrderFilter(order, status), true);
    assert.equal(hasCancelledPending(order), false);
  }
});
