"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarClock, Car, CheckCheck, CircleCheck, Columns3, List, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, TriangleAlert, Users, X } from "lucide-react";
import type { Calculated } from "@/lib/domain";
import { initials } from "@/lib/domain";
import type { Order, Vehicle } from "@/lib/orders";
import { brtDate, brtTime, monthLabel, osLabel, shortDate, type CenterAction } from "@/lib/coordinator-center";
import { filterOperationalOrders, operationalOrders, type OperationItem, type OperationStage } from "./signature-operation-board-state";
import "./signature-operation-board.css";

const stages: { id: OperationStage; label: string; description: string }[] = [
  { id: "prepare", label: "Preparar", description: "Equipe, turnos e recursos" },
  { id: "return", label: "Retorno", description: "Veículos em campo" },
  { id: "review", label: "Conferir", description: "Encerramento e registros" },
];

export function SignatureOperationBoard({ orders, vehicles, rows, reviewIds, today, period, automatic, loading, available, updatedAt, onAction, onCreateOrder, onRefresh }: {
  orders: Order[];
  vehicles: Vehicle[];
  rows: Calculated[];
  reviewIds: ReadonlySet<string>;
  today: string;
  period: { from: string; to: string };
  automatic: boolean;
  loading: boolean;
  available: boolean;
  updatedAt: string | null;
  onAction: (action: CenterAction) => void;
  onCreateOrder?: () => void;
  onRefresh: () => void;
}) {
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => available ? operationalOrders({ orders, rows, reviewIds, today, period }) : [], [available, orders, rows, reviewIds, today, period]);
  const visible = useMemo(() => filterOperationalOrders(items, query, pendingOnly), [items, query, pendingOnly]);
  const selected = visible.find((item) => item.order.id === selectedId) || visible.find((item) => item.urgent) || visible[0];
  const activeVehicles = items.reduce((count, item) => count + item.activeTrips, 0);
  const todayCount = items.filter((item) => item.today && ["Agendada", "Em andamento"].includes(item.order.status)).length;
  const selectedVehicle = selected ? vehicles.find((vehicle) => vehicle.id === (selected.order.trips.find((trip) => trip.return_km === null)?.vehicle_id || selected.order.vehicle_id)) : undefined;
  const resetFilters = () => { setQuery(""); setPendingOnly(false); };

  return (
    <section className="sig-operation" aria-labelledby="sig-operation-title" aria-busy={loading}>
      <h2 className="sr-only" id="sig-operation-title">Quadro da operação</h2>
      <div className="sig-op-summary" aria-label="Resumo da operação">
        <span><b>{available ? items.length : "–"}</b> OS acompanhadas</span>
        <span><b className={items.some((item) => item.stage === "return" && item.urgent) ? "sig-op-urgent-number" : ""}>{available ? activeVehicles : "–"}</b> {activeVehicles === 1 ? "veículo em campo" : "veículos em campo"}</span>
        <span><b>{available ? todayCount : "–"}</b> {todayCount === 1 ? "atendimento hoje" : "atendimentos hoje"}</span>
        <span className="sig-op-auto"><CheckCheck size={15} aria-hidden /> {automatic ? "Conferência por exceção" : "Conferência de aprovação"}</span>
      </div>

      <div className="sig-op-tools">
        <div className="sig-op-segmented" role="group" aria-label="Visualização das OS">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}><Columns3 size={16} aria-hidden /> Quadro</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} aria-hidden /> Lista</button>
        </div>
        <label className="sig-op-search">
          <Search size={16} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar OS, cliente ou pessoa no quadro" placeholder="Buscar OS, cliente ou pessoa" />
          {query && <button type="button" className="sig-op-clear" aria-label="Limpar busca do quadro" onClick={() => setQuery("")}><X size={14} aria-hidden /></button>}
        </label>
        <button type="button" className="sig-op-filter" aria-pressed={pendingOnly} onClick={() => setPendingOnly((value) => !value)}><SlidersHorizontal size={15} aria-hidden /> Só pendências</button>
        {onCreateOrder ? <button type="button" className="sig-op-primary" onClick={onCreateOrder}><Plus size={17} aria-hidden /> Nova OS</button> : <button type="button" onClick={() => onAction({ kind: "orders" })}>Ver ordens <ArrowUpRight size={16} aria-hidden /></button>}
      </div>

      <div className="sig-op-context">
        <p>OS abertas e pendências de {monthLabel(period.from.slice(0, 7))}.</p>
        <button type="button" className="sig-op-quiet" onClick={onRefresh} aria-label="Atualizar quadro da operação"><RefreshCw size={13} aria-hidden /> {available && updatedAt ? `Atualizado às ${brtTime(updatedAt)}` : "Atualizar quadro"}</button>
      </div>

      {!available ? (
        <div className="sig-op-empty sig-op-unavailable" role="status">
          {loading ? <LoaderCircle size={23} className="animate-spin" aria-hidden /> : <TriangleAlert size={23} aria-hidden />}
          <b>{loading ? "Organizando a operação…" : "Operação ainda não verificada"}</b>
          <p>{loading ? "Consultando equipe, recursos e próximas ações." : "As OS não estão disponíveis agora. As verificações de pontos e fechamento continuam abaixo."}</p>
        </div>
      ) : !items.length ? (
        <div className="sig-op-empty" role="status"><CircleCheck size={27} aria-hidden /><b>Nenhuma OS aguardando acompanhamento</b><p>Novos atendimentos aparecerão aqui com equipe, recursos e próximas ações.</p></div>
      ) : !visible.length ? (
        <div className="sig-op-empty" role="status"><Search size={25} aria-hidden /><b>Nenhuma OS nesta visualização</b><p>Tente outro nome ou número, ou remova o filtro de pendências.</p><button type="button" onClick={resetFilters}>Limpar filtros</button></div>
      ) : view === "board" ? (
        <div className="sig-op-board" aria-label="OS organizadas por etapa">
          {stages.map((stage) => {
            const lane = visible.filter((item) => item.stage === stage.id);
            return <OperationLane key={stage.id} stage={stage} items={lane} selectedId={selected?.order.id} onSelect={setSelectedId} />;
          })}
        </div>
      ) : (
        <div className="sig-op-table-wrap"><table className="sig-op-table"><caption className="sr-only">OS acompanhadas com etapa, equipe e próxima ação</caption><thead><tr><th scope="col">OS / Cliente</th><th scope="col">Etapa</th><th scope="col">Equipe</th><th scope="col">Próxima ação</th></tr></thead><tbody>
          {visible.map((item) => <tr className={selected?.order.id === item.order.id ? "sig-op-selected" : ""} key={item.order.id}>
            <td><button type="button" className="sig-op-table-select" onClick={() => setSelectedId(item.order.id)} aria-label={`Selecionar ${osLabel(item.order.number, item.order.official_number)}, ${item.order.client_name}, na mesa de conferência`} aria-pressed={selected?.order.id === item.order.id}><span className="sig-op-mono">{osLabel(item.order.number, item.order.official_number)}</span><span className="sig-op-table-client">{item.order.client_name}</span></button></td>
            <td><OperationTag item={item} /></td><td>{item.order.team.map((person) => person.name.split(" ")[0]).join(" · ") || "Equipe não informada"}</td><td>{item.nextAction}</td>
          </tr>)}
        </tbody></table></div>
      )}

      {available && selected && <OperationWorkbench item={selected} vehicle={selectedVehicle} onOpen={() => onAction({ kind: "order", orderId: selected.order.id })} />}
    </section>
  );
}

