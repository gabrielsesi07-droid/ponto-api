type PendingOrder = { status: string; active_points?: number; pending_checklists?: number; trips: { return_km: number | null }[] };
/** Etapas obrigatórias. O início é automático (horas registradas ou saída do veículo); basta o dia agendado ter chegado. */
export function closeoutSteps(order: PendingOrder, result: string, dayReached = true) {
  return [
    { id: 'day', label: 'Dia agendado do atendimento', done: dayReached && ['Agendada', 'Em andamento'].includes(order.status), help: 'A OS só pode ser concluída a partir do dia agendado, no horário de Brasília.' },
    { id: 'points', label: 'Nenhum registro incompleto ou cronômetro antigo aberto', done: order.active_points === 0, help: order.active_points === undefined ? 'Atualize a OS para verificar os registros.' : `${order.active_points} registro(s) aberto(s). Resolva o cronômetro antigo em Meu ponto ou preencha a saída no histórico. Horas ainda não lançadas podem ser registradas após concluir a OS.` },
    { id: 'vehicle', label: 'Viagens encerradas', done: !order.trips.some(t => t.return_km === null), help: 'Uma pessoa da equipe deve informar a leitura do veículo no retorno.' },
    { id: 'equipment', label: 'Checklists vinculados finalizados', done: order.pending_checklists === 0, help: order.pending_checklists === undefined ? 'Atualize a OS para verificar as conferências.' : `${order.pending_checklists} checklist(s) pendente(s). Um colaborador designado confere a ida e a volta.` },
    { id: 'result', label: 'Resultado do serviço preenchido', done: result.trim().length >= 3, help: 'Descreva abaixo o que foi realizado (mínimo de 3 caracteres).' },
  ];
}
export const orderStatusFilters = (history: boolean) => history
  ? ['Todas', 'Concluída', 'Cancelada', 'Pendências']
  : ['Todas', 'Abertas', 'Agendada', 'Em andamento'];
export function hasCancelledPending(order: PendingOrder) {
  return order.status === 'Cancelada' && (Number(order.active_points || 0) > 0 || Number(order.pending_checklists || 0) > 0 || order.trips.some(trip => trip.return_km === null));
}
export function matchesOrderFilter(order: PendingOrder, filter: string) {
  if (filter === 'Todas') return true;
  if (filter === 'Pendências') return hasCancelledPending(order);
  if (filter === 'Abertas') return ['Agendada', 'Em andamento'].includes(order.status);
  return order.status === filter;
}
export function matchesOrderSection(order: PendingOrder, history: boolean, filter: string) {
  const statuses = history ? ['Concluída', 'Cancelada'] : ['Agendada', 'Em andamento'];
  return statuses.includes(order.status) && matchesOrderFilter(order, filter);
}

/** Aviso, não bloqueio: horas podem ser registradas depois de concluir a OS. */
export function membersWithoutHours(order: { team: { id: string; name: string }[]; logged_members?: string[] }) {
  if (!order.logged_members) return [];
  const logged = new Set(order.logged_members);
  return order.team.filter(person => !logged.has(person.id));
}
