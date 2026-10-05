import { z } from 'zod';

export const checklistAssignmentSchema = z.object({
  id: z.string().uuid(), version: z.number().int().positive(), assignee_id: z.string().uuid(),
  reason: z.string().trim().min(10, 'Informe um motivo com pelo menos 10 caracteres.').max(500),
});

// An assignment is not OS membership. Explicit projection prevents future query fields leaking to outsiders.
export function checklistOnlyOrder(order: Record<string, unknown>) {
  return {
    id: order.id, number: order.number, official_number: order.official_number, title: order.title, client_name: order.client_name, address: order.address,
    starts_at: order.starts_at, ends_at: order.ends_at, status: order.status, priority: order.priority, version: order.version,
    model_ids: order.assigned_model_ids, equipment_models: order.assigned_equipment_models,
    pending_checklists: order.assigned_pending_checklists, checklist_only: true,
    client_id: null, place_id: '', contact: '', phone: '', members: [], team: [], vehicle_id: null,
    equipment: '', instructions: '', completion: '', pdf_name: null, can_delete: false,
    active_points: 0, my_point_active: false, logged_members: [], acknowledgements: [], trips: [], events: [],
  };
}