function OperationLane({ stage, items, selectedId, onSelect }: {
  stage: (typeof stages)[number];
  items: OperationItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const check = () => setOverflows(scroller.scrollHeight > scroller.clientHeight + 1);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    const frame = window.requestAnimationFrame(check);
    window.addEventListener("resize", check);
    return () => { observer?.disconnect(); window.cancelAnimationFrame(frame); window.removeEventListener("resize", check); };
  }, []);
  return <section className={"sig-op-lane sig-op-lane-" + stage.id} aria-labelledby={"sig-op-lane-" + stage.id}>
    <div className="sig-op-lane-head"><h3 id={"sig-op-lane-" + stage.id}><span className="sig-op-stage-dot" aria-hidden />{stage.label}</h3><span className="sig-op-count" aria-label={`${items.length} ordens`}>{String(items.length).padStart(2, "0")}</span></div>
    <p className="sig-op-lane-description">{stage.description}</p>
    <div className="sig-op-lane-items" ref={scrollRef} tabIndex={overflows ? 0 : undefined} role={overflows ? "region" : undefined} aria-label={overflows ? `${stage.label}: ${items.length} OS. Role para ver todos os atendimentos desta etapa.` : undefined}>
      <div className="sig-op-lane-items-inner">
        {items.map((item) => <OperationTicket key={item.order.id} item={item} selected={selectedId === item.order.id} onSelect={() => onSelect(item.order.id)} />)}
        {!items.length && <p className="sig-op-lane-empty">Nenhuma OS nesta etapa.</p>}
      </div>
    </div>
  </section>;
}

function TeamAvatars({ order }: { order: Order }) {
  return <span className="sig-op-avatars" aria-label={order.team.map((person) => person.name).join(", ") || "Equipe não informada"}>
    {order.team.slice(0, 3).map((person) => <span className="sig-op-avatar" key={person.id} title={person.name} aria-hidden>{initials(person.name)}</span>)}
    {order.team.length > 3 && <span className="sig-op-avatar" aria-hidden>+{order.team.length - 3}</span>}
    {!order.team.length && <span className="sig-op-team-empty">Equipe não informada</span>}
  </span>;
}

function OperationTag({ item }: { item: OperationItem }) {
  const label = item.urgent ? (item.activeTrips ? "Retorno a registrar" : "Previsão vencida")
    : item.activeTrips ? "Em campo"
      : item.stage === "review" ? item.order.status
        : item.issues.some((issue) => issue.tone === "unknown") ? "Não verificado" : item.order.status;
  return <span className={"sig-op-tag" + (item.urgent ? " sig-op-tag-urgent" : item.activeTrips ? " sig-op-tag-field" : "")}>{label}</span>;
}

