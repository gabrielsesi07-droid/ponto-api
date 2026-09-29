import { z } from "zod";
import { checklistItemsSchema, plannedChecklistItems } from './checklists';

export type ServiceClient = {
  id: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
  notes: string;
  active: boolean;
};
export type Vehicle = {
  id: string;
  plate: string;
  model: string;
  odometer: number;
  maintenance_km: number | null;
  active: boolean;
  notes: string;
  version: number;
};
export type Trip = {
  id: string;
  order_id: string;
  vehicle_id: string;
  departure_km: number;
  return_km: number | null;
  departed_at: string;
  returned_at: string | null;
  departed_by: string;
  returned_by: string | null;
};
export type Order = {
  id: string;
  number: number;
  title: string;
  client_id: string | null;
  client_name: string;
  address: string;
  place_id: string;
  contact: string;
  phone: string;
  starts_at: string;
  ends_at: string;
  members: string[];
  team: { id: string; name: string; access_code?: string }[];
  vehicle_id: string | null;
  equipment: string;
  model_ids?: string[];
  instructions: string;
  priority: string;
  status: "Agendada" | "Em andamento" | "Concluída" | "Cancelada";
  completion: string;
  version: number;
  pdf_name: string | null;
  acknowledgements: { user_id: string; version: number }[];
  trips: Trip[];
  events: {
    id: number;
    name: string;
    action: string;
    detail: string;
    created_at: string;
  }[];
};
export type OperationsData = {
  orders: Order[];
  vehicles: Vehicle[];
  clients: ServiceClient[];
  people: { id: string; name: string; access_code?: string; active: boolean }[];
};

const short = z.string().trim().max(160);
export const orderSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    title: short.min(2, "Descreva o serviço."),
    client_id: z.string().uuid().nullable().default(null),
    client_name: short.default(""),
    address: z.string().trim().max(500).default(""),
    place_id: z.string().max(300).default(""),
    contact: short.default(""),
    phone: z.string().max(40).default(""),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    members: z
      .array(z.string().uuid())
      .min(1, "Designe pelo menos uma pessoa.")
      .max(100)
      .transform((x) => [...new Set(x)]),
    vehicle_id: z.string().uuid().nullable(),
    equipment: z.string().trim().max(3000).default(""),
    model_ids: z.array(z.string().uuid()).max(30).transform(ids => [...new Set(ids)]).default([]),
    checklist_drafts: z.array(z.object({ model_id: z.string().uuid(), template_version: z.number().int().positive(),
      title: z.string().trim().min(2).max(180), items: checklistItemsSchema.transform(plannedChecklistItems),
    })).max(30).default([]),
    instructions: z.string().trim().max(5000).default(""),
    priority: z.enum(["Normal", "Alta", "Urgente"]).default("Normal"),
  })
  .refine((p) => !!p.client_id || p.client_name.length >= 2, {
    path: ["client_name"],
    message: "Informe o nome do cliente.",
  })
  .refine((p) => new Date(p.ends_at) > new Date(p.starts_at), {
    message: "A previsão de término deve ser após o início.",
  });
export const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s.replace(/[ -]/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/,
          "Informe uma placa brasileira válida.",
        ),
    ),
  model: short.min(2, "Informe o modelo."),
  odometer: z.coerce.number().int().min(0).max(9999999),
  maintenance_km: z.number().int().min(0).max(9999999).nullable(),
  active: z.boolean(),
  notes: z.string().max(2000).default(""),
});
export const serviceClientSchema = z.object({
  id: z.string().uuid().optional(),
  name: short.min(2, "Informe o cliente."),
  address: z.string().trim().max(500).default(""),
  contact: short.default(""),
  phone: z.string().max(40).default(""),
  notes: z.string().max(2000).default(""),
  active: z.boolean().default(true),
});
export function mapsUrl(order: Pick<Order, "address" | "place_id">) {
  const query = new URLSearchParams({
    api: "1",
    destination: order.address,
    travelmode: "driving",
    dir_action: "navigate",
  });
  if (order.place_id) query.set("destination_place_id", order.place_id);
  return "https://www.google.com/maps/dir/?" + query;
}
export function localDateTime(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");
}
export const orderNumber = (n: number) => "OS-" + String(n).padStart(6, "0");
