import test from 'node:test';
import assert from 'node:assert/strict';
import { closeoutSteps, membersWithoutHours, hasCancelledPending, matchesOrderFilter, matchesOrderSection, orderStatusFilters } from '../lib/order-lifecycle.ts';

test('Conclusão exige dia alcançado, pontos, retorno, checklists e resultado', () => {
  const ready = {status:'Em andamento',active_points:0,pending_checklists:0,trips:[]};
  assert.equal(closeoutSteps(ready, 'Serviço realizado').every(s=>s.done), true);
  // Sem etapa manual de início: OS agendada pode ser concluída a partir do dia previsto.
  assert.equal(closeoutSteps({...ready,status:'Agendada'}, 'Serviço realizado', true).every(s=>s.done), true);
  assert.equal(closeoutSteps({...ready,status:'Agendada'}, 'Serviço realizado', false).every(s=>s.done), false);
  for (const patch of [{status:'Cancelada'}, {status:'Concluída'}, {active_points:1}, {active_points:undefined}, {pending_checklists:1}, {pending_checklists:undefined}, {trips:[{return_km:null}]}]) {
    assert.equal(closeoutSteps({...ready,...patch}, 'Serviço realizado').every(s=>s.done), false);
  }
  assert.equal(closeoutSteps(ready, '  ').every(s=>s.done), false);
  assert.equal(closeoutSteps({...ready,trips:[{return_km:0}]}, 'Feito').every(s=>s.done), true);
});

const cancelled = { status: 'Cancelada', trips: [], active_points: 0, pending_checklists: 0 };
test('Situação oferece Todas como primeira opção e reúne as OS em aberto', () => {
  assert.deepEqual(orderStatusFilters(false), ['Todas', 'Abertas', 'Agendada', 'Em andamento']);
  const orders = ['Agendada', 'Em andamento', 'Concluída', 'Cancelada'].map(status => ({...cancelled, status}));
  assert.deepEqual(orders.filter(o => matchesOrderSection(o, false, orderStatusFilters(false)[0])).map(o => o.status), ['Agendada', 'Em andamento']);
  assert.deepEqual(orderStatusFilters(true), ['Todas', 'Concluída', 'Cancelada', 'Pendências']);
});
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

test('Equipe sem horas registradas é apenas listada, sem inventar dados ausentes', () => {
  const team = [{id:'a',name:'Ana'},{id:'b',name:'Bruno'}];
  assert.deepEqual(membersWithoutHours({team, logged_members:['a']}).map(p=>p.name), ['Bruno']);
  assert.deepEqual(membersWithoutHours({team, logged_members:['a','b']}), []);
  assert.deepEqual(membersWithoutHours({team}), []);
});
