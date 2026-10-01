import { defaults, today, type Person, type State } from './domain';
import type { OperationsData } from './orders';
import { buildDemoScenario } from './demo-scenario';

export function demoState(): State {
  return buildDemoScenario(defaults, today()).state;
}

export function demoOperations(me: Person): OperationsData {
  const scenario = buildDemoScenario(defaults, today());
  if (me.role === 'coordinator') return scenario.operations;
  return {
    ...scenario.operations,
    orders: scenario.operations.orders.filter(order => order.members.includes(me.id)).map(order => ({
      ...order, logged_members: order.logged_members?.filter(id => id === me.id),
    })),
  };
}

export function demoChecklists(orderId: string) {
  return buildDemoScenario(defaults, today()).checklists.filter(checklist => checklist.order_id === orderId);
}
