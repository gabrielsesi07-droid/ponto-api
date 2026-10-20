// Regras de leitura da central do coordenador. Não calcula valores nem altera regras:
// apenas organiza dados já existentes (pontos calculados e OS de /api/operations)
// em pendências acionáveis. Sem imports relativos em tempo de execução para que
// `node --test` consiga carregar o arquivo diretamente.
import type { Calculated, Person } from "./domain";

export type CenterOrder = {
  id: string;
  number: number;
  official_number?: string | null;
  title: string;
  client_name: string;
  status: "Agendada" | "Em andamento" | "Concluída" | "Cancelada";
  starts_at: string;
  ends_at: string;
  priority?: string;
  team: { id: string; name: string }[];
  logged_members?: string[];
  pending_checklists?: number;
  active_points?: number;
  trips: { return_km: number | null }[];
};

export type Severity = "urgent" | "attention";
export type CenterAction =
  | { kind: "entries"; userId?: string; status?: string; month?: string }
  | { kind: "order"; orderId: string }
  | { kind: "orders" }
  | { kind: "people" };
export type CenterTask = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  cta: string;
  action: CenterAction;
};

const BRT = "America/Sao_Paulo";
/** Data civil (AAAA-MM-DD) em horário de Brasília. */
export const brtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export const brtTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRT,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
export const shortDate = (date: string) =>
  date.slice(8, 10) + "/" + date.slice(5, 7);
export const monthLabel = (month: string) =>
  month.slice(5, 7) + "/" + month.slice(0, 4);
import { orderLabel as osLabel } from "./order-label.mjs";
export { osLabel };
export function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}
const names = (list: string[], max = 3) =>
  list.length <= max
    ? list.join(", ")
    : list.slice(0, max).join(", ") + ` e mais ${list.length - max}`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Pontos com saída e ainda não aprovados ("Revisado" também aguarda aprovação), por pessoa. */
export function approvalGroups(rows: Calculated[], users: Person[]) {
  const byUser = new Map<string, Calculated[]>();
  for (const e of rows)
    if (e.end && e.status !== "Aprovado")
      byUser.set(e.user_id, [...(byUser.get(e.user_id) || []), e]);
  return [...byUser.entries()]
    .map(([userId, entries]) => {
      const sorted = [...entries].sort((a, b) =>
        (a.date + a.start).localeCompare(b.date + b.start),
      );
      return {
        userId,
        name: users.find((u) => u.id === userId)?.name || "Pessoa removida",
        count: entries.length,
        reviewed: entries.filter((e) => e.status === "Revisado").length,
        oldest: sorted[0].date,
        worked: entries.reduce((n, e) => n + e.worked, 0),
        extra: entries.reduce((n, e) => n + e.extra, 0),
        entries: sorted,
      };
    })
    .sort((a, b) => a.oldest.localeCompare(b.oldest) || b.count - a.count);
}

/** Pontos sem saída: impedem aprovação e fechamento. */
export function openEntryGroups(rows: Calculated[], users: Person[]) {
  const byUser = new Map<string, number>();
  for (const e of rows)
    if (!e.end) byUser.set(e.user_id, (byUser.get(e.user_id) || 0) + 1);
  return [...byUser.entries()].map(([userId, count]) => ({
    userId,
    name: users.find((u) => u.id === userId)?.name || "Pessoa removida",
    count,
  }));
}

/** Mesma leitura de `membersWithoutHours` (lib/order-lifecycle): só avisa quando a API informa quem lançou. */
export function missingHoursPeople(order: Pick<CenterOrder, "team" | "logged_members">) {
  if (!order.logged_members) return [];
  const logged = new Set(order.logged_members);
  return order.team.filter((p) => !logged.has(p.id));
}

/** O que impede concluir uma OS aberta, a partir dos dados de /api/operations. */
export function orderBlockers(order: CenterOrder) {
  const out: string[] = [];
  if (Number(order.active_points || 0) > 0)
    out.push(plural(Number(order.active_points), "ponto sem saída", "pontos sem saída"));
  if (order.trips.some((t) => t.return_km === null)) out.push("veículo sem retorno");
  if (Number(order.pending_checklists || 0) > 0)
    out.push(plural(Number(order.pending_checklists), "checklist pendente", "checklists pendentes"));
  return out;
}

const cancelledPending = (o: CenterOrder) =>
  o.status === "Cancelada" && orderBlockers(o).length > 0;
const isOpen = (o: CenterOrder) => o.status === "Agendada" || o.status === "Em andamento";

