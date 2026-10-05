"use client";
import { TechnicalLibrary } from "./technical-library";
import { OrderChecklists } from './checklist-editor';
import { ClientLifecycle } from './client-lifecycle';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Car,
  ClipboardList,
  Plus,
  MapPin,
  Navigation,
  FileDown,
  Pencil,
  Check,
  Play,
  LoaderCircle,
  RefreshCw,
  Phone,
  Wrench,
  CalendarDays,
  Gauge,
  Building2,
  Trash2,
  Ban,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger } from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { api } from "./editors";
import { OrderEditor, ResourceEditor, uploadOrderPdf } from "./order-editors";
import {
  localDateTime,
  mapsUrl,
  orderNumber,
  type OperationsData,
  type Order,
  type Vehicle,
  type ServiceClient,
} from "@/lib/orders";
import { today, type Person } from "@/lib/domain";
import { demoOperations, demoChecklists } from '@/lib/demo';
import { orderAttention, matchesOrderAttention, matchesOrderScope, orderAttentionFilters } from '@/lib/order-attention';
import { closeoutSteps, membersWithoutHours, hasCancelledPending, matchesOrderSection, orderStatusFilters } from '@/lib/order-lifecycle';

const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(v));
const kmLabel = (v: number) => Number(v).toLocaleString("pt-BR") + " km";
const emptyData: OperationsData = {
  orders: [],
  vehicles: [],
  clients: [],
  people: [],
};
export function ServiceOrders({
  me,
  view,
  demo,
  blocked,
  onPoint,
  onNavigate,
  onRegister,
}: {
  me: Person;
  view: string;
  demo: boolean;
  blocked: boolean;
  onPoint: () => Promise<void>;
  onNavigate: (view: string) => void;
  onRegister: (order: Order) => void;
}) {
  const [data, setData] = useState<OperationsData>(emptyData),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | "new" | null>(null),
    [resource, setResource] = useState<{
      kind: "client" | "vehicle";
      data?: ServiceClient | Vehicle;
    } | null>(null);
  const [filter, setFilter] = useState("Todas"),
    [search, setSearch] = useState("");
  const [scope, setScope] = useState({ client: '', person: '', from: '', to: '' });
  const [attentionFilter, setAttentionFilter] = useState('Todas');
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [clientFilter, setClientFilter] = useState('Ativos'), [clientSearch, setClientSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('Todas'), [historySearch, setHistorySearch] = useState(''), [historyMonth, setHistoryMonth] = useState('');
  const history = view === 'order-history';
  const currentFilter = history ? historyFilter : filter;
  const currentSearch = history ? historySearch : search;
  const pendingCount = data.orders.filter(hasCancelledPending).length;
  const dismissed = useRef(new Set<string>()),
    request = useRef(0);
  const admin = me.role === "coordinator";
  const openedFromPush=useRef<string | null>(null);
  useEffect(()=>{
    if (loading || blocked) return;
    const target=new URLSearchParams(window.location.search).get('order');
    if (!target || openedFromPush.current===target) return;
    const found=data.orders.find(order=>order.id===target);
    const timer=setTimeout(()=>{
      openedFromPush.current=target;
      if(found)setSelected(found.id);
      else toast.error('Esta OS não está mais disponível para o seu acesso.');
    },0);
    return()=>clearTimeout(timer);
  },[loading,blocked,data.orders]);
  function closeOrder() {
    setSelected(null);
    const query = new URLSearchParams(window.location.search);
    if (query.has('order')) {
      query.delete('order');
      window.history.replaceState({}, '', `/?${query}`);
    }
    openedFromPush.current = null;
  }
  function clearFilters() {
    setScope({ client: '', person: '', from: '', to: '' }); setAttentionFilter('Todas');
    if (history) { setHistoryMonth(''); setHistorySearch(''); setHistoryFilter('Todas'); }
    else { setSearch(''); setFilter('Todas'); }
  }
  const reload = useCallback(async () => {
    const version = ++request.current;
    try {
      const result = demo
        ? demoOperations(me)
        : await api<OperationsData>("/api/operations");
      if (version === request.current) {
        setData(result);
        setCheckedAt(Date.now());
        setError("");
      }
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [demo, me]);
  useEffect(() => {
    const generation = request;
    const timer = window.setTimeout(() => void reload(), 0),
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") void reload();
      }, 60000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      generation.current++;
    };
  }, [reload]);
  useEffect(() => {
    const current = data.orders.find((o) => o.id === selected);
    if (current)
      dismissed.current.add(`${today()}:${current.id}:${current.version}`);
  }, [selected, data.orders]);
  const assignedChecklists = data.orders.filter(o => o.checklist_only && o.status === 'Em andamento');
  const due = data.orders.filter(
    (o) =>
      o.members.includes(me.id) &&
      (hasCancelledPending(o) || (["Agendada", "Em andamento"].includes(o.status) &&
      localDateTime(o.starts_at).slice(0, 10) <= today() &&
      (localDateTime(o.ends_at).slice(0, 10) >= today() ||
        o.status === "Em andamento"))),
  );
  useEffect(() => {
    if (blocked || selected || editOrder || resource || demo || view === 'register' || view === 'order-history') return;
    if (new URLSearchParams(window.location.search).has('order')) return;
    const next = data.orders.find(
      (o) =>
        o.members.includes(me.id) &&
        (hasCancelledPending(o) || (["Agendada", "Em andamento"].includes(o.status) &&
        localDateTime(o.starts_at).slice(0, 10) <= today() &&
        (localDateTime(o.ends_at).slice(0, 10) >= today() ||
          o.status === "Em andamento"))) &&
        !dismissed.current.has(`${today()}:${o.id}:${o.version}`),
    );
    if (!next) return;
    const timer = setTimeout(() => {
      dismissed.current.add(`${today()}:${next.id}:${next.version}`);
      setSelected(next.id);
    }, 0);
    return () => clearTimeout(timer);
  }, [data, me.id, blocked, selected, editOrder, resource, demo, view]);
  const rows = useMemo(
    () =>
      data.orders.filter(
        (o) =>
          matchesOrderSection(o, history, currentFilter) &&
          matchesOrderScope(o, scope) &&
          matchesOrderAttention(o, attentionFilter, today(), checkedAt, admin) &&
          (!history || !historyMonth || localDateTime(o.starts_at).slice(0, 7) === historyMonth) &&
          [orderNumber(o.number, o.official_number), orderNumber(o.number), o.client_name, o.title, o.address]
            .join(" ")
            .toLowerCase()
            .includes(currentSearch.trim().toLowerCase()),
      ),
    [data.orders, history, currentFilter, historyMonth, currentSearch, scope, attentionFilter, admin, checkedAt],
  );
  const hasFilters = !!(currentSearch.trim() || currentFilter !== 'Todas' || (history && historyMonth) || scope.client || scope.person || scope.from || scope.to || attentionFilter !== 'Todas');
  const sectionCount = data.orders.filter(o => matchesOrderSection(o, history, 'Todas')).length;
  const clientNames = [...new Set(data.orders.map(o => o.client_name))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const order = data.orders.find((o) => o.id === selected);
  const shown = ["orders", "order-history", "vehicles", "clients"].includes(view);
  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          Não foi possível carregar as OS. {error}{" "}
          <Button
            className="ml-2"
            variant="outline"
            onClick={() => void reload()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!shown && !!assignedChecklists.length && (
        <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b className="flex items-center gap-2 text-violet-950"><ClipboardList size={20} />{assignedChecklists.length === 1 ? 'Checklist designado para você' : 'Checklists designados para você'}</b>
              <p className="mt-1 text-sm text-violet-900">{assignedChecklists.map(o => `${orderNumber(o.number, o.official_number)} · ${o.client_name}`).join(' / ')}</p>
            </div>
            <Button onClick={() => setSelected(assignedChecklists[0].id)}>Abrir conferência</Button>
          </div>
        </div>
      )}
      {!shown && !!due.length && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b className="flex items-center gap-2 text-blue-900">
                <ClipboardList size={20} />
                {due.some(hasCancelledPending) ? 'OS e pendências da equipe' : due.length === 1 ? "Sua OS de hoje" : "Suas OS de hoje"}
              </b>
              <p className="mt-1 text-sm text-blue-800">
                {due
                  .map((o) => `${orderNumber(o.number, o.official_number)} · ${o.client_name}`)
                  .join(" / ")}
              </p>
            </div>
            <Button onClick={() => setSelected(due[0].id)}>
              Abrir OS <Navigation size={16} />
            </Button>
          </div>
        </div>
      )}
      {shown && loading && (
        <p className="flex items-center gap-2 p-5">
          <LoaderCircle className="animate-spin" />
          Carregando ordens de serviço…
        </p>
      )}
      {(view === "orders" || history) && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="muted text-sm">
              {history ? 'Consulte as OS concluídas e canceladas, sem misturar com a agenda e os atendimentos em andamento.' : admin
                ? "Planeje os atendimentos e acompanhe a equipe. Cada nova OS recebe um número sequencial, que não muda ao editar."
                : "Seus atendimentos, equipe, trajetos e instruções."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onNavigate(history ? 'orders' : 'order-history')}>
                {history ? <ClipboardList /> : <History />}{history ? 'OS em aberto' : 'Histórico de OS'}
              </Button>
              <Button
                variant="outline"
                aria-label="Atualizar ordens"
                onClick={() => void reload()}
              >
                <RefreshCw />
              </Button>
              {admin && !history && (
                <Button onClick={() => setEditOrder("new")}>
                  <Plus />
                  Gerar OS
                </Button>
              )}
            </div>
          </div>
          {!history && pendingCount > 0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status"><p>{pendingCount} OS cancelada(s) ainda com pendências de ponto, retorno ou conferência. Consulte no histórico.</p><Button variant="outline" onClick={() => { setHistoryFilter('Pendências'); setHistoryMonth(''); setHistorySearch(''); onNavigate('order-history'); }}>Resolver pendências</Button></div>}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {(history ? [
              ['Concluídas', data.orders.filter(o => o.status === 'Concluída').length],
              ['Canceladas', data.orders.filter(o => o.status === 'Cancelada').length],
              ['Canceladas com pendências', pendingCount],
            ] : [
              [
                "Agendadas",
                data.orders.filter((o) => o.status === "Agendada").length,
              ],
              [
                "Em andamento",
                data.orders.filter((o) => o.status === "Em andamento").length,
              ],
              [
                "Total em aberto",
                data.orders.filter((o) => ['Agendada', 'Em andamento'].includes(o.status)).length,
              ],
            ]).map(([label, n]) => (
              <div className="panel p-5" key={label}>
                <p className="muted text-sm">{label}</p>
                <b className="mt-1 block text-3xl">{n}</b>
              </div>
            ))}
          </div>
          <div className="ops-form mb-5">
            <label>
              Buscar OS
              <input
                value={currentSearch}
                onChange={(e) => history ? setHistorySearch(e.target.value) : setSearch(e.target.value)}
                placeholder="Número, cliente, serviço ou endereço"
              />
            </label>
            <label>Cliente<select value={scope.client} onChange={e => setScope({ ...scope, client: e.target.value })}><option value="">Todos os clientes</option>{clientNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            {admin && <label>Pessoa da equipe<select value={scope.person} onChange={e => setScope({ ...scope, person: e.target.value })}><option value="">Toda a equipe</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.name}{!person.active ? ' · Inativo' : ''}</option>)}</select></label>}
            <label>Atenção<select value={attentionFilter} onChange={e => setAttentionFilter(e.target.value)}>{orderAttentionFilters.filter(value => admin || value !== 'Sem horas registradas').map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Início previsto · de<input type="date" value={scope.from} onChange={e => setScope({ ...scope, from: e.target.value })} /></label>
            <label>Início previsto · até<input type="date" value={scope.to} min={scope.from || undefined} onChange={e => setScope({ ...scope, to: e.target.value })} /></label>
            <label>
              Situação
              <select
                value={currentFilter}
                onChange={(e) => history ? setHistoryFilter(e.target.value) : setFilter(e.target.value)}
              >
                {orderStatusFilters(history).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {history && <label>Mês do atendimento (início previsto)<input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} /></label>}
            {hasFilters && <Button variant="outline" className="self-end" onClick={clearFilters}>Limpar filtros</Button>}
          </div>
          {scope.from && scope.to && scope.from > scope.to && <p role="alert" className="mb-3 text-sm text-amber-800">A data final precisa ser igual ou posterior à data inicial.</p>}
          {!loading && !error && <p className="muted mb-4 text-sm" role="status">{rows.length} de {sectionCount} OS {history ? 'no histórico' : 'em aberto'}{hasFilters ? ' · filtros aplicados' : ''}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((o) => {
              const attention = orderAttention(o, today(), checkedAt, admin);
              return (
              <article className="panel min-w-0 p-5" key={o.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-blue-700">{orderNumber(o.number, o.official_number)}</b>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                    {o.status} · {o.priority}
                  </span>
                </div>
                <h2 className="mt-3 break-words">{o.title}</h2>
                {hasCancelledPending(o) && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">Cancelada com pendências: confira ponto, retorno e equipamentos.</p>}
                {o.checklist_only && <p className="mt-2 rounded-lg bg-violet-50 p-3 text-sm font-medium text-violet-950">Checklist designado para você · acesso somente à conferência.</p>}
                <p className="mt-1 font-medium">{o.client_name}</p>
                <p className="muted mt-3 flex gap-2 text-sm">
                  <CalendarDays size={17} className="shrink-0" />
                  {dateLabel(o.starts_at)} até {dateLabel(o.ends_at)}
                </p>
                <p className="muted mt-2 flex gap-2 text-sm">
                  <MapPin size={17} className="shrink-0" />
                  {o.address || "Endereço não informado"}
                </p>
                <p className="muted mt-3 text-sm">
                  {o.checklist_only ? 'Acesso restrito ao checklist designado.' : `Equipe: ${o.team.map((p) => p.name).join(", ")}`}
                </p>
                <div className="mt-4 space-y-2 rounded-xl border bg-slate-50 p-3 text-sm">
                  {attention.overdue && <p className="font-medium text-amber-900">Prazo previsto vencido · confirme o andamento com a equipe.</p>}
                  {!!attention.blockers.length && <ul className="space-y-1 text-amber-900" aria-label="Pendências de encerramento">{attention.blockers.map(item => <li key={item.id}>• {item.label}</li>)}</ul>}
                  {o.status === 'Concluída' && !!attention.missingHours.length && <p>Horas ainda não registradas: <b>{attention.missingHours.map(person => person.name).join(', ')}</b>. A OS permanece concluída.</p>}
                  <p><b>Próxima ação:</b> {attention.nextAction}</p>
                </div>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() => setSelected(o.id)}
                >
                  Abrir ordem de serviço <ClipboardList />
                </Button>
              </article>
              );
            })}
          </div>
          {!loading && !error && !rows.length && (
            <div className="panel p-10 text-center">
              <ClipboardList className="mx-auto mb-3 text-blue-600" />
              <h2>{hasFilters ? 'Nenhuma OS corresponde aos filtros' : history ? 'Nenhuma OS encerrada' : 'Nenhuma OS em aberto'}</h2>
              <p className="muted mt-2">
                {hasFilters ? 'Ajuste o cliente, a equipe, o período ou a atenção selecionada para encontrar o atendimento.' : history ? 'As OS concluídas e canceladas aparecerão aqui. Consulte as OS em aberto para acompanhar os atendimentos atuais.' : admin
                  ? "Use Gerar OS para programar um atendimento. Basta informar o nome do cliente, sem cadastro prévio."
                  : "As ordens designadas para você aparecerão aqui."}
              </p>
              {hasFilters ? <Button className="mt-4" variant="outline" onClick={clearFilters}>Limpar filtros</Button> : admin && !history && <Button className="mt-4" onClick={() => setEditOrder('new')}><Plus />Gerar OS</Button>}
            </div>
          )}
        </>
      )}
      {view === "vehicles" && admin && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="muted">
              Quilometragem atualizada pelas viagens registradas pela equipe.
            </p>
            <Button onClick={() => setResource({ kind: "vehicle" })}>
              <Plus />
              Cadastrar veículo
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.vehicles.map((v) => {
              const trips = data.orders
                  .flatMap((o) =>
                    o.trips.map((t) => ({ ...t, number: o.number, official_number: o.official_number })),
                  )
                  .filter((t) => t.vehicle_id === v.id)
                  .sort((a, b) => b.departed_at.localeCompare(a.departed_at)),
                active = trips.find((t) => t.return_km === null);
              return (
                <article key={v.id} className="panel min-w-0 p-5">
                  <div className="flex justify-between gap-3">
                    <div>
                      <b className="flex items-center gap-2 text-lg">
                        <Car />
                        {v.plate}
                      </b>
                      <p className="muted mt-1">{v.model}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Editar veículo ${v.plate}`}
                      onClick={() => setResource({ kind: "vehicle", data: v })}
                    >
                      <Pencil />
                    </Button>
                  </div>
                  <p className="mt-4 text-3xl font-semibold">
                    {kmLabel(v.odometer)}
                  </p>
                  <p className="mt-2 text-sm">
                    {!v.active
                      ? "Inativo"
                      : active
                        ? `Em viagem · ${orderNumber(active.number, active.official_number)}`
                        : "Sem viagem em aberto"}
                  </p>
                  {v.maintenance_km !== null && (
                    <p
                      className={`mt-3 rounded-lg p-3 text-sm ${v.odometer >= v.maintenance_km ? "bg-amber-50 text-amber-900" : "bg-slate-50"}`}
                    >
                      Próxima revisão: {kmLabel(v.maintenance_km)}
                      {v.odometer >= v.maintenance_km
                        ? " · Revisão atingida"
                        : ""}
                    </p>
                  )}
                  <details className="mt-4 border-t pt-3">
                    <summary className="cursor-pointer font-medium">
                      Histórico de viagens ({trips.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {trips.slice(0, 30).map((t) => (
                        <div
                          key={t.id}
                          className="rounded-lg bg-slate-50 p-3 text-sm"
                        >
                          <button
                            className="font-semibold text-blue-700 underline"
                            onClick={() => setSelected(t.order_id)}
                          >
                            {orderNumber(t.number, t.official_number)}
                          </button>
                          <p>{dateLabel(t.departed_at)}</p>
                          <p>
                            {kmLabel(t.departure_km)} →{" "}
                            {t.return_km === null
                              ? "Aguardando retorno"
                              : kmLabel(t.return_km)}
                          </p>
                          {t.return_km !== null && (
                            <b>
                              {kmLabel(t.return_km - t.departure_km)}{" "}
                              percorridos
                            </b>
                          )}
                        </div>
                      ))}
                      {!trips.length && (
                        <p className="muted text-sm">
                          Nenhuma viagem registrada.
                        </p>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          {!loading && !data.vehicles.length && (
            <p className="panel p-8 text-center muted">
              Cadastre o primeiro veículo com a leitura atual do painel.
            </p>
          )}
        </>
      )}
      {view === "clients" && admin && (
        <>
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <p className="muted">
              Endereço e contato prontos para preencher as novas OS.
            </p>
            <Button onClick={() => setResource({ kind: "client" })}>
              <Plus />
              Cadastrar cliente
            </Button>
          </div>
          <div className="ops-form mb-5"><label>Buscar cliente<input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Nome do cliente" /></label><label>Situação do cliente<select value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option>Ativos</option><option>Arquivados</option><option>Todos</option></select></label></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.clients.filter(c => (clientFilter === 'Todos' || c.active === (clientFilter === 'Ativos')) && c.name.toLocaleLowerCase('pt-BR').includes(clientSearch.trim().toLocaleLowerCase('pt-BR'))).map((c) => (
              <article className="panel min-w-0 p-5" key={c.id}>
                <div className="flex justify-between gap-3">
                  <h2 className="flex gap-2">
                    <Building2 className="shrink-0" />
                    {c.name}
                  </h2>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Editar cliente ${c.name}`}
                    onClick={() => setResource({ kind: "client", data: c })}
                  >
                    <Pencil />
                  </Button>
                </div>
                <p className="muted mt-3 break-words">
                  {c.address || "Endereço a informar na OS"}
                </p>
                <p className="mt-2 text-sm">
                  {c.contact} {c.phone}
                </p>
                <p className="mt-2 text-xs muted">
                  {c.active ? "Ativo" : "Arquivado"}
                </p>
                <ClientLifecycle client={c} demo={demo} onSaved={reload} />
              </article>
            ))}
          </div>
          {!loading && !data.clients.some(c => (clientFilter === 'Todos' || c.active === (clientFilter === 'Ativos')) && c.name.toLocaleLowerCase('pt-BR').includes(clientSearch.trim().toLocaleLowerCase('pt-BR'))) && (
            <p className="panel p-8 text-center muted">
              Nenhum cliente neste filtro. Confira os arquivados ou cadastre um novo cliente. O cadastro prévio é opcional para gerar OS.
            </p>
          )}
        </>
      )}
      {editOrder && (
        <OrderEditor
          order={editOrder === "new" ? undefined : editOrder}
          data={data}
          demo={demo}
          onClose={() => setEditOrder(null)}
          onSaved={async (id) => {
            await reload();
            setSelected(id);
            toast.success("OS salva.");
          }}
        />
      )}
      {resource && (
        <ResourceEditor
          kind={resource.kind}
          resource={resource.data}
          demo={demo}
          onClose={() => setResource(null)}
          onSaved={reload}
        />
      )}
      {order && !editOrder && (
        <OrderDetail
          key={order.id}
          order={order}
          vehicle={data.vehicles.find((v) => v.id === order.vehicle_id)}
          me={me}
          demo={demo}
          onClose={closeOrder}
          onChanged={reload}
          onEdit={() => setEditOrder(order)}
          onPoint={onPoint}
          onRegister={onRegister}
          onNavigate={onNavigate}
          checkedAt={checkedAt}
        />
      )}
    </>
  );
}

