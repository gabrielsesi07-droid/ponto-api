"use client";
import { TechnicalLibrary } from "./technical-library";
import { OrderChecklists } from './checklist-editor';
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
import { hasCancelledPending, matchesOrderFilter } from '@/lib/order-lifecycle';

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
function demoOperations(me: Person): OperationsData {
  const vehicle: Vehicle = {
    id: "demo-vehicle",
    plate: "ABC1D23",
    model: "Fiorino · Equipe técnica",
    odometer: 42850,
    maintenance_km: 45000,
    active: true,
    notes: "Conferir ferramentas antes da saída.",
    version: 1,
  };
  const client: ServiceClient = {
    id: "demo-client",
    name: "Indústria Nova Era",
    address: "Avenida Paulista, 1578, São Paulo - SP",
    contact: "Recepção técnica",
    phone: "",
    notes: "",
    active: true,
  };
  const order: Order = {
    id: "demo-order",
    number: 1,
    title: "Manutenção preventiva",
    client_id: client.id,
    client_name: client.name,
    address: client.address,
    place_id: "",
    contact: client.contact,
    phone: "",
    starts_at: today() + "T08:00:00-03:00",
    ends_at: today() + "T18:00:00-03:00",
    members: [me.id],
    team: [{ id: me.id, name: me.name }],
    vehicle_id: vehicle.id,
    equipment: "1 multímetro\n1 maleta de ferramentas\nEPIs da equipe",
    instructions:
      "Apresentar a OS na portaria. Conferir os equipamentos antes de sair.",
    priority: "Normal",
    status: "Agendada",
    completion: "",
    version: 1,
    pdf_name: null,
    acknowledgements: [],
    trips: [],
    events: [],
  };
  return {
    orders: [order],
    vehicles: [vehicle],
    clients: [client],
    people: [{ id: me.id, name: me.name, active: true }],
  };
}
export function ServiceOrders({
  me,
  view,
  demo,
  blocked,
  onPoint,
}: {
  me: Person;
  view: string;
  demo: boolean;
  blocked: boolean;
  onPoint: () => Promise<void>;
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
  const [filter, setFilter] = useState("Abertas"),
    [search, setSearch] = useState("");
  const dismissed = useRef(new Set<string>()),
    request = useRef(0);
  const admin = me.role === "coordinator";
  const reload = useCallback(async () => {
    const version = ++request.current;
    try {
      const result = demo
        ? demoOperations(me)
        : await api<OperationsData>("/api/operations");
      if (version === request.current) {
        setData(result);
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
  const due = data.orders.filter(
    (o) =>
      o.members.includes(me.id) &&
      (hasCancelledPending(o) || (["Agendada", "Em andamento"].includes(o.status) &&
      localDateTime(o.starts_at).slice(0, 10) <= today() &&
      (localDateTime(o.ends_at).slice(0, 10) >= today() ||
        o.status === "Em andamento"))),
  );
  useEffect(() => {
    if (blocked || selected || editOrder || resource || demo || view === 'register') return;
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
          matchesOrderFilter(o, filter) &&
          [orderNumber(o.number), o.client_name, o.title, o.address]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data.orders, filter, search],
  );
  const order = data.orders.find((o) => o.id === selected);
  const shown = ["orders", "vehicles", "clients"].includes(view);
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
                  .map((o) => `${orderNumber(o.number)} · ${o.client_name}`)
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
      {view === "orders" && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="muted text-sm">
              {admin
                ? "Planeje os atendimentos e acompanhe a equipe. Cada nova OS recebe um número sequencial, que não muda ao editar."
                : "Seus atendimentos, equipe, trajetos e instruções."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                aria-label="Atualizar ordens"
                onClick={() => void reload()}
              >
                <RefreshCw />
              </Button>
              {admin && (
                <Button onClick={() => setEditOrder("new")}>
                  <Plus />
                  Gerar OS
                </Button>
              )}
            </div>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                "Agendadas",
                data.orders.filter((o) => o.status === "Agendada").length,
              ],
              [
                "Em andamento",
                data.orders.filter((o) => o.status === "Em andamento").length,
              ],
              [
                "Concluídas",
                data.orders.filter((o) => o.status === "Concluída").length,
              ],
            ].map(([label, n]) => (
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Número, cliente, serviço ou endereço"
              />
            </label>
            <label>
              Situação
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "Abertas",
                  "Pendências",
                  "Todas",
                  "Agendada",
                  "Em andamento",
                  "Concluída",
                  "Cancelada",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((o) => (
              <article className="panel min-w-0 p-5" key={o.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-blue-700">{orderNumber(o.number)}</b>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                    {o.status} · {o.priority}
                  </span>
                </div>
                <h2 className="mt-3 break-words">{o.title}</h2>
                {hasCancelledPending(o) && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">Cancelada com pendências: confira ponto, retorno e equipamentos.</p>}
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
                  Equipe: {o.team.map((p) => p.name).join(", ")}
                </p>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() => setSelected(o.id)}
                >
                  Abrir ordem de serviço <ClipboardList />
                </Button>
              </article>
            ))}
          </div>
          {!loading && !rows.length && (
            <div className="panel p-10 text-center">
              <ClipboardList className="mx-auto mb-3 text-blue-600" />
              <h2>Nenhuma OS neste filtro</h2>
              <p className="muted mt-2">
                {admin
                  ? "Use Gerar OS para programar um atendimento. Basta informar o nome do cliente, sem cadastro prévio."
                  : "As ordens designadas para você aparecerão aqui."}
              </p>
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
                    o.trips.map((t) => ({ ...t, number: o.number })),
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
                        ? `Em viagem · ${orderNumber(active.number)}`
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
                            {orderNumber(t.number)}
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
          <div className="grid gap-4 lg:grid-cols-2">
            {data.clients.map((c) => (
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
                  {c.active ? "Ativo" : "Inativo"}
                </p>
              </article>
            ))}
          </div>
          {!loading && !data.clients.length && (
            <p className="panel p-8 text-center muted">
              Cadastro opcional. Você pode gerar uma OS informando apenas o nome
              do cliente.
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
          onClose={() => setSelected(null)}
          onChanged={reload}
          onEdit={() => setEditOrder(order)}
          onPoint={onPoint}
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
}: {
  order: Order;
  vehicle?: Vehicle;
  me: Person;
  demo: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEdit: () => void;
  onPoint: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [km, setKm] = useState(""),
    [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false), [confirmation, setConfirmation] = useState(''), [deleteError, setDeleteError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false), [cancelReason, setCancelReason] = useState(''), [cancelError, setCancelError] = useState('');
  const open = ["Agendada", "Em andamento"].includes(o.status),
    admin = me.role === "coordinator",
    assigned = o.members.includes(me.id),
    trip = o.trips.find((t) => t.return_km === null);
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
      toast.success('Atendimento cancelado. Pontos, retorno e conferências existentes foram preservados.');
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
      toast.success(`${orderNumber(o.number)} excluída. O registro da exclusão foi mantido na auditoria.`);
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
      toast.success("OS atualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startPoint() {
    if (demo) {
      setError("Entre com seu login para iniciar o ponto desta OS.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/clock", {
        action: "start",
        order_id: o.id,
        started_at: localDateTime(new Date().toISOString()),
        company: o.client_name,
        service: o.title,
        notes: "",
      });
      await onChanged();
      await onPoint();
      onClose();
      toast.success("Seu ponto foi iniciado e vinculado à OS.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="ops-dialog max-h-[92svh] overflow-y-auto bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {orderNumber(o.number)} · {o.title}
          </DialogTitle>
          <DialogDescription>
            {o.client_name} · {o.status} · Prioridade {o.priority}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
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
                  <AlertDialogTitle>Excluir {orderNumber(o.number)}?</AlertDialogTitle>
                  <AlertDialogDescription>Cliente: {o.client_name}. Esta ação remove a OS, seu PDF e as listas ainda não conferidas e não pode ser desfeita. Equipamentos do catálogo, veículos e clientes não serão apagados. OS com execução, pontos, viagens ou conferências não podem ser excluídas; use Cancelar OS se ainda estiverem abertas.</AlertDialogDescription>
                </AlertDialogHeader>
                <label className="block text-sm font-medium">Digite {orderNumber(o.number)} para confirmar
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
                <AlertDialogHeader><AlertDialogTitle>Cancelar atendimento · {orderNumber(o.number)}</AlertDialogTitle><AlertDialogDescription>O cliente pode cancelar mesmo com a equipe a caminho. O histórico será mantido. O ponto de cada pessoa continua até ela encerrá-lo em Meu ponto; registre o km de retorno e confira a devolução dos equipamentos. Não serão permitidos novos pontos ou saídas nesta OS.</AlertDialogDescription></AlertDialogHeader>
                <label className="block text-sm font-medium">Motivo do cancelamento<textarea className="mt-2 min-h-24 w-full rounded-lg border p-3" value={cancelReason} maxLength={5000} disabled={busy} onChange={e => setCancelReason(e.target.value)} placeholder="Ex.: cliente cancelou durante o deslocamento." /></label>
                {cancelError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{cancelError}</p>}
                <AlertDialogFooter><AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={busy || cancelReason.trim().length < 3} onClick={e => { e.preventDefault(); void cancelOrder(); }}>{busy && <LoaderCircle className="animate-spin" />}Confirmar cancelamento</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
          </div>
          {admin && o.can_delete === false && <p className="text-sm text-slate-600">Esta OS tem histórico de execução ou conferência e não pode ser apagada.{open ? ' Use Cancelar OS para interromper o atendimento sem perder os registros.' : ' Os registros permanecem disponíveis para consulta.'}</p>}
          {o.status === 'Cancelada' && <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Atendimento cancelado · histórico preservado</h3><p>{hasCancelledPending(o) ? 'Resolva as pendências abaixo. Cancelar não encerra automaticamente o ponto nem registra o retorno.' : 'Sem pendências de ponto, viagem ou conferência registrada.'}</p><p>Pontos em andamento: {o.active_points || 0} · Viagens sem retorno: {o.trips.filter(t => t.return_km === null).length} · Checklists pendentes: {o.pending_checklists || 0}</p>{o.my_point_active && <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => { onClose(); void onPoint(); }}>Ir ao Meu ponto para encerrar</Button>}</section>}
          <section>
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
          </section>
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
            {!!o.model_ids?.length && <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer rounded-lg border bg-blue-50 p-3 text-sm font-semibold text-blue-800">Consultar documentos dos modelos desta OS</summary>
              <div className="mt-4"><TechnicalLibrary orderId={o.id} admin={admin} demo={demo} /></div>
            </details>}
          </section>
          <OrderChecklists orderId={o.id} admin={admin} closed={o.status === 'Concluída'} cancelled={o.status === 'Cancelada'} demo={demo} onChanged={onChanged} />
          {vehicle && (
            <section className="rounded-xl border p-4">
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
              {(open || (o.status === 'Cancelada' && trip)) && (
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
          {open && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold">Atendimento e ponto</h3>
              <p className="mt-1 text-sm text-blue-900">
                Cada colaborador inicia e encerra o próprio ponto. Concluir a OS
                encerra o atendimento para a equipe.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {assigned && (
                  <Button disabled={busy} onClick={() => void startPoint()}>
                    <Play />
                    Iniciar meu ponto nesta OS
                  </Button>
                )}
                {o.status === "Agendada" && (
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void action("begin")}
                  >
                    Iniciar atendimento
                  </Button>
                )}
              </div>
              <label className="ops-notes mt-4 block text-sm">
                Resultado do serviço
                <textarea
                  value={notes}
                  maxLength={5000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="O que foi realizado? Há pendências ou necessidade de retorno?"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === "Em andamento" && (
                  <Button
                    disabled={busy || notes.trim().length < 3}
                    onClick={() => void action("finish", { notes })}
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
            onClick={onClose}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}Fechar OS
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
