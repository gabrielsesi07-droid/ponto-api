import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOperationalOrders, operationalOrders, operationSchedule } from '../components/signature-operation-board-state.ts';

const person = { id: 'ana', name: 'Ana Conceição' };
const order = (patch = {}) => ({ id: 'o1', number: 25, official_number: '4831', title: 'Medição técnica', client_name: 'Fábrica Nova Era',
  status: 'Agendada', starts_at: '2026-10-22T08:00:00-03:00', ends_at: '2026-10-23T17:00:00-03:00',
  address: 'São José', team: [person], members: [person.id], trips: [], events: [], acknowledgements: [],
  equipment_models: [{ id: 'model', name: 'iScan Lite', family: 'scanner' }], equipment: '',
  pending_checklists: 0, active_points: 0, missing_shift_members: [], missing_checklist_models: [], logged_members: [], ...patch });
const build = (orders, patch = {}) => operationalOrders({ orders, rows: [], reviewIds: new Set(), today: '2026-10-21', period: { from: '2026-10-01', to: '2026-10-31' }, ...patch });

test('OS futura sem horas permanece em Preparar sem inventar pendência de horas', () => {
  const [item] = build([order()]);
  assert.equal(item.stage, 'prepare');
  assert.equal(item.pending, false);
  assert.equal(item.urgent, false);
  assert.equal(item.nextAction, 'Preparar OS');
  assert.deepEqual(item.issues, []);
});

test('Veículo em campo dentro da previsão vai para Retorno sem urgência ou atraso fictício', () => {
  const [item] = build([order({ status: 'Em andamento', starts_at: '2026-10-21T08:00:00-03:00', trips: [{ return_km: null }] })]);
  assert.equal(item.stage, 'return');
  assert.equal(item.pending, false);
  assert.equal(item.urgent, false);
  assert.equal(item.today, true);
  assert.equal(item.issues[0].label, 'Veículo em campo');
  assert.match(item.issues[0].detail, /dentro da previsão/);
});

test('OS encerrada com viagem aberta não some mesmo fora do mês selecionado', () => {
  const [item] = build([order({ status: 'Cancelada', starts_at: '2026-08-01T08:00:00-03:00', ends_at: '2026-08-02T17:00:00-03:00', trips: [{ return_km: null }] })]);
  assert.equal(item.stage, 'return');
  assert.equal(item.urgent, true);
  assert.equal(item.pending, true);
  assert.equal(item.nextAction, 'Conferir retorno');
});

test('Histórico regular fica fora do quadro; cancelamento não cria obrigação de horas', () => {
  const items = build([
    order({ id: 'regular', status: 'Concluída', logged_members: ['ana'] }),
    order({ id: 'cancelada', status: 'Cancelada' }),
    order({ id: 'faltam-horas', status: 'Concluída' }),
    order({ id: 'checklist-cancelada', status: 'Cancelada', pending_checklists: 1 }),
  ]);
  assert.deepEqual(items.map(item => item.order.id), ['checklist-cancelada', 'faltam-horas']);
  assert.equal(items.find(item => item.order.id === 'faltam-horas').stage, 'review');
  assert.equal(items.find(item => item.order.id === 'faltam-horas').nextAction, 'Conferir horas');
  assert.match(items.find(item => item.order.id === 'faltam-horas').issues[0].detail, /Ana Conceição/);
});

test('Preparação incompleta é exibida como não verificada; turnos e modelos usam evidência real', () => {
  const [unknown] = build([order({ missing_shift_members: undefined })]);
  assert.equal(unknown.pending, false);
  assert.equal(unknown.issues[0].tone, 'unknown');
  const [pending] = build([order({ missing_shift_members: [person], missing_checklist_models: [{ id: 'model', name: 'iScan Lite' }] })]);
  assert.equal(pending.pending, true);
  assert.equal(pending.nextAction, 'Conferir turnos');
  assert.equal(pending.issues.find(issue => issue.key === 'shifts').detail, 'Ana Conceição');
  assert.equal(pending.issues.find(issue => issue.key === 'models').detail, 'iScan Lite');
});

