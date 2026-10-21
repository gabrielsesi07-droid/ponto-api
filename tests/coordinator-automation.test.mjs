import test from 'node:test';
import assert from 'node:assert/strict';
import { entryReviewGroups, entryReviewIds, isReviewEntry, orderPreparation, upcomingPreparation, coordinatorQueue, closingChecklist } from '../lib/coordinator-center.ts';

const users = [{ id: 'ana', name: 'Ana Lima', active: true, hourly_rate: 30 }];
const entry = (patch = {}) => ({ id: 'e1', user_id: 'ana', date: '2026-10-21', start: '08:00', end: '17:00',
  worked: 480, normal: 480, extra: 0, amount: 0, status: 'Aprovado', rate: 30, ...patch });
const order = (patch = {}) => ({ id: 'o1', number: 25, official_number: '4831', title: 'Medição', client_name: 'Cliente',
  status: 'Agendada', starts_at: '2026-10-22T08:00:00-03:00', ends_at: '2026-10-23T17:00:00-03:00',
  team: users, trips: [], pending_checklists: 0, active_points: 0, ...patch });
const queue = (patch = {}) => coordinatorQueue({ today: '2026-10-21', month: '2026-10', users,
  period: { from: '2026-10-01', to: '2026-10-31' }, rows: [], orders: [], approvalRequired: false, ...patch });

test('Conferência por exceção soma o dia da pessoa entre OS e não marca dias regulares', () => {
  const rows = [entry({ id: 'a', worked: 500, order_id: 'o1' }), entry({ id: 'b', worked: 460, order_id: 'o2' }),
    entry({ id: 'c', date: '2026-10-22', worked: 500 }), entry({ id: 'd', user_id: 'outro', worked: 600 })];
  const groups = entryReviewGroups(rows, users);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].entries.map(e => e.id), ['a', 'b']);
  assert.deepEqual([...entryReviewIds(rows)], ['a', 'b']);
  assert.equal(isReviewEntry(rows[1], rows), true);
  assert.equal(isReviewEntry(rows[2], rows), false);
  assert.match(groups[0].reasons[0], /16h/);
});

test('Avisos existentes e cálculos inválidos são agrupados sem alterar registros', () => {
  const rows = [entry({ calculation_warning: 'Intervalo histórico sem posição.' }),
    entry({ id: 'e2', amount: Number.NaN }), entry({ id: 'e3', worked: -1 }),
    entry({ id: 'e4', end: null, calculation_warning: 'Ainda em aberto.' })];
  const before = structuredClone(rows);
  const groups = entryReviewGroups(rows, users);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 3);
  assert.equal(groups[0].reasons.length, 2);
  assert.deepEqual(rows, before);
});

test('Valor-hora ausente é estimativa pendente e não vira suspeita de jornada ou bloqueio', () => {
  const row = entry({ rate: 0, missing_rate: true });
  assert.deepEqual(entryReviewGroups([row], users), []);
  const closing = closingChecklist({ month: '2026-10', today: '2026-11-01', closed: false, missingHours: 0, entries: [row] });
  assert.equal(closing.state, 'ready');
  assert.match(closing.steps.find(s => s.id === 'rates').detail, /estimativa financeira pendente/i);
});

test('Preparação usa só evidência fornecida pela API e discrimina modelos e pessoas', () => {
  assert.deepEqual(orderPreparation(order()), []);
  const issues = orderPreparation(order({ missing_shift_members: users, missing_checklist_models: [{ id: 'm1', name: 'iScan Lite' }] }));
  assert.match(issues[0], /Ana Lima/);
  assert.match(issues[1], /iScan Lite/);
  assert.deepEqual(orderPreparation(order({ missing_shift_members: [], missing_checklist_models: [] })), []);
});

test('Fila de preparação cobre próximos sete dias e não duplica OS atrasada', () => {
  const missing = { missing_shift_members: users };
  const orders = [order({ id: 'today', starts_at: '2026-10-21T23:30:00-03:00', ...missing }),
    order({ id: 'limit', starts_at: '2026-10-28T08:00:00-03:00', ends_at: '2026-10-28T17:00:00-03:00', ...missing }),
    order({ id: 'future', starts_at: '2026-10-29T08:00:00-03:00', ends_at: '2026-10-29T17:00:00-03:00', ...missing }),
    order({ id: 'overdue', starts_at: '2026-10-19T08:00:00-03:00', ends_at: '2026-10-20T17:00:00-03:00', ...missing }),
    order({ id: 'done', status: 'Concluída', ...missing })];
  assert.deepEqual(upcomingPreparation(orders, '2026-10-21').map(o => o.id), ['today', 'limit']);
  const tasks = queue({ orders });
  assert.deepEqual(tasks.map(t => t.id), ['overdue-overdue', 'prepare-today', 'prepare-limit']);
  assert.match(tasks[0].detail, /turno a confirmar/);
  assert.deepEqual(tasks[1].action, { kind: 'order', orderId: 'today' });
  assert.match(tasks[1].title, /4831/);
});

test('Aviso de conferência leva ao colaborador e filtro corretos', () => {
  const tasks = queue({ rows: [entry({ calculation_warning: 'Confira o intervalo.' })] });
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].action, { kind: 'entries', userId: 'ana', month: '2026-10', review: true });
  assert.equal(tasks[0].category, 'points');
});

test('Aprovação automática não cria tarefa sem pendências e explica registros antigos pendentes', () => {
  assert.deepEqual(queue({ rows: [entry()] }), []);
  const tasks = queue({ rows: [entry({ status: 'Pendente' })] });
  assert.equal(tasks[0].id, 'approvals');
  assert.match(tasks[0].title, /registro aguardando regularização/);
  assert.match(tasks[0].detail, /Novos pontos recebem aprovação automática/);
  assert.equal(queue({ approvalRequired: true, rows: [entry({ status: 'Pendente' })] })[0].title, '1 ponto aguardando aprovação');
});

test('Fechamento identifica cronômetros legados anteriores ou iniciados no mês em Brasília', () => {
  const base = { month: '2026-10', today: '2026-11-01', closed: false, missingHours: 0, entries: [entry()] };
  const timers = [{ user_id: 'ana', started_at: '2026-09-30T23:00:00-03:00' },
    { user_id: 'bruno', started_at: '2026-11-01T01:00:00Z' },
    { user_id: 'carla', started_at: '2026-11-01T03:01:00Z' }];
  const result = closingChecklist({ ...base, timers });
  assert.equal(result.state, 'blocked');
  assert.equal(result.legacyTimers, 2);
  assert.equal(result.steps.find(step => step.id === 'timers').blocking, true);
  assert.match(result.steps.find(step => step.id === 'timers').detail, /Cada colaborador precisa encerrar/);
  assert.equal(closingChecklist({ ...base, timers: [timers[2]] }).state, 'ready');
  assert.equal(closingChecklist({ ...base, timers: [] }).steps.find(step => step.id === 'timers').done, true);
  const tasks = queue({ previous: { month: '2026-09', state: 'blocked', open: 0, pending: 0, legacyTimers: 1 } });
  assert.match(tasks[0].detail, /1 cronômetro antigo aberto/);
});
