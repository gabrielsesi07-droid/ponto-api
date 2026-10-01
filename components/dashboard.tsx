"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  LoaderCircle,
  Lock,
  OctagonAlert,
  Pencil,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { api } from "./editors";
import {
  duration,
  money,
  totals,
  initials,
  today,
  monthBounds,
  isClosedMonth,
  type Calculated,
  type Entry,
  type Person,
  type State,
} from "@/lib/domain";
import { demoOperations } from "@/lib/demo";
import type { OperationsData, Order } from "@/lib/orders";
import {
  approvalGroups,
  brtTime,
  closingChecklist,
  coordinatorQueue,
  monthLabel,
  orderBlockers,
  ordersMissingHours,
  osLabel,
  previousMonth,
  shortDate,
  todayAgenda,
  type CenterAction,
  type CenterTask,
  type ClosingStep,
} from "@/lib/coordinator-center";

function useOperations(demo: boolean, me: Person, version: unknown) {
  const [ops, setOps] = useState<{ orders: Order[]; loading: boolean; error: string; loaded: boolean }>({
    orders: [],
    loading: true,
    error: "",
    loaded: false,
  });
  const request = useRef(0);
  const load = useCallback(async () => {
    const v = ++request.current;
    try {
      const result = demo ? demoOperations(me) : await api<OperationsData>("/api/operations");
      if (v === request.current)
        setOps({ orders: result.orders, loading: false, error: "", loaded: true });
    } catch (e) {
      if (v === request.current)
        setOps((o) => ({ ...o, loading: false, error: (e as Error).message }));
    }
  }, [demo, me]);
  useEffect(() => {
    const generation = request;
    const timer = window.setTimeout(() => void load(), 0),
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      generation.current++;
    };
  }, [load, version]);
  return { ...ops, reload: load };
}

