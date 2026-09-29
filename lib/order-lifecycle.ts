type PendingOrder = { status: string; active_points?: number; pending_checklists?: number; trips: { return_km: number | null }[] };
export function hasCancelledPending(order: PendingOrder) {
  return order.status === 'Cancelada' && (Number(order.active_points || 0) > 0 || Number(order.pending_checklists || 0) > 0 || order.trips.some(trip => trip.return_km === null));
}
export function matchesOrderFilter(order: PendingOrder, filter: string) {
  if (filter === 'Todas') return true;
  if (filter === 'Pendências') return hasCancelledPending(order);
  if (filter === 'Abertas') return ['Agendada', 'Em andamento'].includes(order.status) || hasCancelledPending(order);
  return order.status === filter;
}
