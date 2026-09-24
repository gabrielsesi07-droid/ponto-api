"use client";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  Clock3,
  LayoutDashboard,
  Timer,
  ListChecks,
  FileBarChart2,
  Users,
  MapPin,
  Settings,
  Plus,
  ArrowUpRight,
  UserRound,
  LogOut,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Search,
  Download,
  Mail,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  Pencil,
  Building2,
  CheckCheck,
  Play,
  Eye,
  ArrowRight,
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
import { Skeleton } from "@/components/ui/skeleton";
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
import { QuickClock } from "./quick-clock";
import { QuickLogin } from "./quick-login";
import { PersonalInsights } from "./personal-insights";
import { Dashboard } from "./dashboard";
import { EntriesTable } from "./entries-table";
import { demoState } from "@/lib/demo";
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
    label: "Visão da equipe",
    icon: LayoutDashboard,
    admin: true,
  },
  { key: "register", label: "Meu ponto", icon: Timer },
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
    [ready, setReady] = useState(false);
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
      const s = await api<Session>("/api/session");
      const result = s.me
        ? await api<State>("/api/state?from=" + fetchFrom + "&to=" + fetchTo)
        : null;
      if (version !== requestVersion.current) return;
      setSession(s);
      setData(result);
    } catch (e) {
      if (version === requestVersion.current) {
        setError((e as Error).message);
        setData(null);
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [demo, fetchFrom, fetchTo]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setDemo(p.get("demo") === "1");
    setReady(true);
    const v = p.get("view");
    if (nav.some((n) => n.key === v)) setView(v!);
    const pop = () => {
      const q = new URLSearchParams(window.location.search);
      setView(q.get("view") || "register");
      setDemo(q.get("demo") === "1");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (ready) void reload();
  }, [reload, ready]);
  useEffect(
    () => setPage(1),
    [user, status, day, search, month, period, customFrom, customTo],
  );
  useEffect(() => {
    if (
      data &&
      nav.find((n) => n.key === view)?.admin &&
      data.me.role !== "coordinator"
    )
      setView("register");
  }, [data, view]);
  const go = useCallback((v: string) => {
    setView(v);
    if (v === "register") setMonth(today().slice(0, 7));
    setStatus("all");
    setDay("all");
    setSearch("");
    setPeriod("month");
    setPage(1);
    const p = new URLSearchParams(window.location.search);
    p.set("view", v);
    window.history.pushState({}, "", "?" + p);
  }, []);
  function changeDemo(next: boolean) {
    setDemo(next);
    setUser('all');
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
              [e.date, e.date.split("-").reverse().join("/"), e.notes]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)),
    [all, range.from, range.to, user, status, day, search, data],
  );
  const prev = all.filter(
      (e) =>
        e.date >= bounds.previous &&
        e.date < bounds.from &&
        (user === "all" || e.user_id === user),
    ),
    t = totals(rows),
    admin = data?.me.role === "coordinator";
  const title = nav.find((n) => n.key === view)?.label || "Dashboard";
  async function afterSave() {
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
            <span className="text-sm font-medium hidden min-[400px]:inline">{title}</span>
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
                onClick={async () => {
                  try {
                    await api("/api/login", {}, "DELETE");
                    setData(null);
                    setUser('all');
                    go("register");
                    await reload();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
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
          {loading && !data ? (
            <>
              <div className="flex justify-between mb-8">
                <Skeleton className="h-12 w-60" />
                <Skeleton className="h-12 w-40" />
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-44" />
                ))}
              </div>
              <Skeleton className="h-80 mt-6" />
              <p className="muted text-sm mt-4" role="status">
                Carregando seu espaço…
              </p>
            </>
          ) : !data ? (
            <Access
              session={session}
              error={error}
              reload={reload}
              demo={() => changeDemo(true)}
            />
          ) : (
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
                      ? "Cada hora conta. Acompanhe o que importa."
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
                                    ? "Inicie, pause e encerre seu serviço com um toque."
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
                      disabled={data.users.length >= 4}
                    >
                      <Plus />
                      Adicionar colaborador
                    </Button>
                  ) : view === "clients" && admin ? (
                    <Button
                      onClick={() => setEditor({ kind: "client" })}
                      className="action"
                    >
                      <Plus />
                      Novo cliente
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
                    view !== "register" && (
                      <Button onClick={() => go("register")} className="action">
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
                  {admin && !["profile", "insights"].includes(view) && (
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
                          placeholder="Buscar por data ou observação"
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
                <>
                  <Dashboard
                    rows={all.filter(
                      (e) =>
                        e.date >= bounds.from &&
                        e.date <= bounds.to &&
                        (user === "all" || e.user_id === user),
                    )}
                    previous={prev}
                    state={data}
                    onRegister={() => go("register")}
                    onEntries={() => go("entries")}
                  />
                  <section className="panel mt-6 overflow-hidden">
                    <div className="p-6 flex justify-between items-center">
                      <div>
                        <h2>Últimos lançamentos</h2>
                        <p className="muted text-sm mt-1">
                          Os registros mais recentes da equipe
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => go("entries")}
                        className="text-blue-600 action"
                      >
                        Ver todos <ArrowUpRight size={16} />
                      </Button>
                    </div>
                    {entryTable(true)}
                  </section>
                </>
              )}
              {view === "entries" && (
                <>
                  <div className="panel overflow-hidden">
                    <div className="px-6 py-5 flex flex-wrap gap-4 justify-between items-center">
                      <h2>{rows.length} lançamentos encontrados</h2>
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
                        <h2>Relatório do período</h2>
                        <p className="muted text-sm mt-2">
                          {range.from.split("-").reverse().join("/")} a{" "}
                          {range.to.split("-").reverse().join("/")} ·{" "}
                          {rows.length} serviços
                        </p>
                        <p className="muted text-sm mt-1">
                          Exportações respeitam os filtros e as permissões de
                          acesso.
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
                            <ReportGroups rows={rows} data={data} mode={mode} />
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  </section>
                </>
              )}
              {view === "register" && (
                <QuickClock
                  state={data}
                  demo={demo}
                  onChanged={reload}
                  onSummary={() => go("insights")}
                  onProfile={() =>
                    setEditor({ kind: "profile", data: data.me })
                  }
                  onManual={() => setEditor({ kind: "entry" })}
                />
              )}
              {view === "people" &&
                (admin ? (
                  <>
                    <div className="flex items-center gap-2 text-sm muted mb-6">
                      <Users size={18} />
                      {data.users.length} de 4 vagas utilizadas · 1 coordenador
                      e 3 colaboradores
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
                              <Mail size={16} className="shrink-0" />
                              Login:{" "}
                              {u.username || u.name.split(" ")[0].toLowerCase()}
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
                            <Button
                              className="mt-5 w-full action"
                              variant="outline"
                              onClick={() => {
                                setUser(u.id);
                                go("entries");
                              }}
                            >
                              Ver histórico <ArrowRight size={16} />
                            </Button>
                          </section>
                        );
                      })}
                    </div>
                    <p className="muted text-sm mt-6">
                      Cadastre um login e PIN inicial para cada colaborador.
                      Cada pessoa configura o próprio valor-hora em Meu acesso.
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
          {[
            { key: "register", label: "Ponto", Icon: Timer },
            { key: "insights", label: "Resumo", Icon: FileBarChart2 },
            { key: "entries", label: "Histórico", Icon: ListChecks },
            { key: "profile", label: "Meu acesso", Icon: UserRound },
          ].map(({ key, label, Icon }) => (
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
function Access({
  session,
  error,
  reload,
  demo,
}: {
  session: Session | null;
  error: string;
  reload: () => Promise<void>;
  demo: () => void;
}) {
  return (
    <QuickLogin
      setup={!!session?.setup}
      error={error}
      reload={reload}
      demo={demo}
    />
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
}: {
  data: State;
  rows: ReturnType<typeof calculate>;
  month: string;
  onRegister: () => void;
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
                Login:{" "}
                {data.me.username || data.me.name.split(" ")[0].toLowerCase()}
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
          rows
            .slice(-7)
            .reverse()
            .map((e) => (
              <div
                key={e.id}
                className="border-b py-4 flex gap-3 justify-between"
              >
                <div>
                  <p className="font-medium text-sm">{e.service}</p>
                  <p className="muted text-xs mt-1">
                    {e.date} · {e.start.slice(0, 5)} —{" "}
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
