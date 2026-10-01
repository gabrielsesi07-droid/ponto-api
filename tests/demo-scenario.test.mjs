import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoScenario } from '../lib/demo-scenario.ts';
import { defaults, calculate } from '../lib/domain.ts';
import { checklistProblems } from '../lib/checklists.ts';
import { closeoutSteps } from '../lib/order-lifecycle.ts';

for (const day of ['2026-10-01', '2026-01-01', '2026-03-31', '2028-03-01']) {
  test(`Demo mantém vínculos, calendário e fechamento coerentes em ${day}`, () => {
    const { state, operations, checklists } = buildDemoScenario(defaults, day);
    const orders = new Map(operations.orders.map(order => [order.id, order]));
    assert.equal(orders.size, operations.orders.length);
    assert.equal(new Set(operations.orders.map(order => order.number)).size, operations.orders.length);
    assert.equal(new Set(state.entries.map(entry => entry.id)).size, state.entries.length);
    for (const entry of state.entries) {
      const order = orders.get(entry.order_id);
      assert.ok(order);
      assert.equal(entry.order_number, order.number);
      assert.equal(entry.company, order.client_name);
      assert.equal(entry.service, order.title);
      assert.ok(order.members.includes(entry.user_id));
      assert.equal(new Date(entry.date + 'T12:00:00Z').toISOString().slice(0, 10), entry.date);
      assert.ok(entry.date <= day);
      assert.ok(entry.start < entry.end);
    }
    for (const order of operations.orders) {
      const logged = [...new Set(state.entries.filter(entry => entry.order_id === order.id).map(entry => entry.user_id))];
      assert.deepEqual(order.logged_members.sort(), logged.sort());
      assert.equal(order.pending_checklists, checklists.filter(c => c.order_id === order.id && c.status === 'open' && !c.detached).length);
      for (const trip of order.trips) {
        assert.equal(trip.order_id, order.id);
        assert.equal(trip.vehicle_id, order.vehicle_id);
        assert.ok(operations.vehicles.some(vehicle => vehicle.id === trip.vehicle_id));
        assert.ok(trip.return_km === null || trip.return_km >= trip.departure_km);
      }
    }
    for (const closed of state.closedMonths) {
      assert.ok(closed.month < day.slice(0, 7));
      const entries = state.entries.filter(entry => entry.date.startsWith(closed.month));
      assert.ok(entries.length);
      assert.ok(entries.every(entry => entry.status === 'Aprovado' && entry.end));
    }
    assert.ok(calculate(state.entries).every(entry => Number.isFinite(entry.amount) && entry.worked >= 0));
  });
}

test('Demo demonstra atraso, pendências, divergência conferida e horas após conclusão', () => {
  const { operations, checklists } = buildDemoScenario(defaults, '2026-10-01');
  const running = operations.orders.find(order => order.id === 'demo-order-running');
  assert.equal(running.status, 'Em andamento');
  assert.ok(running.ends_at < '2026-10-01');
  assert.ok(running.trips.some(trip => trip.return_km === null));
  assert.equal(closeoutSteps(running, 'Feito').every(step => step.done), false);
  const finished = operations.orders.find(order => order.id === 'demo-order-finished');
  assert.ok(finished.members.some(id => !finished.logged_members.includes(id)));
  const checklist = checklists.find(c => c.order_id === finished.id);
  assert.equal(checklist.status, 'completed');
  assert.deepEqual(checklistProblems(checklist.items), []);
  assert.ok(checklist.items.some(item => item.incoming_qty !== item.outgoing_qty && item.notes));
  assert.ok(operations.orders.some(order => order.status === 'Cancelada' && order.pending_checklists > 0));
  assert.ok(operations.orders.some(order => order.status === 'Agendada' && order.starts_at.startsWith('2026-10-01')));
});

test('Cenários independentes preservam as regras e os dados das próximas leituras', () => {
  const before = JSON.stringify(defaults), first = buildDemoScenario(defaults, '2026-10-01');
  first.state.settings.daily_minutes = 1;
  first.state.entries[0].rules.daily_minutes = 1;
  first.operations.orders[0].team[0].name = 'Alterado';
  const second = buildDemoScenario(defaults, '2026-10-01');
  assert.equal(JSON.stringify(defaults), before);
  assert.equal(second.state.settings.daily_minutes, defaults.daily_minutes);
  assert.equal(second.state.entries[0].rules.daily_minutes, defaults.daily_minutes);
  assert.equal(second.operations.orders[0].team[0].name, 'Gabriel Souza');
});
