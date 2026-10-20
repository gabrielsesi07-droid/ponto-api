import { defaults, minutes, today, type Person, type State } from './domain';
import type { OperationsData } from './orders';
import { buildDemoScenario } from './demo-scenario';

export function demoState(): State {
  const state = buildDemoScenario(defaults, today()).state;
  // These are fictional schedules; the shared scenario keeps its OS, status and attention cases.
  state.entries = state.entries.map(entry => {
    const pauseStart = entry.end && entry.break_minutes > 0
      ? Math.max(minutes(entry.start), Math.min(720, minutes(entry.end) - entry.break_minutes))
      : null;
    return {
      ...entry,
      work_type: entry.work_type ?? 'work',
      shift: entry.shift ?? { start: '08:00', end: '17:00', break_start: '12:00', break_end: '13:00' },
      break_start: entry.break_start ?? (pauseStart === null ? null : `${String(Math.floor(pauseStart / 60)).padStart(2, '0')}:${String(pauseStart % 60).padStart(2, '0')}`),
    };
  });
  return state;
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
