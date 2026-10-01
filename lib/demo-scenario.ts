import type { Client, Entry, Person, Rules, State } from './domain';
import type { OperationsData, Order, ServiceClient } from './orders';
import type { OrderChecklist } from './checklists';
import type { EquipmentModel } from './library';

export type DemoScenario = { state: State; operations: OperationsData; checklists: OrderChecklist[]; equipments: EquipmentModel[] };
const shiftDay = (day: string, amount: number) => {
  const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const stamp = (day: string, time = '08:00') => `${day}T${time}:00-03:00`;

/** Shared read-only data for hours, operations and coordinator attention. */
export function buildDemoScenario(settings: Rules, day: string): DemoScenario {
  const month = day.slice(0, 7), last = Number(day.slice(8));
  const users: Person[] = ['Gabriel Souza', 'Ana Lima', 'Carlos Mendes', 'Marina Costa'].map((name, i) => ({
    id: 'demo-' + (i + 1), name, access_code: 'HC-' + String(i + 1001).padStart(6, '0'),
    username: name.split(' ')[0].toLowerCase(), email: i ? `colaborador${i - 1}@example.com` : 'coordenador@example.com',
    role: i ? 'employee' : 'coordinator', job: i ? 'Técnico de campo' : 'Coordenador técnico', phone: '',
    hourly_rate: [34, 29, 31.5, 28.5][i], monthly_salary: [6800, 5800, 6300, 5700][i], monthly_hours: 200,
    active: true, can_edit: true, pin_change_required: false, pin_change_prompted: false,
  }));
  // Retain State's legacy fields while OperationsData uses service-client fields.
  const clients: (Client & ServiceClient)[] = ['Unidade Industrial Sul', 'Centro Logístico Aurora', 'Edifício Horizonte', 'Fábrica Nova Era'].map((name, i) => ({
    id: 'client-' + i, name, city: ['Curitiba', 'São Paulo', 'Campinas', 'Joinville'][i], state: ['PR', 'SP', 'SP', 'SC'][i],
    service_type: ['Manutenção', 'Instalação', 'Inspeção', 'Comissionamento'][i],
    address: ['Rua das Indústrias, 120, Curitiba - PR', 'Avenida Paulista, 1578, São Paulo - SP', 'Rua das Flores, 80, Campinas - SP', 'Rua do Porto, 240, Joinville - SC'][i],
    contact: 'Recepção técnica', phone: '', notes: 'Cliente fictício de demonstração.', active: true, has_history: true,
  }));
  const equipments: EquipmentModel[] = [{ id: 'demo-model', name: 'Kit de manutenção elétrica', family: 'Instrumentos e ferramentas', status: 'published', version: 1, document_count: 0 }];
  const vehicles: OperationsData['vehicles'] = [{ id: 'demo-vehicle', plate: 'ABC1D23', model: 'Fiorino · Equipe técnica', odometer: 42850, maintenance_km: 45000, active: true, notes: 'Conferir ferramentas antes da saída.', version: 1 }];
  let number = 0;
  const orders: Order[] = [], entries: Entry[] = [], checklists: OrderChecklist[] = [];
  function makeOrder(id: string, date: string, client: Client & ServiceClient, members: Person[], status: Order['status']): Order {
    const order: Order = {
      id, number: ++number, title: ['Manutenção preventiva de equipamentos', 'Instalação e testes de sensores', 'Inspeção técnica das instalações', 'Acompanhamento de comissionamento'][clients.indexOf(client)],
      client_id: client.id, client_name: client.name, address: client.address, place_id: '', contact: client.contact, phone: client.phone,
      starts_at: stamp(date), ends_at: stamp(date, '18:00'), members: members.map(p => p.id),
      team: members.map(p => ({ id: p.id, name: p.name, access_code: p.access_code })),
      vehicle_id: null, equipment: 'EPIs da equipe', model_ids: [], equipment_models: [],
      instructions: 'Apresentar a OS na portaria e seguir as orientações do cliente.', priority: 'Normal', status,
      completion: status === 'Concluída' ? 'Serviço realizado e instalações testadas.' : '', version: 1, pdf_name: null,
      can_delete: false, active_points: 0, pending_checklists: 0, logged_members: [],
      acknowledgements: members.map(p => ({ user_id: p.id, version: 1 })), trips: [],
      events: [{ id: number, name: users[0].name, action: 'OS criada', detail: 'Histórico fictício de demonstração.', created_at: stamp(date, '07:00') }],
    };
    orders.push(order); return order;
  }
  function addHours(order: Order, person: Person, date: string, status: Entry['status'], end = '18:00') {
    entries.push({ id: `entry-${order.id}-${person.id}`, user_id: person.id, client_id: order.client_id,
      order_id: order.id, order_number: order.number, date, start: '08:00', end, break_minutes: 60, break_mode: 'custom',
      company: order.client_name, service: order.title, service_type: clients.find(c => c.id === order.client_id)!.service_type,
      notes: 'Dados fictícios de demonstração', holiday: false, status, rate: person.hourly_rate, rules: { ...settings }, version: 1,
    });
    if (!order.logged_members!.includes(person.id)) order.logged_members!.push(person.id);
  }
  const historicalMonths = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(month + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() - i - 1);
    return date.toISOString().slice(0, 7);
  });
  for (const [index, key] of [...historicalMonths].reverse().entries()) {
    for (let d = 3; d <= 20; d += 3) {
      const date = key + '-' + String(d).padStart(2, '0');
      const order = makeOrder('demo-history-' + date, date, clients[d % 4], users, 'Concluída');
      users.forEach(person => addHours(order, person, date, 'Aprovado', `${18 + index % 3}:00`));
    }
  }
  for (let d = 1; d < last; d++) {
    const date = month + '-' + String(d).padStart(2, '0');
    if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) continue;
    const order = makeOrder('demo-daily-' + date, date, clients[d % 4], users, 'Concluída');
    users.forEach((person, i) => addHours(order, person, date, d > last - 4 ? 'Pendente' : 'Aprovado', `${17 + (d + i) % 4}:${(d + i) % 2 ? '30' : '00'}`));
  }
  function checklist(order: Order, status: OrderChecklist['status']) {
    order.model_ids = [equipments[0].id]; order.equipment_models = equipments.map(({ id, name, family }) => ({ id, name, family }));
    const completed = status === 'completed';
    checklists.push({ id: 'checklist-' + order.id, order_id: order.id, model_id: equipments[0].id, model_name: equipments[0].name,
      template_version: 1, title: 'Conferência do kit · ida e volta', source_name: '', source_hash: '', status, detached: false,
      identification: 'Kit HC-01', notes: completed ? 'Diferença documentada na devolução.' : 'Conferir a devolução antes de finalizar.', version: 1,
      updated_at: stamp(day, completed ? '07:50' : '11:00'), updated_by_name: order.team[0].name, completed_at: completed ? stamp(day, '07:50') : null, completed_by_name: completed ? order.team[0].name : null,
      items: [
        { id: '00000000-0000-4000-8000-000000000001', label: 'Multímetro', planned: 1, outgoing: true, incoming: completed, outgoing_qty: 1, incoming_qty: completed ? 1 : null, na: false, notes: '' },
        { id: '00000000-0000-4000-8000-000000000002', label: 'Cabos de teste', planned: 2, outgoing: true, incoming: completed, outgoing_qty: 2, incoming_qty: completed ? 1 : null, na: false, notes: completed ? 'Um cabo avariado ficou identificado para reposição; coordenador informado.' : '' },
      ],
    });
    order.pending_checklists = completed ? 0 : 1;
  }
  const running = makeOrder('demo-order-running', shiftDay(day, -1), clients[0], [users[1], users[2]], 'Em andamento');
  running.priority = 'Alta'; running.vehicle_id = vehicles[0].id;
  running.trips = [{ id: 'demo-trip', order_id: running.id, vehicle_id: vehicles[0].id, departure_km: 42850, return_km: null,
    departed_at: stamp(day, '08:00'), returned_at: null, departed_by: users[1].id, returned_by: null }];
  addHours(running, users[1], day, 'Pendente', '11:30'); checklist(running, 'open');
  const finished = makeOrder('demo-order-finished', day, clients[2], [users[1], users[3]], 'Concluída');
  finished.starts_at = stamp(day, '07:00'); finished.ends_at = stamp(day, '11:00');
  finished.vehicle_id = vehicles[0].id;
  finished.trips = [{ id: 'demo-trip-returned', order_id: finished.id, vehicle_id: vehicles[0].id, departure_km: 42810, return_km: 42850,
    departed_at: stamp(day, '06:30'), returned_at: stamp(day, '07:50'), departed_by: users[1].id, returned_by: users[1].id }];
  addHours(finished, users[1], day, 'Pendente', '07:45');
  const finishedEntry = entries[entries.length - 1]; finishedEntry.start = '07:00'; finishedEntry.break_minutes = 0;
  checklist(finished, 'completed');
  const cancelled = makeOrder('demo-order-cancelled', day, clients[1], [users[2]], 'Cancelada');
  cancelled.completion = 'Cliente cancelou o atendimento após a separação do kit. Conferência de devolução ainda pendente.';
  checklist(cancelled, 'open');
  const scheduled = makeOrder('demo-order', day, clients[3], [users[0], users[3]], 'Agendada');
  scheduled.starts_at = stamp(day, '14:00'); scheduled.ends_at = stamp(day, '18:00'); scheduled.can_delete = true; scheduled.acknowledgements = [];
  return {
    state: { me: users[0], users, clients, entries, settings: { ...settings }, timer: null, teamTimers: [],
      closedMonths: [{ month: historicalMonths[0], closed_at: stamp(month + '-01', '09:00'), closed_by: users[0].id }] },
    operations: { orders, vehicles, clients, people: users.map(({ id, name, access_code, active }) => ({ id, name, access_code, active })) },
    checklists, equipments,
  };
}
