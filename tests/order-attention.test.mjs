import test from 'node:test';
import assert from 'node:assert/strict';
import { orderAttention, matchesOrderAttention, matchesOrderScope } from '../lib/order-attention.ts';
import { entryEditExplanation } from '../lib/entry-access.ts';

const day = '2026-10-01', now = Date.parse(day + 'T12:00:00-03:00');
const ready = { status: 'Em andamento', starts_at: day + 'T08:00:00-03:00', ends_at: day + 'T18:00:00-03:00',
  active_points: 0, pending_checklists: 0, trips: [], team: [{ id: 'a', name: 'Ana' }], logged_members: ['a'] };

test('Pendências apontam responsável sem transformar horas não lançadas em bloqueio', () => {
  const order = { ...ready, active_points: 1, pending_checklists: 2, trips: [{ return_km: null }], logged_members: [] };
  const attention = orderAttention(order, day, now);
  assert.deepEqual(attention.blockers.map(item => item.id), ['points', 'vehicle', 'equipment']);
  assert.match(attention.nextAction, /saída/);
  assert.equal(attention.missingHours.length, 1);
  assert.equal(matchesOrderAttention(order, 'Pendências de encerramento', day, now), true);
  const unlogged = orderAttention({ ...ready, logged_members: [] }, day, now);
  assert.equal(unlogged.blockers.length, 0);
  assert.match(unlogged.nextAction, /resultado/);
});

test('Ausência de contagens nunca afirma que encerramento está pronto', () => {
  const attention = orderAttention({ ...ready, active_points: undefined, pending_checklists: undefined }, day, now);
  assert.ok(attention.blockers.some(item => item.id === 'unknown'));
  assert.match(attention.nextAction, /Atualize/);
});

test('Cancelamento mantém retorno e conferência; concluída preserva aviso de horas', () => {
  const cancelled = { ...ready, status: 'Cancelada', pending_checklists: 1, trips: [{ return_km: null }] };
  const attention = orderAttention(cancelled, day, now);
  assert.equal(attention.blockers.length, 2);
  assert.match(attention.blockers.find(item => item.id === 'equipment').action, /justificativa/);
  const finished = { ...ready, status: 'Concluída', logged_members: [] };
  assert.equal(matchesOrderAttention(finished, 'Sem horas registradas', day, now), true);
  assert.equal(matchesOrderAttention(finished, 'Pendências de encerramento', day, now), false);
  assert.match(orderAttention(finished, day, now).nextAction, /não reabre/);
});

test('Colaborador com logged_members parcial não recebe diagnóstico da equipe', () => {
  const partial = { ...ready, logged_members: [] };
  assert.equal(orderAttention(partial, day, now, false).missingHours.length, 0);
  assert.equal(matchesOrderAttention(partial, 'Sem horas registradas', day, now, false), false);
  assert.equal(orderAttention({ ...ready, logged_members: undefined }, day, now).missingHours.length, 0);
});

test('Prazo previsto vencido considera instante e apenas OS abertas', () => {
  const late = { ...ready, ends_at: day + 'T11:59:00-03:00' };
  assert.equal(matchesOrderAttention(late, 'Prazo previsto vencido', day, now), true);
  assert.equal(matchesOrderAttention(ready, 'Prazo previsto vencido', day, now), false);
  assert.equal(matchesOrderAttention({ ...late, status: 'Cancelada' }, 'Prazo previsto vencido', day, now), false);
  assert.equal(matchesOrderAttention({ ...late, status: 'Concluída' }, 'Prazo previsto vencido', day, now), false);
});

test('Cliente sem cadastro, pessoa e limites inclusivos usam o dia de Brasília', () => {
  const order = { client_name: 'Cliente avulso', members: ['a'], starts_at: '2026-10-01T01:00:00Z' };
  const scope = { client: 'Cliente avulso', person: 'a', from: '2026-09-30', to: '2026-09-30' };
  assert.equal(matchesOrderScope(order, scope), true);
  for (const patch of [{ client: 'Outro' }, { person: 'b' }, { from: day }, { to: '2026-09-29' }]) {
    assert.equal(matchesOrderScope(order, { ...scope, ...patch }), false);
  }
});

test('Ponto aprovado explica correção pelo coordenador sem liberar edição do colaborador', () => {
  const employee = { role: 'employee', can_edit: true }, coordinator = { role: 'coordinator', can_edit: false };
  assert.match(entryEditExplanation(employee, { status: 'Aprovado' }, false), /coordenador/);
  assert.equal(entryEditExplanation(employee, { status: 'Pendente' }, false), '');
  assert.equal(entryEditExplanation(coordinator, { status: 'Aprovado' }, false), '');
  assert.match(entryEditExplanation({ ...employee, can_edit: false }, { status: 'Revisado' }, false), /não permite/);
  assert.match(entryEditExplanation(employee, { status: 'Aprovado' }, true), /reabertura/);
  assert.match(entryEditExplanation(coordinator, { status: 'Pendente' }, true), /Reabra/);
});
