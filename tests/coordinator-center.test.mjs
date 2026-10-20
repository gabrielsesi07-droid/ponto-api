import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalGroups, openEntryGroups, closingChecklist, coordinatorQueue, overdueOrders, todayAgenda, ordersMissingHours, orderBlockers, previousMonth, brtDate } from '../lib/coordinator-center.ts';

const users = [
  { id: 'a', name: 'Ana Souza', active: true, hourly_rate: 30 },
  { id: 'b', name: 'Bruno Lima', active: true, hourly_rate: 0 },
  { id: 'c', name: 'Carla Dias', active: false, hourly_rate: 0 },
];
const entry = (patch) => ({ id: Math.random().toString(36), user_id: 'a', date: '2026-09-10', start: '08:00', end: '17:00', status: 'Pendente', rate: 30, worked: 480, extra: 0, ...patch });
const order = (patch) => ({ id: 'o1', number: 7, title: 'Manutenção', client_name: 'Cliente X', status: 'Em andamento', starts_at: '2026-09-29T08:00:00-03:00', ends_at: '2026-09-29T18:00:00-03:00', team: [{ id: 'a', name: 'Ana Souza' }, { id: 'b', name: 'Bruno Lima' }], logged_members: ['a', 'b'], pending_checklists: 0, active_points: 0, trips: [], ...patch });

test('Aprovação agrupa por pessoa, ignora aprovados e sem saída, e ordena pelo mais antigo', () => {
  const groups = approvalGroups([
    entry({ user_id: 'a', date: '2026-09-12' }),
    entry({ user_id: 'a', date: '2026-09-11', status: 'Revisado' }),
    entry({ user_id: 'b', date: '2026-09-03' }),
    entry({ user_id: 'b', date: '2026-09-01', status: 'Aprovado' }),
    entry({ user_id: 'b', date: '2026-09-02', end: null }),
  ], users);
  assert.deepEqual(groups.map(g => [g.userId, g.count, g.oldest, g.reviewed]), [['b', 1, '2026-09-03', 0], ['a', 2, '2026-09-11', 1]]);
  assert.deepEqual(openEntryGroups([entry({ end: null }), entry({ end: null, user_id: 'b' }), entry({})], users).map(g => g.count), [1, 1]);
});

test('Datas da OS são lidas no horário de Brasília', () => {
  assert.equal(brtDate('2026-10-01T01:30:00Z'), '2026-09-30');
  assert.equal(previousMonth('2026-01'), '2025-12');
});

test('OS atrasada é aberta com previsão anterior a hoje; agenda inclui atendimentos de hoje', () => {
  const orders = [
    order({ id: 'late', ends_at: '2026-09-30T18:00:00-03:00' }),
    order({ id: 'today', status: 'Agendada', starts_at: '2026-10-01T08:00:00-03:00', ends_at: '2026-10-01T12:00:00-03:00' }),
    order({ id: 'multi', starts_at: '2026-09-30T08:00:00-03:00', ends_at: '2026-10-02T12:00:00-03:00' }),
    order({ id: 'done', status: 'Concluída', ends_at: '2026-09-01T18:00:00-03:00' }),
  ];
  assert.deepEqual(overdueOrders(orders, '2026-10-01').map(o => o.id), ['late']);
  assert.deepEqual(todayAgenda(orders, '2026-10-01').map(o => o.id), ['multi', 'today']);
  assert.deepEqual(orderBlockers(order({ active_points: 1, pending_checklists: 2, trips: [{ return_km: null }] })), ['1 ponto sem saída', 'veículo sem retorno', '2 checklists pendentes']);
});

