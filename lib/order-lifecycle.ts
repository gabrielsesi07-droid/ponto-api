type PendingOrder = { status: string; active_points?: number; pending_checklists?: number; trips: { return_km: number | null }[] };
export function closeoutSteps(order: PendingOrder, result: string) {
  return [
    { id: 'service', label: 'Atendimento iniciado', done: order.status === 'Em andamento', help: 'Inicie seu ponto nesta OS ou inicie somente o atendimento.' },
    { id: 'points', label: 'Pontos da equipe encerrados', done: order.active_points === 0, help: order.active_points === undefined ? 'Atualize a OS para verificar os pontos.' : `${order.active_points} ponto(s) aberto(s). Encerre o relógio em Meu ponto ou preencha a saída do registro manual no histórico de pontos.` },
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