/** OS abertas cuja previsão de término já passou (dia anterior a hoje, em Brasília). */
export function overdueOrders<T extends CenterOrder>(orders: T[], today: string) {
  return orders
    .filter((o) => isOpen(o) && brtDate(o.ends_at) < today)
    .sort((a, b) => a.ends_at.localeCompare(b.ends_at));
}

/** Atendimentos abertos que acontecem hoje, em ordem de início. */
export function todayAgenda<T extends CenterOrder>(orders: T[], today: string) {
  return orders
    .filter((o) => isOpen(o) && brtDate(o.starts_at) <= today && brtDate(o.ends_at) >= today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** OS concluídas no período com integrante designado sem nenhuma hora lançada. */
export function ordersMissingHours<T extends CenterOrder>(
  orders: T[],
  period: { from: string; to: string },
) {
  return orders
    .filter((o) => {
      const d = brtDate(o.starts_at);
      return o.status === "Concluída" && d >= period.from && d <= period.to;
    })
    .map((order) => ({ order, people: missingHoursPeople(order) }))
    .filter((x) => x.people.length > 0);
}

export type ClosingStep = {
  id: "ended" | "entries" | "exits" | "approved" | "rates" | "hours";
  label: string;
  done: boolean;
  /** Bloqueia o fechamento no servidor; avisos apenas orientam. */
  blocking: boolean;
  /** Não foi possível verificar (por exemplo, OS ainda não carregadas). */
  unknown?: boolean;
  detail: string;
};

/**
 * Espelha as condições já exigidas por `month_action` (mês encerrado, registros com saída e aprovados)
 * e acrescenta avisos que não bloqueiam: valor-hora zero e integrantes de OS concluída sem horas.
 */
export function closingChecklist(input: {
  month: string;
  today: string;
  entries: Calculated[];
  closed: boolean;
  /** `null` quando as OS não estão disponíveis: o aviso fica "não verificado", nunca "em dia". */
  missingHours: number | null;
}) {
  const inMonth = input.entries.filter((e) => e.date.slice(0, 7) === input.month);
  const open = inMonth.filter((e) => !e.end).length,
    pending = inMonth.filter((e) => e.end && e.status !== "Aprovado").length,
    zeroRate = inMonth.filter((e) => e.end && !Number(e.rate)).length,
    ended = input.month < input.today.slice(0, 7);
  const next = new Date(input.month + "-01T12:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const steps: ClosingStep[] = [
    {
      id: "ended",
      label: "Mês encerrado",
      done: ended,
      blocking: true,
      detail: ended
        ? "O período já terminou."
        : `Fechamento disponível a partir de ${shortDate(next.toISOString().slice(0, 10))}.`,
    },
    {
      id: "entries",
      label: "Há registros no mês",
      done: inMonth.length > 0,
      blocking: true,
      detail: inMonth.length ? plural(inMonth.length, "registro", "registros") + " no mês." : "Nenhum ponto lançado ainda.",
    },
    {
      id: "exits",
      label: "Todos os pontos com saída",
      done: open === 0,
      blocking: true,
      detail: open ? plural(open, "ponto sem saída", "pontos sem saída") + "." : "Nenhum ponto em aberto.",
    },
    {
      id: "approved",
      label: "Todos os pontos aprovados",
      done: pending === 0,
      blocking: true,
      detail: pending ? plural(pending, "ponto aguardando", "pontos aguardando") + " aprovação." : "Nada aguardando aprovação.",
    },
    {
      id: "rates",
      label: "Valor-hora informado nos pontos",
      done: zeroRate === 0,
      blocking: false,
      detail: zeroRate
        ? plural(zeroRate, "ponto registrado", "pontos registrados") + " com valor-hora zero: o valor estimado de extras fica zerado."
        : "Todos os pontos têm valor-hora.",
    },
    {
      id: "hours",
      label: "Equipe das OS concluídas com horas",
      done: input.missingHours === 0,
      blocking: false,
      unknown: input.missingHours === null,
      detail:
        input.missingHours === null
          ? "Não verificado: as ordens de serviço não estão disponíveis agora."
          : input.missingHours
            ? plural(input.missingHours, "OS concluída tem", "OS concluídas têm") + " integrante sem horas. Não impede o fechamento."
            : "Nenhuma ausência de horas identificada.",
    },
  ];
  const blockers = steps.filter((s) => s.blocking && !s.done);
  const state: "closed" | "ready" | "blocked" | "running" = input.closed
    ? "closed"
    : !ended
      ? "running"
      : blockers.length
        ? "blocked"
        : "ready";
  return { state, steps, open, pending, zeroRate, total: inMonth.length };
}

/** Fila priorizada de pendências do coordenador. Urgente primeiro; dentro de cada grupo, o mais antigo primeiro. */
export function coordinatorQueue(input: {
  today: string;
  month: string;
  rows: Calculated[];
  users: Person[];
  orders: CenterOrder[];
  period: { from: string; to: string };
  previous?: { month: string; state: ReturnType<typeof closingChecklist>["state"]; open: number; pending: number };
}) {
  const tasks: CenterTask[] = [];
  const open = openEntryGroups(input.rows, input.users);
  if (open.length) {
    const total = open.reduce((n, g) => n + g.count, 0);
    tasks.push({
      id: "open-entries",
      severity: "urgent",
      title: plural(total, "ponto sem saída", "pontos sem saída"),
      detail: `${names(open.map((g) => g.name))}. Sem saída o ponto não pode ser aprovado nem o mês fechado.`,
      cta: "Ver pontos",
      action: { kind: "entries", userId: open.length === 1 ? open[0].userId : undefined, month: input.month },
    });
  }
  for (const o of overdueOrders(input.orders, input.today)) {
    const blockers = orderBlockers(o);
    tasks.push({
      id: "overdue-" + o.id,
      severity: "urgent",
      title: `${osLabel(o.number, o.official_number)} passou da previsão sem conclusão`,
      detail: `${o.client_name} · previsão ${shortDate(brtDate(o.ends_at))}${blockers.length ? " · " + blockers.join(", ") : o.status === "Agendada" ? " · ainda sem horas ou saída de veículo" : " · pronta para registrar o resultado"}.`,
      cta: "Abrir OS",
      action: { kind: "order", orderId: o.id },
    });
  }
  if (input.previous && input.previous.state === "blocked")
    tasks.push({
      id: "closing-" + input.previous.month,
      severity: "urgent",
      title: `Fechamento de ${monthLabel(input.previous.month)} pendente`,
      detail: [
        input.previous.open && plural(input.previous.open, "ponto sem saída", "pontos sem saída"),
        input.previous.pending && plural(input.previous.pending, "ponto a aprovar", "pontos a aprovar"),
      ]
        .filter(Boolean)
        .join(" · ") + ".",
      cta: "Resolver e fechar",
      action: { kind: "entries", month: input.previous.month },
    });
  if (input.previous && input.previous.state === "ready")
    tasks.push({
      id: "closing-" + input.previous.month,
      severity: "attention",
      title: `${monthLabel(input.previous.month)} pronto para fechar`,
      detail: "Todos os pontos têm saída e estão aprovados.",
      cta: "Fechar mês",
      action: { kind: "entries", month: input.previous.month },
    });
  const approvals = approvalGroups(input.rows, input.users);
  if (approvals.length) {
    const total = approvals.reduce((n, g) => n + g.count, 0);
    tasks.push({
      id: "approvals",
      severity: "attention",
      title: plural(total, "ponto aguardando aprovação", "pontos aguardando aprovação"),
      detail: `${plural(approvals.length, "pessoa", "pessoas")} · mais antigo de ${shortDate(approvals[0].oldest)}.`,
      cta: "Revisar",
      action: { kind: "entries", userId: approvals.length === 1 ? approvals[0].userId : undefined, month: input.month },
    });
  }
  for (const o of input.orders.filter(cancelledPending))
    tasks.push({
      id: "cancelled-" + o.id,
      severity: "attention",
      title: `${osLabel(o.number, o.official_number)} cancelada com pendências`,
      detail: `${o.client_name} · ${orderBlockers(o).join(", ")}.`,
      cta: "Abrir OS",
      action: { kind: "order", orderId: o.id },
    });
  for (const { order, people } of ordersMissingHours(input.orders, input.period))
    tasks.push({
      id: "missing-" + order.id,
      severity: "attention",
      title: `${osLabel(order.number, order.official_number)} concluída sem horas de ${plural(people.length, "integrante", "integrantes")}`,
      detail: `${names(people.map((p) => p.name))} ainda não registrou horas · ${order.client_name}.`,
      cta: "Abrir OS",
      action: { kind: "order", orderId: order.id },
    });
  const noRate = input.users.filter((u) => u.active && !Number(u.hourly_rate));
  if (noRate.length)
    tasks.push({
      id: "no-rate",
      severity: "attention",
      title: plural(noRate.length, "pessoa ativa sem valor-hora", "pessoas ativas sem valor-hora"),
      detail: `${names(noRate.map((u) => u.name))}. Pontos lançados antes do salário mantêm valor estimado zero.`,
      cta: "Ver equipe",
      action: { kind: "people" },
    });
  return tasks;
}