test('Horas ausentes só em OS concluídas do período e quando a API informa quem lançou', () => {
  const period = { from: '2026-09-01', to: '2026-09-30' };
  const result = ordersMissingHours([
    order({ id: 'x', status: 'Concluída', logged_members: ['a'] }),
    order({ id: 'y', status: 'Concluída', logged_members: undefined }),
    order({ id: 'z', status: 'Em andamento', logged_members: [] }),
    order({ id: 'w', status: 'Concluída', logged_members: [], starts_at: '2026-08-10T08:00:00-03:00' }),
  ], period);
  assert.deepEqual(result.map(r => [r.order.id, r.people.map(p => p.id)]), [['x', ['b']]]);
});

test('Fechamento espelha bloqueios do servidor e trata valor-hora zero e horas ausentes como aviso', () => {
  const base = { month: '2026-09', today: '2026-10-01', closed: false, missingHours: 0 };
  const ready = closingChecklist({ ...base, entries: [entry({ status: 'Aprovado' })] });
  assert.equal(ready.state, 'ready');
  const warn = closingChecklist({ ...base, missingHours: 2, entries: [entry({ status: 'Aprovado', rate: 0 })] });
  assert.equal(warn.state, 'ready');
  assert.deepEqual(warn.steps.filter(s => !s.done).map(s => [s.id, s.blocking]), [['rates', false], ['hours', false]]);
  assert.equal(closingChecklist({ ...base, entries: [entry({}), entry({ end: null })] }).state, 'blocked');
  assert.equal(closingChecklist({ ...base, entries: [] }).state, 'blocked');
  assert.equal(closingChecklist({ ...base, today: '2026-09-20', entries: [entry({ status: 'Aprovado' })] }).state, 'running');
  assert.equal(closingChecklist({ ...base, closed: true, entries: [entry({})] }).state, 'closed');
  assert.equal(closingChecklist({ ...base, entries: [entry({ date: '2026-08-31' })] }).total, 0);
  const unknown = closingChecklist({ ...base, missingHours: null, entries: [entry({ status: 'Aprovado' })] });
  assert.deepEqual(unknown.steps.find(s => s.id === 'hours'), { ...unknown.steps.find(s => s.id === 'hours'), done: false, unknown: true });
  assert.match(unknown.steps.find(s => s.id === 'hours').detail, /Não verificado/);
  assert.equal(unknown.state, 'ready');
});

test('Fila prioriza urgências e aponta ações reais', () => {
  const tasks = coordinatorQueue({
    today: '2026-10-01', month: '2026-10', users,
    period: { from: '2026-10-01', to: '2026-10-31' },
    rows: [entry({ date: '2026-10-01', end: null }), entry({ date: '2026-10-01', user_id: 'b' })],
    orders: [
      order({ id: 'late', ends_at: '2026-09-30T18:00:00-03:00', trips: [{ return_km: null }] }),
      order({ id: 'cancel', status: 'Cancelada', pending_checklists: 1 }),
      order({ id: 'ok', status: 'Cancelada' }),
      order({ id: 'miss', status: 'Concluída', starts_at: '2026-10-01T08:00:00-03:00', logged_members: ['a'] }),
    ],
    previous: { month: '2026-09', state: 'blocked', open: 0, pending: 3 },
  });
  assert.deepEqual(tasks.map(t => t.id), ['open-entries', 'overdue-late', 'closing-2026-09', 'approvals', 'cancelled-cancel', 'missing-miss', 'no-rate']);
  assert.deepEqual(tasks.map(t => t.severity).slice(0, 3), ['urgent', 'urgent', 'urgent']);
  assert.deepEqual(tasks.find(t => t.id === 'approvals').action, { kind: 'entries', userId: 'b', month: '2026-10' });
  assert.deepEqual(tasks.find(t => t.id === 'overdue-late').action, { kind: 'order', orderId: 'late' });
  assert.match(tasks.find(t => t.id === 'no-rate').detail, /Bruno Lima/);
  assert.doesNotMatch(tasks.find(t => t.id === 'no-rate').detail, /Carla/);
  assert.equal(coordinatorQueue({ today: '2026-10-01', month: '2026-10', users: [users[0]], period: { from: '2026-10-01', to: '2026-10-31' }, rows: [], orders: [] }).length, 0);
});
