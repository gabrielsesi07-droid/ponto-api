import type { Calculated } from "../lib/domain";
import type { Order } from "../lib/orders";
import { brtDate, brtTime, osLabel, shortDate } from "../lib/coordinator-center.ts";

export type OperationStage = "prepare" | "return" | "review";
export type OperationIssue = {
  key: string;
  label: string;
  detail: string;
  tone: "urgent" | "attention" | "unknown" | "info";
};
export type OperationItem = {
  order: Order;
  stage: OperationStage;
  issues: OperationIssue[];
  pending: boolean;
  urgent: boolean;
  nextAction: string;
  actionIssue?: OperationIssue;
  schedule: string;
  compactSchedule: string;
  today: boolean;
  activeTrips: number;
};

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const countLabel = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const openOrder = (order: Order) => order.status === "Agendada" || order.status === "Em andamento";

export function operationSchedule(order: Pick<Order, "starts_at" | "ends_at">, today: string) {
  const startDay = brtDate(order.starts_at), endDay = brtDate(order.ends_at);
  const start = `${shortDate(startDay)} · ${brtTime(order.starts_at)}`;
  const end = `${shortDate(endDay)} · ${brtTime(order.ends_at)}`;
  return {
    schedule: `${start} — ${end}`,
    compactSchedule: startDay === endDay
      ? `${startDay === today ? "Hoje" : shortDate(startDay)} · ${brtTime(order.starts_at)}–${brtTime(order.ends_at)}`
      : `${shortDate(startDay)} — ${shortDate(endDay)}`,
    today: startDay <= today && endDay >= today,
  };
}

/** Read-only operational projection. It never marks a physical check or closes an order. */
export function operationalOrders(input: {
  orders: Order[];
  rows: Calculated[];
  reviewIds: ReadonlySet<string>;
  today: string;
  period: { from: string; to: string };
}): OperationItem[] {
  const byOrder = new Map<string, Calculated[]>();
  for (const row of input.rows) {
    if (!row.order_id) continue;
    const rows = byOrder.get(row.order_id) || [];
    rows.push(row);
    byOrder.set(row.order_id, rows);
  }
  const result: OperationItem[] = [];
  for (const order of input.orders) {
    if (order.checklist_only) continue;
    const open = openOrder(order), overdue = open && brtDate(order.ends_at) < input.today;
    const activeTrips = order.trips.filter((trip) => trip.return_km === null).length;
    const rows = byOrder.get(order.id) || [];
    const issues: OperationIssue[] = [];
    if (activeTrips) issues.push({
      key: "return", label: open && !overdue ? "Veículo em campo" : "Retorno a registrar",
      detail: open && !overdue ? "O retorno do veículo ainda não foi registrado. A OS permanece dentro da previsão." : "Há saída de veículo sem o registro de retorno.",
      tone: open && !overdue ? "info" : "urgent",
    });
    if (overdue) issues.push({ key: "overdue", label: "Previsão vencida", detail: `O término estava previsto para ${shortDate(brtDate(order.ends_at))}. Confira o andamento ou ajuste a previsão na OS.`, tone: "urgent" });
    if (Number(order.active_points) > 0) issues.push({ key: "open-points", label: countLabel(Number(order.active_points), "ponto sem saída", "pontos sem saída"), detail: "Complete os registros abertos antes de concluir o atendimento.", tone: "attention" });
    if (Number(order.pending_checklists) > 0) issues.push({ key: "checklists", label: countLabel(Number(order.pending_checklists), "checklist em aberto", "checklists em aberto"), detail: "A equipe precisa preencher e conferir os itens da lista vinculada à OS.", tone: "attention" });
    if (open && order.missing_shift_members?.length) issues.push({ key: "shifts", label: countLabel(order.missing_shift_members.length, "turno a confirmar", "turnos a confirmar"), detail: order.missing_shift_members.map((person) => person.name).join(", "), tone: "attention" });
    if (open && order.missing_checklist_models?.length) issues.push({ key: "models", label: "Checklist a atribuir", detail: order.missing_checklist_models.map((model) => model.name).join(", "), tone: "attention" });
    if (open && (!Array.isArray(order.missing_shift_members) || !Array.isArray(order.missing_checklist_models))) issues.push({ key: "unknown-preparation", label: "Preparação não verificada", detail: "Não foi possível verificar todos os turnos e checklists desta OS.", tone: "unknown" });
    if (order.status === "Concluída" && Array.isArray(order.logged_members)) {
      const logged = new Set(order.logged_members);
      const missing = order.team.filter((person) => !logged.has(person.id));
      if (missing.length) issues.push({ key: "missing-hours", label: countLabel(missing.length, "integrante sem horas", "integrantes sem horas"), detail: missing.map((person) => person.name).join(", "), tone: "attention" });
    }
    const warnings = rows.filter((row) => input.reviewIds.has(row.id));
    if (warnings.length) issues.push({ key: "review-hours", label: countLabel(warnings.length, "ponto a conferir", "pontos a conferir"), detail: "Há aviso de cálculo ou jornada longa nos registros do período selecionado.", tone: "attention" });
    const pending = rows.filter((row) => row.end && row.status !== "Aprovado");
    if (pending.length) issues.push({ key: "pending-hours", label: countLabel(pending.length, "ponto a regularizar", "pontos a regularizar"), detail: "Estes registros continuam pendentes de aprovação no período selecionado.", tone: "attention" });
    const hasPending = issues.some((issue) => issue.tone === "attention" || issue.tone === "urgent");
    const touchesPeriod = brtDate(order.starts_at) <= input.period.to && brtDate(order.ends_at) >= input.period.from;
    // Keep the working queue focused. Finished history remains available in the OS page.
    if (!open && (!hasPending || (!touchesPeriod && rows.length === 0 && activeTrips === 0))) continue;
    const stage: OperationStage = activeTrips ? "return" : !open || overdue ? "review" : "prepare";
    const actionKey = activeTrips ? "return" : ["shifts", "models", "checklists", "open-points", "missing-hours", "review-hours", "pending-hours", "overdue", "unknown-preparation"]
      .find((key) => issues.some((issue) => issue.key === key));
    const actionIssue = issues.find((issue) => issue.key === actionKey);
    const actionLabels: Record<string, string> = {
      return: "Conferir retorno", shifts: "Conferir turnos", models: "Atribuir checklist", checklists: "Conferir checklists",
      "open-points": "Conferir horas", "missing-hours": "Conferir horas", "review-hours": "Conferir horas", "pending-hours": "Conferir horas", overdue: "Rever previsão",
    };
    const nextAction = (actionKey && actionLabels[actionKey]) || (order.status === "Em andamento" ? "Acompanhar OS" : "Preparar OS");
    result.push({ order, stage, issues, pending: hasPending, urgent: issues.some((issue) => issue.tone === "urgent"), nextAction, actionIssue, activeTrips, ...operationSchedule(order, input.today) });
  }
  return result.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.order.starts_at.localeCompare(b.order.starts_at) || a.order.id.localeCompare(b.order.id));
}

export function filterOperationalOrders(items: OperationItem[], query: string, pendingOnly: boolean) {
  const search = normalize(query.trim());
  return items.filter((item) => (!pendingOnly || item.pending) && (!search || normalize([
    osLabel(item.order.number, item.order.official_number), String(item.order.number), item.order.official_number || "",
    item.order.client_name, item.order.title, item.order.address, ...item.order.team.map((person) => person.name),
    ...(item.order.equipment_models || []).map((model) => model.name),
  ].join(" ")).includes(search)));
}
