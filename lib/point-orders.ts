export type PointOrder = {
  id: string;
  number: number;
  official_number?: string | null;
  title: string;
  client_name: string;
  status: string;
  start_date: string;
  assigned: boolean;
};
export { orderLabel as pointOrderNumber } from './order-label.mjs';
export function availablePointOrders(orders: PointOrder[], day: string, live: boolean, existingId?: string | null) {
  return orders.filter(o => o.id === existingId || (o.assigned && o.start_date <= day &&
    (!live || o.status === 'Agendada' || o.status === 'Em andamento')));
}