/** Central do coordenador: pendências priorizadas, fechamento, aprovação e agenda do dia. */
export function Dashboard({
  rows,
  allRows,
  previous,
  state,
  month,
  demo,
  busy,
  onAction,
  onApprove,
  onEdit,
}: {
  /** Pontos do mês selecionado, de toda a equipe. */
  rows: Calculated[];
  /** Todos os pontos carregados (inclui o mês anterior ao selecionado). */
  allRows: Calculated[];
  previous: Calculated[];
  state: State;
  month: string;
  demo: boolean;
  busy: boolean;
  onAction: (action: CenterAction) => void;
  onApprove: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
}) {
  const ops = useOperations(demo, state.me, state);
  // Sem OS confiáveis, a checagem de horas ausentes fica "não verificada" em vez de "em dia".
  const opsReady = ops.loaded && !ops.error,
    opsPending = !ops.loaded && !ops.error;
  const now = today(),
    currentMonth = now.slice(0, 7),
    bounds = monthBounds(month);
  const closedSet = useMemo(
    () => new Set((state.closedMonths || []).map((c) => c.month)),
    [state.closedMonths],
  );
  const missing = ordersMissingHours(ops.orders, bounds);
  const closing = closingChecklist({
    month,
    today: now,
    entries: rows,
    closed: closedSet.has(month),
    missingHours: opsReady ? missing.length : null,
  });
  const prevMonth = previousMonth(currentMonth);
  const prevClosing =
    month === currentMonth
      ? closingChecklist({
          month: prevMonth,
          today: now,
          entries: allRows,
          closed: closedSet.has(prevMonth),
          missingHours: opsReady ? ordersMissingHours(ops.orders, monthBounds(prevMonth)).length : null,
        })
      : null;
  const tasks = coordinatorQueue({
    today: now,
    month,
    rows,
    users: state.users,
    orders: ops.orders,
    period: bounds,
    previous:
      prevClosing && prevClosing.total
        ? { month: prevMonth, state: prevClosing.state, open: prevClosing.open, pending: prevClosing.pending }
        : undefined,
  });
  const approvals = approvalGroups(rows, state.users),
    waitingTotal = approvals.reduce((n, g) => n + g.count, 0),
    agenda = todayAgenda(ops.orders, now),
    running = ops.orders.filter((o) => o.status === "Em andamento").length,
    urgent = tasks.filter((t) => t.severity === "urgent").length;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="cc">
      <section className="panel cc-today" aria-labelledby="cc-today-title">
        <div className="min-w-0">
          <p className="eyebrow muted">Hoje · {dateLabel}</p>
          <h2 id="cc-today-title" className="cc-headline">
            {opsPending
              ? "Carregando a operação…"
              : urgent
                ? `${urgent} ${urgent === 1 ? "pendência urgente" : "pendências urgentes"} para resolver`
                : tasks.length
                  ? "Nenhuma urgência. Há itens para acompanhar."
                  : opsReady
                    ? "Operação em dia."
                    : "Pontos em dia. Ordens de serviço não verificadas."}
          </h2>
        </div>
        <div className="cc-tiles" role="list">
          {[
            {
              label: "Urgentes",
              value: urgent,
              tone: urgent ? "urgent" : "",
              onClick: () => document.getElementById("cc-queue")?.focus(),
              hint: "Ir para a fila de pendências",
            },
            {
              label: "Pontos a aprovar",
              value: waitingTotal,
              tone: waitingTotal ? "attention" : "",
              onClick: () => onAction({ kind: "entries", month }),
              hint: "Abrir o histórico de pontos do mês",
            },
            {
              label: "OS em andamento",
              value: running,
              tone: "",
              onClick: () => onAction({ kind: "orders" }),
              hint: "Abrir ordens de serviço",
            },
            {
              label: "Atendimentos hoje",
              value: agenda.length,
              tone: "",
              onClick: () => onAction({ kind: "orders" }),
              hint: "Abrir ordens de serviço",
            },
          ].map((tile) => (
            <div role="listitem" key={tile.label}>
              <button
                type="button"
                className={"cc-tile " + tile.tone}
                onClick={tile.onClick}
                aria-label={`${tile.label}: ${tile.value}. ${tile.hint}`}
              >
                <span className="cc-tile-value num">
                  {!ops.loaded && tile.label !== "Pontos a aprovar" && tile.label !== "Urgentes" ? "–" : tile.value}
                </span>
                <span className="cc-tile-label">{tile.label}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {ops.error && (
        <div role="alert" className="cc-alert mt-5">
          <TriangleAlert size={18} className="shrink-0" />
          <p className="flex-1">
            Não foi possível carregar as ordens de serviço. As pendências de OS não aparecem até a próxima tentativa. {ops.error}
          </p>
          <Button variant="outline" className="action" onClick={() => void ops.reload()}>
            <RefreshCw size={16} /> Tentar novamente
          </Button>
        </div>
      )}

      <div className="cc-grid mt-6">
        <section
          id="cc-queue"
          tabIndex={-1}
          className="panel cc-panel"
          aria-labelledby="cc-queue-title"
          aria-busy={ops.loading}
        >
          <PanelHead
            id="cc-queue-title"
            title="Precisa de você"
            subtitle="Em ordem de prioridade: primeiro o que bloqueia aprovação, OS ou fechamento."
          />
          <TaskList tasks={tasks} onAction={onAction} loading={opsPending} opsUnavailable={!opsReady && !opsPending} />
        </section>
        <ClosingPanel
          month={month}
          closing={closing}
          closedInfo={state.closedMonths?.find((c) => c.month === month)}
          onOpen={() => onAction({ kind: "entries", month })}
        />
      </div>

      <div className="cc-grid mt-6">
        <ApprovalPanel
          groups={approvals}
          total={waitingTotal}
          state={state}
          busy={busy}
          month={month}
          onAction={onAction}
          onApprove={onApprove}
          onEdit={onEdit}
        />
        <AgendaPanel
          orders={agenda}
          loading={opsPending}
          onAction={onAction}
        />
      </div>

      <TeamPanel state={state} rows={rows} month={month} onAction={onAction} />
      <Indicators rows={rows} previous={previous} state={state} month={month} />
    </div>
  );
}

function PanelHead({
  id,
  title,
  subtitle,
  action,
}: {
  id: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cc-panel-head">
      <div className="min-w-0">
        <h2 id={id}>{title}</h2>
        {subtitle && <p className="muted text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function TaskList({
  tasks,
  onAction,
  loading,
  opsUnavailable,
}: {
  tasks: CenterTask[];
  onAction: (a: CenterAction) => void;
  loading: boolean;
  opsUnavailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, 6);
  if (!tasks.length)
    return (
      <div className="cc-empty">
        {loading ? (
          <LoaderCircle className="animate-spin muted" size={28} aria-hidden />
        ) : (
          <CircleCheck className="text-emerald-600" size={30} aria-hidden />
        )}
        <b>{loading ? "Verificando pendências…" : "Nada aguardando você"}</b>
        <p className="muted text-sm">
          {loading
            ? "Conferindo pontos e ordens de serviço."
            : opsUnavailable
              ? "Nenhuma pendência de pontos. As ordens de serviço não puderam ser verificadas."
              : "Pontos com saída e aprovados, OS dentro do prazo e equipe com valor-hora."}
        </p>
      </div>
    );
  return (
    <>
      <ol className="cc-tasks">
        {shown.map((t) => (
          <li key={t.id} className={"cc-task " + t.severity}>
            <span className="cc-task-icon" aria-hidden>
              {t.severity === "urgent" ? <OctagonAlert size={18} /> : <TriangleAlert size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="cc-task-title">
                <span className="sr-only">{t.severity === "urgent" ? "Urgente: " : "Atenção: "}</span>
                {t.title}
              </p>
              <p className="cc-task-detail">{t.detail}</p>
            </div>
            <Button
              variant="outline"
              className="action cc-task-cta"
              onClick={() => onAction(t.action)}
              aria-label={`${t.cta}: ${t.title}`}
            >
              {t.cta} <ArrowRight size={16} />
            </Button>
          </li>
        ))}
      </ol>
      {tasks.length > 6 && (
        <button
          type="button"
          className="cc-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Mostrar menos" : `Mostrar mais ${tasks.length - 6}`}
        </button>
      )}
    </>
  );
}

const closingCopy = {
  closed: { label: "Fechado", tone: "approved" },
  ready: { label: "Pronto para fechar", tone: "approved" },
  blocked: { label: "Bloqueado", tone: "urgent" },
  running: { label: "Em andamento", tone: "" },
} as const;

function ClosingPanel({
  month,
  closing,
  closedInfo,
  onOpen,
}: {
  month: string;
  closing: ReturnType<typeof closingChecklist>;
  closedInfo?: { closed_at: string; closed_by: string };
  onOpen: () => void;
}) {
  const copy = closingCopy[closing.state];
  const icon = (s: ClosingStep) =>
    s.unknown ? (
      <CircleDashed size={18} className="muted" />
    ) : s.done ? (
      <CircleCheck size={18} className="text-emerald-600" />
    ) : s.blocking ? (
      <CircleDashed size={18} className={closing.state === "running" ? "muted" : "text-red-700"} />
    ) : (
      <TriangleAlert size={18} className="text-amber-700" />
    );
  return (
    <section className="panel cc-panel" aria-labelledby="cc-closing-title">
      <PanelHead
        id="cc-closing-title"
        title={`Fechamento de ${monthLabel(month)}`}
        action={<span className={"badge cc-badge " + copy.tone}>{copy.label}</span>}
      />
      {closing.state === "closed" ? (
        <p className="text-sm mt-4 flex gap-2">
          <Lock size={16} className="shrink-0 mt-0.5" />
          <span>
            Fechado
            {closedInfo
              ? ` por ${closedInfo.closed_by} em ${new Date(closedInfo.closed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : ""}
            . Os registros do mês ficam somente para consulta.
          </span>
        </p>
      ) : (
        <ul className="cc-steps" aria-label="Condições para fechar o mês">
          {closing.steps.map((s) => (
            <li key={s.id}>
              <span aria-hidden>{icon(s)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className="sr-only">
                    {s.unknown ? "Não verificado: " : s.done ? "Concluído: " : s.blocking ? "Pendente: " : "Aviso: "}
                  </span>
                  {s.label}
                </p>
                <p className="muted text-xs mt-0.5">{s.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant={closing.state === "ready" ? "default" : "outline"} className="action w-full mt-5" onClick={onOpen}>
        {closing.state === "ready"
          ? "Revisar e fechar o mês"
          : closing.state === "closed"
            ? "Ver pontos do mês"
            : "Ir para aprovação e fechamento"}
        <ArrowRight size={16} />
      </Button>
    </section>
  );
}

function ApprovalPanel({
  groups,
  total,
  state,
  busy,
  month,
  onAction,
  onApprove,
  onEdit,
}: {
  groups: ReturnType<typeof approvalGroups>;
  total: number;
  state: State;
  busy: boolean;
  month: string;
  onAction: (a: CenterAction) => void;
  onApprove: (e: Entry) => void;
  onEdit: (e: Entry) => void;
}) {
  const oldest = groups
    .flatMap((g) => g.entries.map((e) => ({ e, name: g.name })))
    .sort((a, b) => (a.e.date + a.e.start).localeCompare(b.e.date + b.e.start))
    .slice(0, 6);
  return (
    <section className="panel cc-panel" aria-labelledby="cc-approval-title">
      <PanelHead
        id="cc-approval-title"
        title="Aguardando aprovação"
        subtitle={total ? `${total} ponto(s) com saída · os mais antigos primeiro` : undefined}
        action={
          total > 0 && (
            <Button variant="ghost" className="action text-blue-700" onClick={() => onAction({ kind: "entries", month })}>
              Ver todos <ArrowRight size={16} />
            </Button>
          )
        }
      />
      {!total ? (
        <div className="cc-empty">
          <CheckCheck className="text-emerald-600" size={30} aria-hidden />
          <b>Nenhum ponto aguardando aprovação</b>
          <p className="muted text-sm">Os pontos com saída deste mês já foram aprovados.</p>
        </div>
      ) : (
        <>
          <div className="cc-chips" aria-label="Pontos a aprovar por pessoa">
            {groups.map((g) => (
              <button
                type="button"
                key={g.userId}
                className="cc-chip"
                onClick={() => onAction({ kind: "entries", userId: g.userId, month })}
                aria-label={`Revisar ${g.count} ponto(s) de ${g.name}`}
              >
                <span className="avatar size-7! text-[11px]!" aria-hidden>
                  {initials(g.name)}
                </span>
                {g.name.split(" ")[0]}
                <b className="num">{g.count}</b>
              </button>
            ))}
          </div>
          <ul className="cc-approvals">
            {oldest.map(({ e, name }) => {
              const locked = isClosedMonth(state, e.date);
              return (
                <li key={e.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {name}
                      {e.status === "Revisado" && <span className="badge reviewed ml-2">Revisado</span>}
                    </p>
                    <p className="muted text-xs mt-0.5 truncate">
                      {shortDate(e.date)} · {e.start.slice(0, 5)}–{e.end?.slice(0, 5)} ·{" "}
                      {e.order_number ? osLabel(e.order_number) + " · " : ""}
                      {e.company || e.service}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <b className="text-sm num block">{duration(e.worked)}</b>
                    {e.extra > 0 && <span className="text-xs text-amber-800 num">+{duration(e.extra)} extras</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="action"
                      disabled={busy || locked}
                      aria-label={`Editar ponto de ${name} em ${shortDate(e.date)}`}
                      title="Editar"
                      onClick={() => onEdit(e)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      className="action text-emerald-800"
                      disabled={busy || locked}
                      aria-label={`Aprovar ponto de ${name} em ${shortDate(e.date)}`}
                      onClick={() => onApprove(e)}
                    >
                      <CheckCheck size={16} />
                      <span className="hidden sm:inline">Aprovar</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {total > oldest.length && (
            <p className="muted text-xs mt-3">
              Mostrando {oldest.length} de {total}. A aprovação em lote fica no histórico de pontos.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function AgendaPanel({
  orders,
  loading,
  onAction,
}: {
  orders: Order[];
  loading: boolean;
  onAction: (a: CenterAction) => void;
}) {
  return (
    <section className="panel cc-panel" aria-labelledby="cc-agenda-title" aria-busy={loading}>
      <PanelHead
        id="cc-agenda-title"
        title="Agenda de hoje"
        subtitle="Atendimentos abertos previstos para hoje."
        action={
          <Button variant="ghost" className="action text-blue-700" onClick={() => onAction({ kind: "orders" })}>
            Ver OS <ArrowRight size={16} />
          </Button>
        }
      />
      {loading ? (
        <div className="cc-empty">
          <LoaderCircle className="animate-spin muted" size={28} aria-hidden />
          <b>Carregando atendimentos…</b>
        </div>
      ) : !orders.length ? (
        <div className="cc-empty">
          <CalendarClock className="text-slate-400" size={30} aria-hidden />
          <b>Nenhum atendimento previsto para hoje</b>
          <p className="muted text-sm">Novas OS são programadas em Ordens de serviço.</p>
        </div>
      ) : (
        <ul className="cc-agenda">
          {orders.map((o) => {
            const blockers = orderBlockers(o),
              outside = o.trips.some((t) => t.return_km === null);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onAction({ kind: "order", orderId: o.id })}
                  aria-label={`Abrir ${osLabel(o.number)}, ${o.client_name}`}
                >
                  <span className="cc-agenda-time num">
                    {brtTime(o.starts_at)}
                    <small className="muted block">{brtTime(o.ends_at)}</small>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-sm text-blue-800">{osLabel(o.number)}</b>
                      <span className={"badge " + (o.status === "Em andamento" ? "approved" : "")}>{o.status}</span>
                      {o.priority && o.priority !== "Normal" && (
                        <span className="badge pending">{o.priority}</span>
                      )}
                    </span>
                    <span className="block text-sm font-medium mt-1 truncate">{o.client_name}</span>
                    <span className="block muted text-xs mt-0.5 truncate">
                      {o.title} · {o.team.map((p) => p.name.split(" ")[0]).join(", ")}
                    </span>
                    {o.status === "Em andamento" && blockers.length > 0 && (
                      <span className="block text-xs text-amber-800 mt-1">
                        {outside ? "Em campo · " : ""}
                        {blockers.join(" · ")}
                      </span>
                    )}
                  </span>
                  <ClipboardList size={18} className="muted shrink-0" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TeamPanel({
  state,
  rows,
  month,
  onAction,
}: {
  state: State;
  rows: Calculated[];
  month: string;
  onAction: (a: CenterAction) => void;
}) {
  const people = state.users
    .map((u) => {
      const mine = rows.filter((e) => e.user_id === u.id),
        sum = totals(mine);
      return {
        u,
        sum,
        waiting: mine.filter((e) => e.end && e.status !== "Aprovado").length,
        open: mine.filter((e) => !e.end).length,
        days: new Set(mine.filter((e) => e.end).map((e) => e.date)).size,
        count: mine.length,
      };
    })
    .filter((p) => p.u.active || p.count)
    .sort(
      (a, b) =>
        Number(b.u.active) - Number(a.u.active) ||
        b.open - a.open ||
        b.waiting - a.waiting ||
        a.u.name.localeCompare(b.u.name, "pt-BR"),
    );
  const currency = state.settings.currency;
  const status = (p: (typeof people)[number]) =>
    !p.u.active ? (
      <span className="badge">Inativa</span>
    ) : p.open ? (
      <span className="badge cc-badge urgent">{p.open} sem saída</span>
    ) : p.waiting ? (
      <span className="badge pending">{p.waiting} a aprovar</span>
    ) : p.count ? (
      <span className="badge approved">Em dia</span>
    ) : (
      <span className="badge">Sem registros</span>
    );
  const rate = (p: (typeof people)[number]) =>
    Number(p.u.hourly_rate) ? (
      money(Number(p.u.hourly_rate), currency)
    ) : (
      <span className="text-amber-800 font-medium">Não informado</span>
    );
  return (
    <section className="panel mt-6 overflow-hidden" aria-labelledby="cc-team-title">
      <div className="px-6 pt-6">
        <PanelHead
          id="cc-team-title"
          title="Equipe no mês"
          subtitle={`${monthLabel(month)} · quem precisa de ação aparece primeiro`}
          action={
            <Button variant="ghost" className="action text-blue-700" onClick={() => onAction({ kind: "people" })}>
              <Users size={16} /> Colaboradores
            </Button>
          }
        />
      </div>
      {!people.length ? (
        <div className="cc-empty">
          <Users className="text-slate-400" size={30} aria-hidden />
          <b>Nenhuma pessoa ativa</b>
          <p className="muted text-sm">Cadastre colaboradores para acompanhar a equipe.</p>
        </div>
      ) : (
        <>
          <ul className="md:hidden divide-y mt-4">
            {people.map((p) => (
              <li key={p.u.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="avatar" aria-hidden>{initials(p.u.name)}</span>
                    <b className="text-sm truncate">{p.u.name}</b>
                  </span>
                  {status(p)}
                </div>
                <p className="text-xs muted mt-2">
                  {p.days} dia(s) de campo · {duration(p.sum.worked)} · extras {duration(p.sum.extra)} · {rate(p)}
                  /h
                </p>
                <Button
                  variant="outline"
                  className="action w-full mt-3"
                  onClick={() => onAction({ kind: "entries", userId: p.u.id, month })}
                >
                  Ver pontos de {p.u.name.split(" ")[0]} <ArrowRight size={16} />
                </Button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto mt-4">
            <table className="cc-table">
              <thead>
                <tr>
                  <th scope="col">Pessoa</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="num-col">Dias de campo</th>
                  <th scope="col" className="num-col">Trabalhadas</th>
                  <th scope="col" className="num-col">Extras</th>
                  <th scope="col" className="num-col">Valor-hora</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.u.id}>
                    <th scope="row">
                      <span className="flex items-center gap-2.5">
                        <span className="avatar" aria-hidden>{initials(p.u.name)}</span>
                        <span className="min-w-0">
                          <b className="block text-sm">{p.u.name}</b>
                          <span className="muted text-xs">{p.u.role === "coordinator" ? "Coordenador" : p.u.job || "Colaborador"}</span>
                        </span>
                      </span>
                    </th>
                    <td>{status(p)}</td>
                    <td className="num-col">{p.days}</td>
                    <td className="num-col">{duration(p.sum.worked)}</td>
                    <td className="num-col text-amber-800">{duration(p.sum.extra)}</td>
                    <td className="num-col">{rate(p)}</td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        className="action text-blue-700"
                        onClick={() => onAction({ kind: "entries", userId: p.u.id, month })}
                        aria-label={`Ver pontos de ${p.u.name}`}
                      >
                        Ver pontos <ArrowRight size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Indicators({
  rows,
  previous,
  state,
  month,
}: {
  rows: Calculated[];
  previous: Calculated[];
  state: State;
  month: string;
}) {
  const t = totals(rows),
    prev = totals(previous),
    days = new Set(rows.filter((e) => e.end).map((e) => e.user_id + e.date)).size,
    trend = prev.extra ? Math.round(((t.extra - prev.extra) / prev.extra) * 100) : null;
  const weekly = Array.from({ length: 5 }, (_, i) => ({
    name: "Sem. " + (i + 1),
    extras: Number(
      (
        rows
          .filter((e) => Math.floor((Number(e.date.slice(8)) - 1) / 7) === i)
          .reduce((n, e) => n + e.extra, 0) / 60
      ).toFixed(2),
    ),
  }));
  return (
    <section className="panel mt-6 p-6" aria-labelledby="cc-ind-title">
      <PanelHead
        id="cc-ind-title"
        title="Indicadores do mês"
        subtitle={`${monthLabel(month)} · toda a equipe · valores estimados, incluindo pontos ainda não aprovados`}
      />
      <dl className="cc-metrics">
        <div>
          <dt>Horas trabalhadas</dt>
          <dd className="num">{duration(t.worked)}</dd>
          <p>{days ? duration(t.worked / days) + " em média por jornada" : "Sem jornadas encerradas"}</p>
        </div>
        <div>
          <dt>Horas extras</dt>
          <dd className="num">{duration(t.extra)}</dd>
          <p>
            {trend === null
              ? "Sem base no mês anterior"
              : `${trend >= 0 ? "+" : ""}${trend}% em relação ao mês anterior (${duration(prev.extra)})`}
          </p>
        </div>
        <div>
          <dt>Valor estimado de extras</dt>
          <dd className="num">{money(t.amount, state.settings.currency)}</dd>
          <p>Estimativa a partir do valor-hora de cada ponto</p>
        </div>
      </dl>
      {t.extra ? (
        <div className="h-52 mt-6" role="img" aria-label="Horas extras por semana do mês">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e9edf4" strokeDasharray="4 4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#637089" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#637089" }} unit="h" />
              <Tooltip
                formatter={(v) => [duration(Number(v) * 60), "Horas extras"]}
                contentStyle={{ borderRadius: 10, borderColor: "#e2e7ef" }}
                cursor={{ fill: "#f2f4f8" }}
              />
              <Bar dataKey="extras" fill="#3d73e5" radius={[4, 4, 0, 0]} barSize={34} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted text-sm mt-6">Nenhuma hora extra registrada neste mês.</p>
      )}
    </section>
  );
}