test('Avisos dos pontos e aprovação pendente são vinculados só à OS correta', () => {
  const rows = [{ id: 'e1', order_id: 'o1', end: '17:00', status: 'Aprovado' }, { id: 'e2', order_id: 'o2', end: '17:00', status: 'Pendente' }];
  const items = build([order(), order({ id: 'o2', official_number: '4900' })], { rows, reviewIds: new Set(['e1']) });
  assert.deepEqual(items.find(item => item.order.id === 'o1').issues.map(issue => issue.key), ['review-hours']);
  assert.deepEqual(items.find(item => item.order.id === 'o2').issues.map(issue => issue.key), ['pending-hours']);
  assert.equal(items[0].nextAction, 'Conferir horas');
});

test('Busca reúne número oficial, equipe, cliente e equipamento sem acentos', () => {
  const items = build([order(), order({ id: 'o2', official_number: '4900', team: [{ id: 'bruno', name: 'Bruno' }], missing_shift_members: [person] })]);
  assert.deepEqual(filterOperationalOrders(items, '4831', false).map(item => item.order.id), ['o1']);
  assert.equal(filterOperationalOrders(items, 'fabrica', false).length, 2);
  assert.equal(filterOperationalOrders(items, 'conceicao', false).length, 1);
  assert.equal(filterOperationalOrders(items, 'ISCAN LITE', false).length, 2);
  assert.deepEqual(filterOperationalOrders(items, '', true).map(item => item.order.id), ['o2']);
  assert.deepEqual(filterOperationalOrders(items, '4900', true).map(item => item.order.id), ['o2']);
});

test('Previsão respeita Brasília e projeção não altera OS ou registros', () => {
  const orders = [order({ starts_at: '2026-10-22T01:00:00Z', ends_at: '2026-10-22T02:00:00Z' })];
  const before = structuredClone(orders);
  const schedule = operationSchedule(orders[0], '2026-10-21');
  assert.equal(schedule.compactSchedule, 'Hoje · 22:00–23:00');
  assert.equal(schedule.today, true);
  build(orders);
  assert.deepEqual(orders, before);
});

test('OS vencida sem veículo aparece em Conferir e acesso somente a checklist é omitido', () => {
  const [item] = build([order({ status: 'Em andamento', ends_at: '2026-10-20T17:00:00-03:00' }), order({ id: 'restrita', checklist_only: true })]);
  assert.equal(item.stage, 'review');
  assert.equal(item.urgent, true);
  assert.equal(item.nextAction, 'Rever previsão');
});

test('Descrição da próxima ação segue a mesma prioridade do botão em pendências simultâneas', () => {
  const [inField] = build([order({ status: 'Em andamento', trips: [{ return_km: null }], pending_checklists: 2 })]);
  assert.equal(inField.nextAction, 'Conferir retorno');
  assert.equal(inField.actionIssue.key, 'return');
  assert.match(inField.actionIssue.detail, /retorno do veículo/);
  const [lateWithShift] = build([order({ ends_at: '2026-10-20T17:00:00-03:00', missing_shift_members: [person] })]);
  assert.equal(lateWithShift.nextAction, 'Conferir turnos');
  assert.equal(lateWithShift.actionIssue.key, 'shifts');
  assert.equal(lateWithShift.actionIssue.detail, person.name);
  const [checklists] = build([order({ pending_checklists: 1 })]);
  assert.equal(checklists.nextAction, 'Conferir checklists');
  assert.equal(checklists.actionIssue.key, 'checklists');
  const [regular] = build([order()]);
  assert.equal(regular.actionIssue, undefined);
});

test('Quadro com muitas OS preserva o conjunto completo para busca, filtros e seleção', () => {
  const orders = Array.from({ length: 30 }, (_, index) => order({ id: `os-${index}`, number: index + 1, official_number: String(9000 + index),
    client_name: index === 29 ? 'Última fábrica do quadro' : `Cliente ${index}`, missing_shift_members: index % 2 ? [person] : [] }));
  const items = build(orders);
  assert.equal(items.length, 30);
  assert.equal(filterOperationalOrders(items, '', true).length, 15);
  assert.deepEqual(filterOperationalOrders(items, 'ultima fabrica', false).map(item => item.order.id), ['os-29']);
  assert.deepEqual(filterOperationalOrders(items, '9029', true).map(item => item.order.id), ['os-29']);
  assert.equal(filterOperationalOrders(items, '', false).length, 30);
});