function OperationTicket({ item, selected, onSelect }: { item: OperationItem; selected: boolean; onSelect: () => void }) {
  const order = item.order;
  const issue = item.issues.find((entry) => entry.tone === "urgent" || entry.tone === "attention") || item.issues[0];
  return <button type="button" className={"sig-op-ticket" + (item.stage === "review" ? " sig-op-ticket-compact" : "")} aria-pressed={selected} onClick={onSelect} aria-label={`Selecionar ${osLabel(order.number, order.official_number)}, ${order.client_name}, na mesa de conferência`}>
    <span className="sig-op-ticket-top"><span className="sig-op-mono">{osLabel(order.number, order.official_number)}</span><OperationTag item={item} /></span>
    <span className="sig-op-ticket-client">{order.client_name}</span>
    <span className="sig-op-service">{item.stage === "review" && issue ? issue.label : order.title}</span>
    {item.stage !== "review" && <span className="sig-op-ticket-data"><span><CalendarClock size={14} aria-hidden />{item.compactSchedule}</span><span>{item.stage === "return" ? <Car size={14} aria-hidden /> : <Users size={14} aria-hidden />}{issue?.label || "Equipe designada para o atendimento"}</span></span>}
    <span className="sig-op-ticket-bottom"><TeamAvatars order={order} /><span className="sig-op-next">{item.nextAction}<ArrowUpRight size={14} aria-hidden /></span></span>
  </button>;
}

function OperationWorkbench({ item, vehicle, onOpen }: { item: OperationItem; vehicle?: Vehicle; onOpen: () => void }) {
  const order = item.order;
  const events = [...order.events].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2);
  const equipment = order.equipment_models?.map((model) => model.name).join(", ") || order.equipment.trim() || "Nenhum equipamento informado";
  const vehicleLabel = vehicle ? `${vehicle.plate} · ${vehicle.model}` : order.vehicle_id || item.activeTrips ? "Veículo vinculado à OS" : "Sem veículo vinculado";
  const actionIssue = item.actionIssue;
  const equipmentState = order.missing_checklist_models?.length ? "Há checklist a atribuir"
    : Number(order.pending_checklists) > 0 ? `${order.pending_checklists} checklist(s) em aberto`
      : Array.isArray(order.missing_checklist_models) && order.pending_checklists !== undefined ? "Sem pendência registrada" : "Situação dos checklists não verificada";
  return <section className="sig-op-workbench" aria-labelledby="sig-op-bench-title">
    <header className="sig-op-bench-title"><h3 id="sig-op-bench-title"><SlidersHorizontal size={16} aria-hidden /> Mesa de conferência</h3><span className="sig-op-mono">{osLabel(order.number, order.official_number)}</span></header>
    <div className="sig-op-bench-grid">
      <div className="sig-op-zone"><p className="sig-op-eyebrow">Atendimento selecionado</p><h4>{order.client_name}</h4><p className="sig-op-service">{order.title}</p><div className="sig-op-people"><TeamAvatars order={order} /><span>{order.team.map((person) => person.name.split(" ")[0]).join(" e ") || "Equipe não informada"}</span></div><OperationTag item={item} /></div>
      <div className="sig-op-zone"><dl className="sig-op-facts"><div><dt>Previsão</dt><dd>{item.schedule}</dd></div><div><dt>Veículo</dt><dd>{vehicleLabel}{item.activeTrips > 0 && <small>Retorno ainda não registrado</small>}</dd></div><div><dt>Equipamentos</dt><dd>{equipment}<small>{equipmentState}</small></dd></div></dl>
        {!!events.length && <ul className="sig-op-timeline" aria-label="Últimas alterações da OS">{events.map((event) => <li key={event.id}><span>{event.action} · {event.name}</span><time dateTime={event.created_at}>{shortDate(brtDate(event.created_at))} · {brtTime(event.created_at)}</time></li>)}</ul>}
      </div>
      <div className="sig-op-zone sig-op-bench-action"><p className="sig-op-eyebrow">Próxima ação</p><h4>{item.nextAction}</h4><p className="sig-op-service">{actionIssue?.detail || "Abra a OS para acompanhar a equipe e conferir os detalhes do atendimento."}</p>
        {item.issues.length > 0 && <ul className="sig-op-checks">{item.issues.slice(0, 4).map((issue) => <li key={issue.key} className={"sig-op-check-" + issue.tone}>{issue.tone === "info" ? <Car size={14} aria-hidden /> : <TriangleAlert size={14} aria-hidden />}<span>{issue.label}</span></li>)}{item.issues.length > 4 && <li>+{item.issues.length - 4} verificações na OS</li>}</ul>}
        <button type="button" className="sig-op-primary" onClick={onOpen}>{item.nextAction}<ArrowRight size={16} aria-hidden /></button><button type="button" className="sig-op-quiet" onClick={onOpen}>Abrir OS completa <ArrowUpRight size={14} aria-hidden /></button>
      </div>
    </div>
  </section>;
}
