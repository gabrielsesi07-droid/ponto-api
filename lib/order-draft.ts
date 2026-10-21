import type { Order, OperationsData } from './orders';

/** Planning fields only: a similar OS always starts with fresh execution records. */
export function reusableOrderDraft(source: Order, data: OperationsData) {
  return {
    title: source.title,
    client_id: data.clients.some(client => client.id === source.client_id && client.active) ? source.client_id || '' : '',
    client_name: source.client_name, address: source.address, place_id: source.place_id,
    contact: source.contact, phone: source.phone,
    members: [...source.members].filter(id => data.people.some(person => person.id === id && person.active)),
    vehicle_id: data.vehicles.some(vehicle => vehicle.id === source.vehicle_id && vehicle.active) ? source.vehicle_id || '' : '',
    equipment: source.equipment, model_ids: [...(source.model_ids || [])].filter(id => source.equipment_models?.find(model => model.id === id)?.status !== 'archived'),
    instructions: source.instructions, priority: source.priority,
  };
}
