export type PointOrder = {
  id: string;
  number: number;
  title: string;
  client_name: string;
  status: string;
  start_date: string;
  assigned: boolean;
};
export const pointOrderNumber = (number: number) => `OS-${String(number).padStart(6, '0')}`;
export function availablePointOrders(orders: PointOrder[], day: string, live: boolean, existingId?: string | null, workType: 'work' | 'travel' = 'work') {
  return orders.filter(o => o.id === existingId || (o.assigned && (o.start_date <= day || (!live && workType === 'travel')) &&
    (!live || o.status === 'Agendada' || o.status === 'Em andamento')));
}