function OrderDetail({
  order: o,
  vehicle,
  me,
  demo,
  onClose,
  onChanged,
  onEdit,
  onPoint,
  onRegister,
  onNavigate,
  checkedAt,
}: {
  order: Order;
  vehicle?: Vehicle;
  me: Person;
  demo: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEdit: () => void;
  onPoint: () => Promise<void>;
  onRegister: (order: Order) => void;
  onNavigate: (view: string) => void;
  checkedAt: number;
}) {
  const [numberDraft, setNumberDraft] = useState({ version: o.version, value: o.official_number || "" });
  const officialNumber = numberDraft.version === o.version ? numberDraft.value : (o.official_number || "");
  const setOfficialNumber = (value: string) => setNumberDraft({ version: o.version, value });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [km, setKm] = useState(""),
    [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false), [confirmation, setConfirmation] = useState(''), [deleteError, setDeleteError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false), [cancelReason, setCancelReason] = useState(''), [cancelError, setCancelError] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const beforeScheduledDay = localDateTime(o.starts_at).slice(0, 10) > today();
  const steps = closeoutSteps(o, notes, !beforeScheduledDay);
  const ready = steps.every(step => step.done);
  // Colaboradores recebem apenas o próprio vínculo; a lista da equipe só é confiável para o coordenador.
  const withoutHours = me.role === 'coordinator' ? membersWithoutHours(o) : [];
  const myHoursLogged = !!o.logged_members?.includes(me.id);
  const attention = orderAttention(o, today(), checkedAt, me.role === 'coordinator');
  const sampleChecklists = demo ? demoChecklists(o.id) : [];
  function goToPoints() {
    if ((notes.trim() || km.trim()) && !window.confirm('Abrir o histórico de pontos sem salvar o resultado ou a quilometragem digitados?')) return;
    onClose(); onNavigate('entries');
  }
  function focusSection(id: string) {
    const section = document.getElementById(id);
    section?.scrollIntoView({ block: 'center', behavior: 'smooth' }); section?.focus({ preventScroll: true });
  }
  function closeWindow() {
    if ((!notes.trim() && !km.trim()) || window.confirm('Fechar a janela sem salvar o resultado ou a quilometragem digitados?')) onClose();
  }
  useEffect(() => {
    if (error) { feedback.current?.scrollIntoView({ block: 'center' }); feedback.current?.focus({ preventScroll: true }); }
  }, [error]);
  const open = ["Agendada", "Em andamento"].includes(o.status),
    admin = me.role === "coordinator",
    assigned = o.members.includes(me.id),
    trip = o.trips.find((t) => t.return_km === null),
    checklistOnly = !admin && !!o.checklist_only;
  const acknowledged = o.acknowledgements.some(
    (a) => a.user_id === me.id && a.version === o.version,
  );
  async function cancelOrder() {
    if (demo) { setCancelError('Entre com seu login de coordenador para cancelar.'); return; }
    setBusy(true); setCancelError('');
    try {
      await api('/api/operations', { action: 'cancel', data: { id: o.id, version: o.version, notes: cancelReason } });
      setConfirmCancel(false); setCancelReason('');
      await onChanged();
      toast.success(o.status === 'Em andamento' ? 'Atendimento cancelado. Quem já estava em campo ainda deve registrar as horas; um lembrete foi agendado para quem ativou notificações.' : 'Atendimento cancelado. Pontos, retorno e conferências existentes foram preservados.');
    } catch (e) { setCancelError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteOrder() {
    if (demo) { setDeleteError('Entre com seu login de coordenador para excluir uma OS.'); return; }
    setBusy(true); setDeleteError('');
    try {
      await api('/api/operations', { action: 'delete_order', data: { id: o.id, version: o.version, confirmation } });
      setConfirmDelete(false);
      onClose();
      toast.success(`${orderNumber(o.number, o.official_number)} excluída. O registro da exclusão foi mantido na auditoria.`);
      await onChanged();
    } catch (e) { setDeleteError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function action(action: string, data: Record<string, unknown> = {}) {
    if (demo) {
      setError(
        "Demonstração: os dados são fictícios. Entre para registrar ações.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/operations", { action, data: { id: o.id, ...data } });
      await onChanged();
      setKm("");
      if (action === 'finish') setNotes('');
      toast.success(action === 'finish' ? (withoutHours.length ? `OS concluída. ${withoutHours.length} pessoa(s) ainda precisam registrar horas; um lembrete foi agendado para quem ativou notificações.` : 'OS concluída para toda a equipe. Disponível no histórico de OS.') : action === 'return' ? 'Retorno registrado e quilometragem do veículo atualizada.' : action === 'begin' ? 'Atendimento iniciado. Nenhum ponto pessoal foi aberto.' : 'OS atualizada.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function registerHours() {
    if ((notes.trim() || km.trim()) && !window.confirm('Abrir o registro de horas sem salvar o resultado ou a quilometragem digitados?')) return;
    onClose(); onRegister(o);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (demo) {
      setError("Entre para anexar o PDF.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadOrderPdf(o.id, file);
      await onChanged();
      toast.success("PDF anexado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totalKm = o.trips.reduce(
    (n, t) => n + (t.return_km === null ? 0 : t.return_km - t.departure_km),
    0,
  );
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && closeWindow()}>
      <DialogContent className="ops-dialog max-h-[92svh] overflow-y-auto bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {orderNumber(o.number, o.official_number)} · {o.title}
          </DialogTitle>
          <DialogDescription>
            {o.client_name} · {o.status} · Prioridade {o.priority}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-xs muted">Referência interna: {orderNumber(o.number)}</p>
          {admin && <form className="rounded-xl border p-4 space-y-2" onSubmit={async e => {
            e.preventDefault();
            if (demo) { setError("Entre para alterar o número oficial."); return; }
            setBusy(true); setError("");
            try {
              await api("/api/operations", { action: "set_order_number", data: { id: o.id, version: o.version, official_number: officialNumber } });
              await onChanged(); toast.success("Número oficial da OS atualizado.");
            } catch (err) { setError((err as Error).message); await onChanged(); }
            finally { setBusy(false); }
          }}>
            <label className="block text-sm font-medium" htmlFor="official-order-number">Número oficial da OS</label>
            <input id="official-order-number" className="input w-full" maxLength={80} value={officialNumber} onChange={e => setOfficialNumber(e.target.value)} placeholder="Ex.: 4831 ou OS 4831" disabled={busy} />
            <p className="text-xs muted">Use o número do PDF. Esta alteração preserva pontos, equipe e histórico. Vazio mantém a referência interna.</p>
            <Button type="submit" variant="outline" disabled={busy || officialNumber.trim() === (o.official_number || "")}>Salvar número oficial</Button>
          </form>}
          {demo && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Cenário fictício para consulta. Viagens, checklists e horas mostram as etapas do fluxo; as ações não salvam alterações.</p>}
          {checklistOnly && <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950" aria-label="Sua tarefa nesta OS">
            <h3 className="font-semibold">Checklist designado para você</h3>
            <p className="mt-1">O coordenador designou você para conferir equipamento(s) desta OS. Seu acesso é somente à conferência atribuída: ponto, viagem, ciência da OS e conclusão continuam com a equipe.</p>
            <Button className="mt-3" variant="outline" onClick={() => focusSection('order-checklists')}>Ir à conferência</Button>
          </section>}
          {!checklistOnly && (open || hasCancelledPending(o)) && <section className="rounded-xl border bg-slate-50 p-4" aria-label="Próxima ação desta OS">
            <h3 className="font-semibold">Próxima ação</h3><p className="mt-2 text-sm">{attention.nextAction}</p>
            {!!attention.blockers.length && <div className="mt-3 space-y-2 text-sm">{attention.blockers.map(item => <p key={item.id}><b>{item.label}:</b> {item.action}</p>)}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              {Number(o.active_points) > 0 && <Button variant="outline" onClick={goToPoints}>Abrir histórico de pontos</Button>}
              {o.trips.some(trip => trip.return_km === null) && vehicle && <Button variant="outline" onClick={() => focusSection('order-vehicle')}>Ir ao retorno do veículo</Button>}
              {Number(o.pending_checklists) > 0 && <Button variant="outline" onClick={() => focusSection('order-checklists')}>Ir aos checklists</Button>}
            </div>
          </section>}
          {open && !checklistOnly && <section className="rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Etapas para concluir a OS">
            <h3 className="font-semibold">O que falta para concluir esta OS?</h3>
            <p className="mt-1 text-sm">Registrar horas, finalizar um checklist e concluir a OS são ações diferentes. As horas podem ser informadas depois do trabalho, inclusive após concluir a OS.</p>
            <ol className="mt-3 space-y-3 text-sm">{steps.map(step => <li key={step.id}>
              <span className="font-semibold">{step.done ? '✓ Pronto: ' : 'Pendente: '}{step.label}</span>
              {!step.done && <p className="mt-1">{step.help}</p>}
            </li>)}</ol>
            {me.role === 'coordinator' && o.logged_members && (withoutHours.length
              ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ainda sem horas registradas nesta OS: <b>{withoutHours.map(p => p.name).join(', ')}</b>. Não impede a conclusão; ao concluir, quem ativou as notificações recebe um lembrete para registrar.</p>
              : <p className="mt-3 text-sm">✓ Toda a equipe já registrou horas nesta OS.</p>)}
            {me.role !== 'coordinator' && o.members.includes(me.id) && <p className="mt-3 text-sm">{myHoursLogged ? '✓ Você já registrou horas nesta OS.' : 'Você ainda não registrou suas horas nesta OS. Use “Registrar minhas horas nesta OS” abaixo, agora ou depois de concluir.'}</p>}
            <p className="mt-3 text-xs">Sem viagem aberta, não há retorno pendente. A conferência considera apenas os checklists vinculados; confira também os avisos dos equipamentos abaixo.</p>
            <Button className="mt-3" variant="outline" onClick={() => document.getElementById('order-closeout-result')?.focus()}>Ir ao resultado e conclusão</Button>
          </section>}
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <b className="text-xs uppercase muted">Início previsto</b>
              <p>{dateLabel(o.starts_at)}</p>
            </div>
            <div>
              <b className="text-xs uppercase muted">Término previsto</b>
              <p>{dateLabel(o.ends_at)}</p>
            </div>
            <div className="sm:col-span-2">
              <b className="text-xs uppercase muted">Endereço</b>
              <p className="break-words">
                {o.address ||
                  "Não informado. A navegação ficará disponível quando houver endereço."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {o.address.trim() && (
              <Button asChild>
                <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer">
                  <Navigation />
                  Ir · Google Maps
                </a>
              </Button>
            )}
            {o.pdf_name && (
              <Button asChild variant="outline">
                <a href={`/api/operations/${o.id}/pdf`}>
                  <FileDown />
                  Baixar PDF da OS
                </a>
              </Button>
            )}
            {o.phone && (
              <Button variant="outline" asChild>
                <a href={`tel:${o.phone.replace(/[^+\d]/g, "")}`}>
                  <Phone />
                  {o.contact || "Contato do cliente"}
                </a>
              </Button>
            )}
            {admin && o.status === "Agendada" && (
              <Button variant="outline" onClick={onEdit} disabled={busy}>
                <Pencil />
                Editar OS
              </Button>
            )}
            {admin && <AlertDialog open={confirmDelete} onOpenChange={value => { if (!busy) { setConfirmDelete(value); setConfirmation(''); setDeleteError(''); } }}>
              <AlertDialogTrigger asChild><Button variant="destructive" disabled={busy || o.can_delete === false}><Trash2 />Excluir OS</Button></AlertDialogTrigger>
              <AlertDialogContent className="max-h-[90dvh] overflow-y-auto bg-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {orderNumber(o.number, o.official_number)}?</AlertDialogTitle>
                  <AlertDialogDescription>Cliente: {o.client_name}. Esta ação remove a OS, seu PDF e as listas ainda não conferidas e não pode ser desfeita. Equipamentos do catálogo, veículos e clientes não serão apagados. OS com execução, pontos, viagens ou conferências não podem ser excluídas; use Cancelar OS se ainda estiverem abertas.</AlertDialogDescription>
                </AlertDialogHeader>
                <label className="block text-sm font-medium">Digite a referência interna {orderNumber(o.number)} para confirmar
                  <input className="mt-2 w-full rounded-lg border p-3" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
                </label>
                {deleteError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{deleteError}{open && <Button className="mt-2" variant="outline" onClick={() => { setConfirmDelete(false); setConfirmCancel(true); }}>Cancelar atendimento, preservando histórico</Button>}</div>}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Voltar sem excluir</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={busy || confirmation.trim() !== orderNumber(o.number)} onClick={e => { e.preventDefault(); void deleteOrder(); }}>
                    {busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Excluir definitivamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
            {admin && open && <AlertDialog open={confirmCancel} onOpenChange={value => { if (!busy) { setConfirmCancel(value); setCancelError(''); } }}>
              <AlertDialogTrigger asChild><Button variant="outline" className="border-amber-300 bg-amber-50 text-amber-950" disabled={busy}><Ban />Cancelar OS</Button></AlertDialogTrigger>
              <AlertDialogContent className="max-h-[90dvh] overflow-y-auto bg-white">
                <AlertDialogHeader><AlertDialogTitle>Cancelar atendimento · {orderNumber(o.number, o.official_number)}</AlertDialogTitle><AlertDialogDescription>O cliente pode cancelar mesmo com a equipe a caminho. O histórico será mantido. O ponto de cada pessoa continua até ela encerrá-lo em Meu ponto; registre o km de retorno e confira a devolução dos equipamentos. Não serão permitidos novos pontos ou saídas nesta OS.</AlertDialogDescription></AlertDialogHeader>
                <label className="block text-sm font-medium">Motivo do cancelamento<textarea className="mt-2 min-h-24 w-full rounded-lg border p-3" value={cancelReason} maxLength={5000} disabled={busy} onChange={e => setCancelReason(e.target.value)} placeholder="Ex.: cliente cancelou durante o deslocamento." /></label>
                {cancelError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{cancelError}</p>}
                <AlertDialogFooter><AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={busy || cancelReason.trim().length < 3} onClick={e => { e.preventDefault(); void cancelOrder(); }}>{busy && <LoaderCircle className="animate-spin" />}Confirmar cancelamento</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
          </div>
          {admin && o.can_delete === false && <p className="text-sm text-slate-600">Esta OS tem histórico de execução ou conferência e não pode ser apagada.{open ? ' Use Cancelar OS para interromper o atendimento sem perder os registros.' : ' Os registros permanecem disponíveis para consulta.'}</p>}
          {o.status === 'Cancelada' && <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Atendimento cancelado · histórico preservado</h3><p>{hasCancelledPending(o) ? 'Resolva as pendências abaixo. Cancelar não encerra automaticamente o ponto nem registra o retorno.' : 'Sem pendências de ponto, viagem ou conferência registrada.'}</p><p>Pontos em andamento: {o.active_points || 0} · Viagens sem retorno: {o.trips.filter(t => t.return_km === null).length} · Checklists pendentes: {o.pending_checklists || 0}</p>{o.my_point_active && <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => { onClose(); void onPoint(); }}>Ir ao Meu ponto para encerrar</Button>}</section>}
          {!checklistOnly && <section>
            <h3 className="font-semibold">Equipe designada</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {o.team.map((p) => (
                <span
                  key={p.id}
                  className="rounded-full border px-3 py-2 text-sm"
                >
                  {p.name}
                  {p.access_code ? ` · ${p.access_code}` : ""}
                  {o.acknowledgements.some(
                    (a) => a.user_id === p.id && a.version === o.version,
                  )
                    ? " · Ciente"
                    : " · Leitura pendente"}
                </span>
              ))}
            </div>
            {assigned && !acknowledged && (
              <Button
                disabled={busy}
                className="mt-3"
                variant="outline"
                onClick={() => void action("ack")}
              >
                <Check />
                Confirmar que li a OS
              </Button>
            )}
          </section>}
          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Wrench size={18} />
              Equipamentos e instruções
            </h3>
            {!!o.equipment_models?.length && <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Equipamentos selecionados nesta OS">
              {o.equipment_models.map(model => <li key={model.id} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><b className="block text-blue-950">{model.name}</b>{model.family && <span className="text-blue-800">{model.family}</span>}</li>)}
            </ul>}
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">
              {o.equipment || (o.model_ids?.length ? 'Nenhum material adicional informado.' : 'Nenhum equipamento especificado.')}
            </p>
            <p className="muted mt-3 whitespace-pre-wrap break-words text-sm">
              {o.instructions || "Sem orientações adicionais."}
            </p>
            {/* A biblioteca por OS segue a equipe; o responsável só pelo checklist consulta a Biblioteca técnica geral. */}
            {checklistOnly && !!o.model_ids?.length && <p className="mt-4 border-t pt-3 text-sm text-slate-600">Para consultar manuais e catálogos, use a Biblioteca técnica no menu.</p>}
            {!checklistOnly && !!o.model_ids?.length && <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer rounded-lg border bg-blue-50 p-3 text-sm font-semibold text-blue-800">Consultar documentos dos modelos desta OS</summary>
              <div className="mt-4"><TechnicalLibrary orderId={o.id} admin={admin} demo={demo} /></div>
            </details>}
          </section>
          <section id="order-checklists" tabIndex={-1} aria-label="Conferências de equipamentos">
            {demo ? <div className="space-y-3 rounded-xl border p-4">
              <h3 className="font-semibold">Checklists de ida e volta · demonstração</h3>
              {!sampleChecklists.length && <p className="text-sm text-slate-600">Esta OS não tem checklist vinculado. Abra o atendimento em andamento ou a OS concluída para consultar as conferências fictícias.</p>}
              {sampleChecklists.map(checklist => <article className="rounded-lg border p-3 text-sm" key={checklist.id}>
                <h4 className="font-semibold">{checklist.model_name} · {checklist.status === 'completed' ? 'Finalizado' : 'Pendente'}</h4>
                <p className="mt-1">{checklist.title} · {checklist.identification}</p>
                <ul className="mt-3 space-y-2">{checklist.items.map(item => <li key={item.id} className="rounded-lg bg-slate-50 p-3">
                  <b>{item.label}</b><p>Previsto: {item.planned ?? 'Não informado'} · Ida: {item.outgoing ? item.outgoing_qty : 'Pendente'} · Volta: {item.incoming ? item.incoming_qty : 'Pendente'}</p>
                  {item.notes && <p className="mt-1 text-amber-900">{item.notes}</p>}
                </li>)}</ul><p className="mt-3 text-slate-600">{checklist.notes}</p>
              </article>)}
            </div> : <OrderChecklists orderId={o.id} admin={admin} closed={o.status === 'Concluída'} cancelled={o.status === 'Cancelada'} running={o.status === 'Em andamento'} demo={demo} onChanged={onChanged} />}
          </section>
          {vehicle && (
            <section id="order-vehicle" tabIndex={-1} className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <Car size={18} />
                {vehicle.plate} · {vehicle.model}
              </h3>
              <p className="mt-2 text-sm">
                Painel atual: <b>{kmLabel(vehicle.odometer)}</b> · Percorrido
                nesta OS: <b>{kmLabel(totalKm)}</b>
              </p>
              <p className="muted mt-2 text-xs">
                A leitura é a do painel do carro. Uma pessoa registra por
                viagem; toda a equipe acompanha.
              </p>
              {!checklistOnly && (open || (o.status === 'Cancelada' && trip)) && (
                <form
                  className="ops-form mt-4"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void action(trip ? "return" : "depart", { km: Number(km) });
                  }}
                >
                  <label>
                    {trip ? "Km no retorno" : "Km na saída"}
                    <input
                      type="number"
                      required
                      step={1}
                      min={Number(vehicle.odometer)}
                      max={9999999}
                      value={km}
                      onChange={(e) => setKm(e.target.value)}
                      placeholder={String(vehicle.odometer)}
                    />
                  </label>
                  <Button className="self-end" disabled={busy} type="submit">
                    <Gauge />
                    {trip ? "Registrar retorno" : "Registrar saída"}
                  </Button>
                </form>
              )}
              <div className="mt-3 space-y-2">
                {o.trips.map((t) => (
                  <p key={t.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    {dateLabel(t.departed_at)} · {kmLabel(t.departure_km)} →{" "}
                    {t.return_km === null
                      ? "Aguardando retorno"
                      : kmLabel(t.return_km)}
                  </p>
                ))}
              </div>
            </section>
          )}
          {open && !checklistOnly && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold">Atendimento e ponto</h3>
              <p className="mt-1 text-sm text-blue-900">
                Cada colaborador registra seus horários após o trabalho. O primeiro registro de horas (ou a saída do veículo) marca o atendimento como iniciado automaticamente. Concluir a OS encerra o atendimento para a equipe, mas as horas ainda podem ser registradas depois, conforme as permissões de data.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {assigned && !o.my_point_active && (
                  <Button disabled={busy || beforeScheduledDay} onClick={registerHours}>
                    <Play />
                    Registrar minhas horas nesta OS
                  </Button>
                )}
                {assigned && o.my_point_active && <Button variant="outline" disabled={busy} onClick={() => {
                  if ((notes.trim() || km.trim()) && !window.confirm('Ir ao meu ponto sem salvar o resultado ou a quilometragem digitados?')) return;
                  const query = new URLSearchParams(window.location.search); query.set('view', 'register');
                  window.history.pushState({}, '', `/?${query}`); window.dispatchEvent(new PopStateEvent('popstate')); onClose();
                }}>Ver / encerrar meu ponto</Button>}
              </div>
              {beforeScheduledDay && <p className="mt-2 text-sm">O atendimento e o ponto ficam disponíveis a partir do dia agendado da OS, no horário de Brasília.</p>}
              <label className="ops-notes mt-4 block text-sm">
                Resultado do serviço (mínimo de 3 caracteres)
                <textarea
                  id="order-closeout-result"
                  value={notes}
                  maxLength={5000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="O que foi realizado? Há pendências ou necessidade de retorno?"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {open && (
                  <Button
                    disabled={busy || !ready}
                    onClick={() => { if (window.confirm('Concluir esta OS para toda a equipe e movê-la para o histórico? Isso não aprova nem altera os pontos registrados.')) void action("finish", { notes }); }}
                  >
                    <Check />
                    Concluir OS
                  </Button>
                )}
                {admin && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => { setCancelReason(notes); setConfirmCancel(true); }}
                  >
                    Cancelar OS
                  </Button>
                )}
              </div>
              <p className="mt-3 text-sm">{ready ? 'Tudo pronto. Concluir OS move este atendimento para o histórico; a aprovação dos pontos é separada.' : 'Resolva as pendências indicadas no início desta janela para liberar a conclusão.'}</p>
            </section>
          )}
          {o.completion && (
            <section className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-semibold">Resultado / encerramento</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {o.completion}
              </p>
            </section>
          )}
          {!open && assigned && <section className="rounded-xl border bg-blue-50 p-4"><p className="mb-3 text-sm">Trabalhou nesta OS? Mesmo encerrada, ela aceita o registro das horas realmente realizadas, conforme as permissões de data. Isso não reabre o atendimento.</p><Button disabled={busy || beforeScheduledDay} onClick={registerHours}>Registrar minhas horas nesta OS</Button></section>}
          {admin && open && (
            <label className="ops-notes block rounded-xl border border-dashed p-4 text-sm">
              {o.pdf_name ? "Substituir PDF da OS" : "Anexar PDF da OS"} (até 3
              MB)
              <input
                className="mt-2 block max-w-full"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
          )}
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">
              Histórico da OS
            </summary>
            <div className="mt-3 space-y-3">
              {o.events.map((e) => (
                <div
                  key={e.id}
                  className="border-l-2 border-blue-200 pl-3 text-sm"
                >
                  <b>{e.action}</b>
                  <p className="muted">
                    {e.name} · {dateLabel(e.created_at)}
                  </p>
                  {e.detail && (
                    <p className="whitespace-pre-wrap break-words">
                      {e.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
          {error && (
            <p
              ref={feedback}
              tabIndex={-1}
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <Button
            disabled={busy}
            variant="outline"
            className="w-full"
            onClick={closeWindow}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}Fechar janela
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
