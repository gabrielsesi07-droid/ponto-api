"use client";
import { orderLabel } from "@/lib/order-label.mjs";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Clock3,
  LayoutDashboard,
  Timer,
  ListChecks,
  FileBarChart2,
  Users,
  Settings,
  Plus,
  UserRound,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Download,
  Fingerprint,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  Pencil,
  KeyRound,
  Building2,
  Eye,
  ArrowRight,
  ClipboardList,
  Car,
  BookOpen,
  Wrench,
  History,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pick, Blank, Status } from "./controls";
import { EditDialog, SettingsForm, api, type Editor } from "./editors";
import { ManualPoints } from "./manual-points";
import {PushSettings} from './push-settings';
import { QuickLogin } from "./quick-login";
import { PersonalInsights } from "./personal-insights";
import { Dashboard } from "./dashboard";
import { MonthClosing } from "./month-closing";
import { EntriesTable } from "./entries-table";
import { demoState } from "@/lib/demo";
import { ServiceOrders } from "./service-orders";
import { TechnicalLibrary } from "./technical-library";
import type { CenterAction } from "@/lib/coordinator-center";
import "@/app/operations.css";
import "@/app/checklists.css";
import {
  calculate,
  totals,
  duration,
  money,
  initials,
  today,
  monthBounds,
  type State,
  type Entry,
  type Person,
} from "@/lib/domain";
const nav = [
  {
    key: "dashboard",
    label: "Painel do coordenador",
    icon: LayoutDashboard,
    admin: true,
  },
  { key: "register", label: "Meu ponto", icon: Timer },
  { key: "orders", label: "Ordens de serviço", icon: ClipboardList },
  { key: "order-history", label: "Histórico de OS", icon: History },
  { key: "library", label: "Biblioteca técnica", icon: BookOpen },
  { key: "equipment", label: "Equipamentos", icon: Wrench, admin: true },
  { key: "vehicles", label: "Veículos", icon: Car, admin: true },
  { key: "clients", label: "Clientes", icon: Building2, admin: true },
  { key: "insights", label: "Meu resumo", icon: FileBarChart2 },
  { key: "entries", label: "Histórico de pontos", icon: ListChecks },
  { key: "reports", label: "Relatórios", icon: FileBarChart2 },
  { key: "people", label: "Colaboradores", icon: Users, admin: true },
  { key: "settings", label: "Configurações", icon: Settings, admin: true },
  { key: "profile", label: "Meu acesso", icon: UserRound },
];
type Session = {
  setup?: boolean;
  email?: string;
  name?: string;
  me?: Person;
  error?: string;
};
/** Inscrição de avisos deste aparelho, sem bloquear a saída se o navegador não responder. */
async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  try {
    return await Promise.race([
      navigator.serviceWorker
        .getRegistration("/")
        .then((registration) => registration?.pushManager.getSubscription() ?? null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2000)),
    ]);
  } catch {
    return null;
  }
}
async function loadSessionWithRetry() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await api<Session>("/api/session");
    } catch (error) {
      lastError = error;
      if (attempt < 2)
        await new Promise((resolve) =>
          window.setTimeout(resolve, 500 * (attempt + 1)),
        );
    }
  }
  throw lastError;
}
function Navigation({
  view,
  go,
  state,
  demo,
}: {
  view: string;
  go: (v: string) => void;
  state: State | null;
  demo: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-3 text-white">
          <div className="rounded-xl bg-white/10 p-2">
            <Clock3 className="size-7 text-amber-300" />
          </div>
          <div>
            <b className="text-[23px] tracking-tight">
              HoraCerta<span className="text-amber-300">.</span>
            </b>
            <p className="text-[10px] tracking-[.18em] text-slate-300">
              PONTO EM SERVIÇO
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-4">
        <div className="mx-1 my-3 rounded-xl border border-white/10 p-3.5 flex items-center gap-3">
          <span className="rounded-lg bg-white/10 p-2">
            <Building2 size={18} />
          </span>
          <div>
            <b className="text-sm text-white">Minha equipe</b>
            <p className="text-xs text-slate-400 mt-1">
              {state
                ? state.users.length + " pessoas cadastradas"
                : "Seu espaço de trabalho"}
            </p>
          </div>
        </div>
        <p className="eyebrow px-4 pt-6 pb-3 text-slate-400">
          Área de trabalho
        </p>
        <SidebarMenu>
          {nav
            .filter(
              (n) => !n.admin || state?.me.role === "coordinator" || !state,
            )
            .map((n) => (
              <SidebarMenuItem key={n.key}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={view === n.key}
                  onClick={() => {
                    go(n.key);
                    setOpenMobile(false);
                  }}
                >
                  <n.icon />
                  <span>{n.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-5">
        <div className="rounded-xl bg-white/5 p-4 mb-3">
          <div className="flex items-center gap-2 text-amber-200 text-sm font-medium">
            <ShieldCheck size={17} />
            {demo ? "Demonstração" : "Acesso protegido"}
          </div>
          <p className="text-xs leading-relaxed text-slate-300 mt-2">
            {demo
              ? "Explore com dados fictícios. Nenhum lançamento é salvo."
              : "Cada pessoa vê os dados permitidos para seu perfil."}
          </p>
        </div>
        <button
          className="flex gap-3 items-center p-2 text-left"
          onClick={() => go("profile")}
        >
          <span className="avatar bg-slate-600! text-white!">
            {initials(state?.me.name || "HC")}
          </span>
          <div>
            <b className="block text-sm text-white">
              {state?.me.name || "Bem-vindo"}
            </b>
            <small className="text-slate-300">
              {state?.me.role === "employee" ? "Colaborador" : "Coordenador"}
            </small>
          </div>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
export function Workspace() {
  const requestVersion = useRef(0),
    explicitView = useRef(false),
    landedFor = useRef(""),
    [ready, setReady] = useState(false),
    [ordersKey, setOrdersKey] = useState(0);
  const [view, setView] = useState("register"),
    [demo, setDemo] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7));
  const [user, setUser] = useState("all"),
    [status, setStatus] = useState("all"),
    [day, setDay] = useState("all"),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState("month"),
    [customFrom, setCustomFrom] = useState(
      monthBounds(today().slice(0, 7)).from,
    ),
    [customTo, setCustomTo] = useState(today()),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null),
    [deleting, setDeleting] = useState<Entry | null>(null),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false);
  const bounds = monthBounds(month),
    range =
      period === "custom"
        ? { from: customFrom, to: customTo }
        : period === "week"
          ? {
              from: new Date(
                new Date(today() + "T12:00:00Z").getTime() -
                  ((new Date(today() + "T12:00:00Z").getUTCDay() + 6) % 7) *
                    86400000,
              )
                .toISOString()
                .slice(0, 10),
              to: today(),
            }
          : bounds;
  const historyStart = new Date(month + "-01T12:00:00Z");
  historyStart.setUTCMonth(
    historyStart.getUTCMonth() - (view === "insights" ? 5 : 1),
  );
  const historyFrom = historyStart.toISOString().slice(0, 10);
  const fetchFrom = range.from < historyFrom ? range.from : historyFrom,
    fetchTo = range.to > bounds.to ? range.to : bounds.to;
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    if (demo) {
      setData(demoState());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const s = await loadSessionWithRetry();
      // Com troca de PIN obrigatória, nenhuma rota de dados é chamada até o novo PIN ser salvo.
      const result =
        s.me && !s.me.pin_change_required
          ? await api<State>("/api/state?from=" + fetchFrom + "&to=" + fetchTo)
          : null;
      if (version !== requestVersion.current) return;
      setSession(s);
      setData(result);
    } catch (e) {
      // O servidor passou a exigir a troca de PIN no meio da sessão: mostra o bloqueio, não um erro.
      if ((e as { code?: string }).code === "PIN_CHANGE_REQUIRED") {
        const s = await loadSessionWithRetry().catch(() => null);
        if (version === requestVersion.current && s?.me) {
          setSession({ ...s, me: { ...s.me, pin_change_required: true } });
          setData(null);
          return;
        }
      }
      if (version === requestVersion.current) {
        setError((e as Error).message);
        setData(null);
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [demo, fetchFrom, fetchTo]);
  const clearLoginError = useCallback(() => setError(""), []);
  useEffect(() => {
    const syncFromLocation = () => {
      const q = new URLSearchParams(window.location.search);
      explicitView.current = q.has("view");
      setView(q.get("view") || "register");
      setDemo(q.get("demo") === "1");
      setReady(true);
    };
    const timer = window.setTimeout(syncFromLocation, 0);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, ready]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [user, status, day, search, month, period, customFrom, customTo]);
  useEffect(() => {
    if (
      !data ||
      !nav.find((n) => n.key === view)?.admin ||
      data.me.role === "coordinator"
    )
      return;
    const timer = window.setTimeout(() => setView("register"), 0);
    return () => window.clearTimeout(timer);
  }, [data, view]);
  // Sem `view` explícita na URL, o coordenador começa pela central de pendências.
  useEffect(() => {
    if (!data || explicitView.current || landedFor.current === data.me.id) return;
    landedFor.current = data.me.id;
    if (data.me.role !== "coordinator") return;
    const timer = window.setTimeout(() => {
      setView("dashboard");
      const p = new URLSearchParams(window.location.search);
      p.set("view", "dashboard");
      window.history.replaceState({}, "", "?" + p);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data]);
  const go = useCallback((v: string, params: Record<string, string> = {}) => {
    setView(v);
    if (v === "register") setMonth(today().slice(0, 7));
    setStatus("all");
    setDay("all");
    setSearch("");
    setPeriod("month");
    setPage(1);
    const p = new URLSearchParams(window.location.search);
    p.set("view", v);
    // O parâmetro `order` só vale para a navegação que o pediu.
    p.delete("order");
    for (const [k, value] of Object.entries(params)) p.set(k, value);
    explicitView.current = true;
    window.history.pushState({}, "", "?" + p);
  }, []);
  const centerAction = useCallback(
    (a: CenterAction) => {
      if (a.kind === "order") {
        go("orders", { order: a.orderId });
        // Remonta ServiceOrders para que ele abra a OS indicada em `order`.
        setOrdersKey((k) => k + 1);
        return;
      }
      if (a.kind === "orders" || a.kind === "people") {
        go(a.kind);
        return;
      }
      go("entries");
      setUser(a.userId || "all");
      if (a.month) setMonth(a.month);
      if (a.status) setStatus(a.status);
    },
    [go],
  );
  function changeDemo(next: boolean) {
    setDemo(next);
    setUser("all");
    setData(null);
    setSession(null);
    setError("");
    const p = new URLSearchParams(window.location.search);
    if (next) p.set("demo", "1");
    else p.delete("demo");
    window.history.replaceState({}, "", "?" + p);
  }
  const all = useMemo(() => calculate(data?.entries || []), [data]);
  const rows = useMemo(
    () =>
      all
        .filter(
          (e) =>
            e.date >= range.from &&
            e.date <= range.to &&
            (user === "all" || e.user_id === user) &&
            (status === "all" || e.status === status) &&
            (day === "all" || e.kind === day) &&
            (!search ||
              [
                e.date,
                e.date.split("-").reverse().join("/"),
                e.company,
                e.order_number ? orderLabel(e.order_number, e.order_official_number) : '',
                e.service,
                e.notes,
              ]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)),
    [all, range.from, range.to, user, status, day, search],
  );
  const t = totals(rows),
    admin = data?.me.role === "coordinator";
  const title = nav.find((n) => n.key === view)?.label || "Dashboard";
  async function afterSave() {
    await reload();
  }
  /** Encerra a sessão local e volta ao login; a próxima entrada recalcula a tela inicial. */
  async function signOut() {
    // "Sair" também encerra os avisos deste aparelho. Sem suporte ou com erro, a saída continua.
    const subscription = await currentPushSubscription();
    try {
      await api(
        "/api/login",
        subscription ? { push_endpoint: subscription.endpoint } : {},
        "DELETE",
      );
    } catch {
      // A sessão pode já ter sido revogada (por exemplo, após trocar o PIN).
    }
    try {
      await subscription?.unsubscribe();
    } catch {
      // A inscrição local pode já ter sido removida pelo navegador.
    }
    setData(null);
    setSession(null);
    setUser("all");
    setView("register");
    explicitView.current = false;
    landedFor.current = "";
    const p = new URLSearchParams(window.location.search);
    p.delete("view");
    p.delete("order");
    window.history.replaceState({}, "", p.size ? "?" + p : window.location.pathname);
    await reload();
  }
  async function updateStatus(e: Entry, s: Entry["status"]) {
    if (demo) {
      toast.info("A demonstração usa dados fictícios.");
      return;
    }
    setBusy(true);
    try {
      await api(
        "/api/entries",
        { id: e.id, version: e.version, status: s },
        "PATCH",
      );
      await reload();
      toast.success("Status atualizado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    if (demo) {
      toast.info("A demonstração não altera dados.");
      setDeleting(null);
      return;
    }
    setBusy(true);
    try {
      await api(
        "/api/entries",
        { id: deleting.id, version: deleting.version },
        "DELETE",
      );
      await reload();
      setDeleting(null);
      toast.success(
        "Lançamento excluído. O histórico da alteração foi preservado.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: "csv" | "xlsx" | "pdf") {
    if (!data) return;
    setExporting(true);
    try {
      const { exportReport } = await import("@/lib/export");
      await exportReport(format, rows, data, range.from + " a " + range.to);
      toast.success("Relatório exportado.");
    } catch {
      toast.error("Não foi possível exportar o relatório.");
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "start_time_entry",
            description:
              "Abre a área de ponto da pessoa conectada. Não inicia nem salva um serviço.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("O comando não aceita parâmetros.");
              if (!data) throw new Error("Entre no espaço primeiro.");
              go("register");
              return { opened: true, saved: false };
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, [data, go]);
  const entryTable = (compact = false) => (
    <EntriesTable
      rows={compact ? rows.slice(0, 5) : rows.slice((page - 1) * 15, page * 15)}
      state={data!}
      onEdit={(e) => setEditor({ kind: "entry", data: e })}
      onDelete={setDeleting}
      onStatus={updateStatus}
      compact={compact}
      busy={busy}
    />
  );
  if (!data && !demo && session?.me?.pin_change_required) {
    return <PinChangeGate me={session.me} onSignOut={signOut} />;
  }
  if (!data) {
    return (
      <QuickLogin
        setup={!!session?.setup}
        error={error}
        clearError={clearLoginError}
        loading={loading}
        reload={reload}
        demo={() => changeDemo(true)}
      />
    );
  }
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}
    >
      <Navigation view={view} go={go} state={data} demo={demo} />
      <main className="min-w-0 flex-1">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b bg-white px-5 lg:px-9">
          <div className="flex items-center gap-3">
            <SidebarTrigger aria-label="Abrir menu" className="size-11" />
            <span className="text-sm muted hidden sm:inline">
              Área de trabalho
            </span>
            <ChevronRight size={14} className="muted hidden sm:inline" />
            <span className="text-sm font-medium hidden min-[400px]:inline">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {demo ? (
              <Button
                variant="outline"
                onClick={() => changeDemo(false)}
                className="action text-sm"
              >
                <Eye size={16} />
                Sair da demonstração
              </Button>
            ) : data ? (
              <Button
                variant="ghost"
                className="action"
                aria-label="Sair da conta"
                onClick={() => void signOut()}
              >
                <LogOut size={17} />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            ) : (
              <Button
                onClick={() => changeDemo(true)}
                variant="outline"
                className="action text-sm"
              >
                Ver demonstração
              </Button>
            )}
            <span className="avatar hidden sm:flex">
              {initials(data?.me.name || "HC")}
            </span>
          </div>
        </header>
        {demo && (
          <div className="bg-amber-50 text-amber-900 border-b border-amber-200 px-5 lg:px-9 py-2.5 text-sm flex gap-2 items-center">
            <Eye size={16} />
            <span>
              Demonstração · Os nomes, valores e jornadas abaixo são fictícios.
            </span>
          </div>
        )}
        <div className="content">
          {data && (
            <>
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow muted mb-2">
                    {view === "dashboard"
                      ? "VISÃO GERAL"
                      : ["profile", "insights", "register"].includes(view)
                        ? "MEU ESPAÇO"
                        : "ESPAÇO DA EQUIPE"}
                  </p>
                  <h1>{title}</h1>
                  <p className="muted mt-1 text-[15px]">
                    {view === "dashboard"
                      ? "O que precisa da sua atenção, em ordem de prioridade."
                      : ["library", "equipment"].includes(view)
                        ? "Encontre os materiais técnicos que apoiam cada serviço."
                      : view === "insights"
                        ? "Suas horas extras, suas datas e sua evolução mês a mês."
                        : view === "entries"
                          ? "Todas as jornadas, com os detalhes que você precisa."
                          : view === "reports"
                            ? "Transforme horas registradas em decisões mais claras."
                            : view === "people"
                              ? "Uma equipe pequena. Uma visão completa."
                              : view === "clients"
                                ? "Organize os lugares onde sua equipe faz a diferença."
                                : view === "settings"
                                  ? "As regras da sua equipe, do seu jeito."
                                  : view === "register"
                                    ? "Registre os horários reais após o trabalho, vinculados à OS."
                                    : "Sua atividade, seu histórico e seus resultados."}
                  </p>
                </div>
                <div className="flex gap-3">
                  {loading && (
                    <LoaderCircle
                      className="animate-spin muted self-center"
                      size={18}
                    />
                  )}
                  <Button
                    variant="outline"
                    className="action hidden sm:flex"
                    onClick={() => void reload()}
                    aria-label="Atualizar dados"
                  >
                    <RefreshCw size={16} />
                  </Button>
                  {view === "people" && admin ? (
                    <Button
                      onClick={() => setEditor({ kind: "user" })}
                      className="action"
                    >
                      <Plus />
                      Adicionar colaborador
                    </Button>
                  ) : view === "profile" ? (
                    <Button
                      onClick={() =>
                        setEditor({ kind: "profile", data: data.me })
                      }
                      variant="outline"
                      className="action"
                    >
                      <Pencil />
                      Configurar meu acesso
                    </Button>
                  ) : (
                    view !== "settings" &&
                    !["orders", "order-history", "clients", "vehicles", "library", "equipment"].includes(view) &&
                    view !== "register" && (
                      <Button onClick={() => view === 'entries' ? setEditor({ kind: 'entry' }) : go("register")} className="action">
                        <Plus />
                        Registrar ponto
                      </Button>
                    )
                  )}
                </div>
              </div>
              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-lg bg-red-50 text-red-700 p-4"
                >
                  {error}
                </div>
              )}
              {["library", "equipment"].includes(view) && <TechnicalLibrary key={view} admin={admin} demo={demo} initialTab={view === 'equipment' ? 'models' : 'documents'} />}
              <ServiceOrders
                key={data.me.id + String(demo) + ordersKey}
                me={data.me}
                view={view}
                onNavigate={go}
                demo={demo}
                blocked={!!editor}
                onPoint={async () => {
                  await reload();
                  go("register");
                }}
                onRegister={order => setEditor({kind:'entry', order: {id:order.id, date: new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(order.starts_at)), company:order.client_name, service:order.title}})}
              />
              {[
                "dashboard",
                "insights",
                "entries",
                "reports",
                "profile",
              ].includes(view) && (
                <div className="filterbar mb-6">
                  <label>
                    Período
                    <input
                      aria-label="Mês"
                      type="month"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) {
                          setMonth(e.target.value);
                          setPeriod("month");
                        }
                      }}
                    />
                  </label>
                  {admin && !["profile", "insights", "dashboard"].includes(view) && (
                    <label className="min-w-52">
                      Colaborador
                      <Pick
                        label="Filtrar colaborador"
                        value={user}
                        onChange={setUser}
                        items={[
                          { value: "all", label: "Toda a equipe" },
                          ...data.users.map((u) => ({
                            value: u.id,
                            label: u.name,
                          })),
                        ]}
                      />
                    </label>
                  )}
                  {["entries", "reports"].includes(view) && (
                    <>
                      <label className="min-w-40">
                        Intervalo
                        <Pick
                          label="Intervalo do relatório"
                          value={period}
                          onChange={setPeriod}
                          items={[
                            { value: "month", label: "Mês selecionado" },
                            { value: "week", label: "Esta semana" },
                            { value: "custom", label: "Personalizado" },
                          ]}
                        />
                      </label>
                      {period === "custom" && (
                        <>
                          <label>
                            De
                            <input
                              type="date"
                              value={customFrom}
                              onChange={(e) => setCustomFrom(e.target.value)}
                            />
                          </label>
                          <label>
                            Até
                            <input
                              type="date"
                              value={customTo}
                              onChange={(e) => setCustomTo(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                      <label className="min-w-36">
                        Status
                        <Pick
                          label="Filtrar status"
                          value={status}
                          onChange={setStatus}
                          items={[
                            "all",
                            "Pendente",
                            "Aprovado",
                            "Revisado",
                          ].map((s) => ({
                            value: s,
                            label: s === "all" ? "Todos" : s,
                          }))}
                        />
                      </label>
                      <label className="min-w-36">
                        Tipo de dia
                        <Pick
                          label="Filtrar tipo de dia"
                          value={day}
                          onChange={setDay}
                          items={[
                            "all",
                            "Dia útil",
                            "Sábado",
                            "Domingo",
                            "Feriado",
                          ].map((s) => ({
                            value: s,
                            label: s === "all" ? "Todos" : s,
                          }))}
                        />
                      </label>
                      <label className="flex-1 min-w-44">
                        Buscar marcação
                        <input
                          placeholder="Buscar por data, empresa ou serviço"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {view === "insights" && (
                <PersonalInsights
                  key={month}
                  state={data}
                  rows={all}
                  month={month}
                  onHistory={() => {
                    setUser(data.me.id);
                    go("entries");
                  }}
                  onClock={() => go("register")}
                />
              )}
              {view === "dashboard" && admin && (
                <Dashboard
                  rows={all.filter(
                    (e) => e.date >= bounds.from && e.date <= bounds.to,
                  )}
                  allRows={all}
                  previous={all.filter(
                    (e) => e.date >= bounds.previous && e.date < bounds.from,
                  )}
                  state={data}
                  month={month}
                  demo={demo}
                  busy={busy}
                  onAction={centerAction}
                  onApprove={(e) => void updateStatus(e, "Aprovado")}
                  onEdit={(e) => setEditor({ kind: "entry", data: e })}
                />
              )}
              {view === "entries" && (
                <>
                  {period === "month" && (
                    <MonthClosing
                      state={data}
                      month={month}
                      userId={user}
                      entries={data.entries}
                      demo={demo}
                      onChanged={reload}
                    />
                  )}
                  <div className="panel overflow-hidden">
                    <div className="px-6 py-5 flex flex-wrap gap-4 justify-between items-center">
                      <h2>
                        {rows.length}{" "}
                        {rows.length === 1 ? "lançamento encontrado" : "lançamentos encontrados"}
                      </h2>
                      <Button
                        disabled={exporting || !rows.length}
                        variant="outline"
                        className="action"
                        onClick={() => void exportFile("csv")}
                      >
                        <Download size={16} />
                        Exportar CSV
                      </Button>
                    </div>
                    {entryTable()}
                    <div className="border-t p-4 flex flex-wrap justify-between gap-3 items-center text-sm">
                      <span className="muted">
                        Página {page} de{" "}
                        {Math.max(1, Math.ceil(rows.length / 15))} ·{" "}
                        {duration(t.worked)} trabalhadas
                      </span>
                      <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                          <PaginationItem>
                            <Button
                              variant="outline"
                              size="icon"
                              className="action"
                              aria-label="Página anterior"
                              disabled={page <= 1}
                              onClick={() => setPage((p) => p - 1)}
                            >
                              <ChevronLeft />
                            </Button>
                          </PaginationItem>
                          <PaginationItem>
                            <Button
                              variant="outline"
                              size="icon"
                              className="action"
                              aria-label="Próxima página"
                              disabled={page >= Math.ceil(rows.length / 15)}
                              onClick={() => setPage((p) => p + 1)}
                            >
                              <ChevronRight />
                            </Button>
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </div>
                  {rows.some((e) => e.worked > 840) && (
                    <p className="mt-4 text-sm text-amber-800 flex gap-2">
                      <AlertCircle size={18} />
                      Há jornadas acima de 14h neste período. Revise os horários
                      e intervalos.
                    </p>
                  )}
                </>
              )}
              {view === "reports" && (
                <>
                  <div className="grid sm:grid-cols-3 gap-5 mb-6">
                    {[
                      ["Total trabalhado", duration(t.worked)],
                      ["Horas extras", duration(t.extra)],
                      [
                        "Extras estimadas",
                        money(t.amount, data.settings.currency),
                      ],
                    ].map(([label, value]) => (
                      <div className="panel metric" key={label}>
                        <p className="muted text-sm">{label}</p>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="panel p-6">
                    <div className="flex flex-wrap gap-4 items-start justify-between">
                      <div>
                        <h2>
                          {admin
                            ? "Relatório do período"
                            : "Meu relatório mensal"}
                        </h2>
                        <p className="muted text-sm mt-2">
                          {range.from.split("-").reverse().join("/")} a{" "}
                          {range.to.split("-").reverse().join("/")} ·{" "}
                          {rows.length} serviços
                        </p>
                        <p className="muted text-sm mt-1">
                          {admin
                            ? "Exportações respeitam os filtros e as permissões de acesso."
                            : "Aqui aparecem somente os seus pontos. Baixe em PDF, Excel ou CSV."}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {(["pdf", "xlsx", "csv"] as const).map((f) => (
                          <Button
                            key={f}
                            className="action"
                            variant="outline"
                            disabled={exporting || !rows.length}
                            onClick={() => void exportFile(f)}
                          >
                            <Download size={16} />
                            {f === "xlsx" ? "Excel" : f.toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-7">
                      {admin ? (
                        <Tabs defaultValue="people">
                          <TabsList className="h-auto flex-wrap">
                            <TabsTrigger className="action" value="people">
                              Por colaborador
                            </TabsTrigger>
                            <TabsTrigger className="action" value="finance">
                              Financeiro
                            </TabsTrigger>
                          </TabsList>
                          {(["people", "finance"] as const).map((mode) => (
                            <TabsContent key={mode} value={mode}>
                              <ReportGroups
                                rows={rows}
                                data={data}
                                mode={mode}
                              />
                            </TabsContent>
                          ))}
                        </Tabs>
                      ) : (
                        <div className="overflow-hidden rounded-xl border">
                          <EntriesTable
                            rows={rows}
                            state={data}
                            onEdit={(entry) =>
                              setEditor({ kind: "entry", data: entry })
                            }
                            onDelete={setDeleting}
                            onStatus={updateStatus}
                            compact
                            busy={busy}
                          />
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === "register" && (
                <ManualPoints
                  state={data}
                  demo={demo}
                  onChanged={reload}
                  onSummary={() => go("insights")}
                  onProfile={() =>
                    setEditor({ kind: "profile", data: data.me })
                  }
                  onManual={() => setEditor({ kind: "entry" })}
                  onHistory={() => go('entries')}
                />
              )}
              {view === 'profile' && <PushSettings key={data.me.id} userId={data.me.id} demo={demo} admin={admin}/>}
              {view === "people" &&
                (admin ? (
                  <>
                    <div className="flex items-center gap-2 text-sm muted mb-6">
                      <Users size={18} />
                      {data.users.length} pessoas cadastradas · adicione novos
                      colaboradores quando a equipe crescer
                    </div>
                    <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5">
                      {data.users.map((u) => {
                        const ut = totals(
                          all.filter(
                            (e) =>
                              e.user_id === u.id &&
                              e.date >= bounds.from &&
                              e.date <= bounds.to,
                          ),
                        );
                        return (
                          <section className="panel p-6" key={u.id}>
                            <div className="flex justify-between gap-3">
                              <span className="avatar size-14! text-lg!">
                                {initials(u.name)}
                              </span>
                              <Button
                                className="action"
                                size="icon"
                                variant="ghost"
                                aria-label={"Editar " + u.name}
                                onClick={() =>
                                  setEditor({ kind: "user", data: u })
                                }
                              >
                                <Pencil size={18} />
                              </Button>
                            </div>
                            <h2 className="text-lg mt-4">{u.name}</h2>
                            <p className="muted text-sm mt-1">
                              {u.job || "Cargo não informado"}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <span className="badge">
                                {u.role === "coordinator"
                                  ? "Coordenador"
                                  : "Colaborador"}
                              </span>
                              <span
                                className={
                                  "badge " + (u.active ? "approved" : "pending")
                                }
                              >
                                {u.active ? "Ativo" : "Inativo"}
                              </span>
                            </div>
                            <p className="muted text-sm mt-5 break-all flex gap-2">
                              <Fingerprint size={16} className="shrink-0" />
                              Código: {u.access_code}
                            </p>
                            <div className="border-t mt-5 pt-5 grid grid-cols-2 gap-4">
                              <div>
                                <p className="muted text-xs">VALOR-HORA</p>
                                <b className="block mt-1">
                                  {money(
                                    Number(u.hourly_rate),
                                    data.settings.currency,
                                  )}
                                </b>
                              </div>
                              <div>
                                <p className="muted text-xs">EXTRAS NO MÊS</p>
                                <b className="block mt-1 text-amber-700">
                                  {duration(ut.extra)}
                                </b>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 mt-5">
                              <Button
                                className="action"
                                variant="outline"
                                onClick={() => {
                                  setUser(u.id);
                                  go("entries");
                                }}
                              >
                                Ver histórico <ArrowRight size={16} />
                              </Button>
                              <Button
                                className="action"
                                variant="outline"
                                onClick={() =>
                                  setEditor(
                                    u.id === data.me.id
                                      ? { kind: "profile", data: u }
                                      : { kind: "user", data: u },
                                  )
                                }
                              >
                                <KeyRound size={16} /> Trocar PIN
                              </Button>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                    <p className="muted text-sm mt-6">
                      Não há limite de colaboradores. Para redefinir um acesso,
                      use “Trocar PIN” no cartão da pessoa. Ela será
                      desconectada dos outros aparelhos e entrará novamente com
                      o novo PIN.
                    </p>
                  </>
                ) : (
                  <Blank
                    title="Acesso restrito"
                    description="Somente o coordenador pode gerenciar a equipe."
                  />
                ))}
              {view === "settings" &&
                (admin ? (
                  <SettingsForm
                    key={JSON.stringify(data.settings)}
                    rules={data.settings}
                    onSaved={afterSave}
                    demo={demo}
                  />
                ) : (
                  <Blank
                    title="Acesso restrito"
                    description="Somente o coordenador pode alterar as regras."
                  />
                ))}
              {view === "profile" && (
                <Profile
                  data={data}
                  rows={all.filter(
                    (e) =>
                      e.user_id === data.me.id &&
                      e.date >= bounds.from &&
                      e.date <= bounds.to,
                  )}
                  month={month}
                  onRegister={() => go("register")}
                  onEditAccess={() =>
                    setEditor({ kind: "profile", data: data.me })
                  }
                />
              )}
            </>
          )}
          <footer className="mt-10 pt-5 border-t flex flex-wrap gap-2 justify-between text-xs muted">
            <span>HoraCerta · Cada hora conta.</span>
            <span>Jornada em horário de Brasília · Valores estimados</span>
          </footer>
        </div>
      </main>
      {data && (
        <nav
          aria-label="Navegação rápida"
          className="mobile-tabs md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-white/95 backdrop-blur flex justify-around px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"
        >
          {(admin
            ? [
                { key: "dashboard", label: "Painel", Icon: LayoutDashboard },
                { key: "orders", label: "OS", Icon: ClipboardList },
                { key: "entries", label: "Pontos", Icon: ListChecks },
                { key: "register", label: "Meu ponto", Icon: Timer },
                { key: "people", label: "Equipe", Icon: Users },
              ]
            : [
                { key: "register", label: "Ponto", Icon: Timer },
                { key: "insights", label: "Resumo", Icon: FileBarChart2 },
                { key: "orders", label: "Minhas OS", Icon: ClipboardList },
                { key: "reports", label: "Relatório", Icon: Download },
                { key: "profile", label: "Meu acesso", Icon: UserRound },
              ]
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => go(key)}
              aria-current={view === key ? "page" : undefined}
              className={
                "flex-1 min-h-12 flex flex-col items-center justify-center gap-1 text-xs rounded-lg " +
                (view === key
                  ? "text-blue-700 bg-blue-50 font-semibold"
                  : "text-slate-500")
              }
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
      )}
      {data && editor && (
        <EditDialog
          key={editor.kind + (editor.data?.id || "new")}
          editor={editor}
          state={data}
          demo={demo}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && !busy && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele deixará de aparecer nos relatórios. O histórico da alteração
              será preservado para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-red-600"
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {busy ? "Excluindo…" : "Excluir lançamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
/** Troca obrigatória do PIN antes de qualquer acesso a dados. Não há como adiar. */
function PinChangeGate({
  me,
  onSignOut,
}: {
  me: Person;
  onSignOut: () => Promise<void>;
}) {
  const [pin, setPin] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{6}$/.test(pin)) return setError("O PIN deve ter exatamente 6 números.");
    if (pin !== confirm) return setError("A confirmação não confere com o novo PIN.");
    setBusy(true);
    setError("");
    try {
      await api("/api/manage", {
        entity: "profile",
        data: { name: me.name, job: me.job || "", phone: me.phone || "", pin },
      });
      toast.success("PIN atualizado. Entre novamente com o novo PIN.");
      await onSignOut();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="pin-gate">
      <form className="panel" onSubmit={(e) => void submit(e)} aria-labelledby="pin-gate-title" noValidate>
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <KeyRound size={24} aria-hidden />
        </div>
        <h1 id="pin-gate-title" className="text-2xl!">Crie seu PIN pessoal</h1>
        <p className="muted mt-2 text-sm leading-relaxed">
          Olá, {me.name.split(" ")[0]}. Antes de acessar o HoraCerta, defina um PIN de 6 números que só você conhece.
          Depois de salvar, entre novamente com o novo PIN.
        </p>
        <div className="mt-6 grid gap-4">
          <label>
            Novo PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
              aria-invalid={!!error && !/^\d{6}$/.test(pin)}
              aria-describedby="pin-gate-help"
            />
          </label>
          <label>
            Confirme o novo PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{6}"
              maxLength={6}
              required
              value={confirm}
              onChange={(e) => setConfirm(digits(e.target.value))}
              aria-invalid={!!error && pin !== confirm}
              aria-describedby="pin-gate-help"
            />
          </label>
          <p id="pin-gate-help" className="muted text-xs">
            Use 6 números. Evite datas e sequências fáceis de adivinhar.
          </p>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <Button type="submit" className="action w-full" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
            {busy ? "Salvando…" : "Salvar novo PIN"}
          </Button>
          <Button type="button" variant="ghost" className="action w-full" disabled={busy} onClick={() => void onSignOut()}>
            <LogOut size={16} /> Sair
          </Button>
        </div>
      </form>
    </main>
  );
}
function ReportGroups({
  rows,
  data,
  mode,
}: {
  rows: ReturnType<typeof calculate>;
  data: State;
  mode: "people" | "clients" | "services" | "finance";
}) {
  const keys =
    mode === "clients"
      ? data.clients.map((c) => ({ id: c.id, name: c.name }))
      : mode === "services"
        ? [...new Set(rows.map((e) => e.service_type || "Não informado"))].map(
            (s) => ({ id: s, name: s }),
          )
        : data.users;
  return (
    <div className="mt-5 space-y-1">
      {keys.map((k) => {
        const matches = rows.filter((e) =>
            mode === "clients"
              ? e.client_id === k.id
              : mode === "services"
                ? (e.service_type || "Não informado") === k.id
                : e.user_id === k.id,
          ),
          t = totals(matches),
          approved = totals(matches.filter((e) => e.status === "Aprovado"));
        return (
          <div
            className="grid sm:grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 py-4 border-b items-center text-sm"
            key={k.id}
          >
            <b>{k.name}</b>
            <span className="muted">{duration(t.worked)} trabalhadas</span>
            <span className="text-amber-700">{duration(t.extra)} extras</span>
            <div>
              <b>{money(t.amount, data.settings.currency)}</b>
              {mode === "finance" && (
                <p className="muted text-xs mt-1">
                  {money(approved.amount, data.settings.currency)} aprovados
                </p>
              )}
            </div>
          </div>
        );
      })}
      {!keys.length && <Blank />}
    </div>
  );
}
function Profile({
  data,
  rows,
  month,
  onRegister,
  onEditAccess,
}: {
  data: State;
  rows: ReturnType<typeof calculate>;
  month: string;
  onRegister: () => void;
  onEditAccess: () => void;
}) {
  const t = totals(rows),
    [year, m] = month.split("-").map(Number),
    totalDays = new Date(year, m, 0).getDate(),
    offset = (new Date(year, m - 1, 1).getDay() + 6) % 7,
    worked = new Set(
      rows.filter((e) => e.end).map((e) => Number(e.date.slice(8))),
    );
  return (
    <>
      {data.me.pin_change_required && (
        <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <KeyRound size={20} />
            </span>
            <div>
              <b>Seu PIN ainda é temporário</b>
              <p className="mt-1 text-sm text-amber-900">
                Crie um PIN pessoal de 6 números para proteger seu acesso.
              </p>
            </div>
          </div>
          <Button className="action shrink-0" onClick={onEditAccess}>
            Trocar meu PIN
          </Button>
        </section>
      )}
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6">
        <section className="panel p-7">
          <div className="flex gap-4 items-center">
            <span className="avatar size-16! text-xl!">
              {initials(data.me.name)}
            </span>
            <div>
              <h2 className="text-xl">{data.me.name}</h2>
              <p className="muted mt-1">
                {data.me.job || "Integrante da equipe"}
              </p>
              <p className="muted text-sm">
                Código de acesso: {data.me.access_code}
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 mt-7 border-t pt-6">
            {[
              ["Trabalhadas", duration(t.worked)],
              ["Horas extras", duration(t.extra)],
              ["Valor estimado", money(t.amount, data.settings.currency)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="muted text-sm">{k}</p>
                <b className="text-xl block mt-2">{v}</b>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <b>Meu salário e valor-hora</b>
            <p className="mt-2 text-sm text-slate-700">
              {data.me.monthly_salary != null
                ? `${money(Number(data.me.monthly_salary), data.settings.currency)} por mês ÷ ${Number(data.me.monthly_hours).toLocaleString('pt-BR')} horas = ${money(Number(data.me.hourly_rate), data.settings.currency)} por hora.`
                : `Salário ainda não informado. Valor-hora atual mantido: ${money(Number(data.me.hourly_rate), data.settings.currency)}.`}
            </p>
            <Button type="button" variant="outline" className="action mt-3" onClick={onEditAccess}><Pencil />Configurar meu salário</Button>
          </div>
          <Button className="action mt-7" onClick={onRegister}>
            <Plus />
            Registrar ponto
          </Button>
        </section>
        <section className="panel p-6">
          <h2 className="mb-4">
            Dias trabalhados · {month.split("-").reverse().join("/")}
          </h2>
          <div className="grid-cal">
            {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
              <span className="muted" key={"d" + i}>
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: totalDays }, (_, i) => (
              <span key={i} className={worked.has(i + 1) ? "worked" : ""}>
                {i + 1}
              </span>
            ))}
          </div>
        </section>
      </div>
      <section className="panel mt-6 p-6">
        <h2>Últimos serviços</h2>
        {rows.length ? (
          [...rows]
            .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
            .slice(0, 7)
            .map((e) => (
              <div
                key={e.id}
                className="border-b py-4 flex gap-3 justify-between"
              >
                <div>
                  <p className="font-medium text-sm">{e.service}</p>
                  <p className="muted text-xs mt-1">
                    {e.date.split("-").reverse().join("/")} · {e.start.slice(0, 5)} —{" "}
                    {e.end?.slice(0, 5) || "Em aberto"}
                  </p>
                </div>
                <div className="text-right">
                  <b className="text-sm">{duration(e.worked)}</b>
                  <div className="mt-1">
                    <Status value={e.status} />
                  </div>
                </div>
              </div>
            ))
        ) : (
          <Blank />
        )}
      </section>
    </>
  );
}
