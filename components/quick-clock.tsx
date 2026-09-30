"use client";
import { useEffect, useState, useMemo, type FormEvent } from "react";
import {
  Play,
  Pause,
  Square,
  Clock3,
  UserRound,
  Wallet,
  ArrowRight,
  Pencil,
  LoaderCircle,
  Building2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "./editors";
import { PointOrderPicker } from './point-order-picker';
import { pointOrderNumber } from '@/lib/point-orders';
import {
  today,
  calculate,
  totals,
  duration,
  money,
  type State,
} from "@/lib/domain";

type StartForm = {
  order_id: string;
  order_number?: number;
  date: string;
  time: string;
  company: string;
  service: string;
  notes: string;
};

function startDefaults(): StartForm {
  return {
    order_id: '',
    date: today(),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
    company: '',
    service: '',
    notes: "",
  };
}

function earliestStartDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 7 * 24 * 60 * 60_000));
}

export function QuickClock({
  state,
  demo,
  onChanged,
  onProfile,
  onManual,
  onSummary,
}: {
  state: State;
  demo: boolean;
  onChanged: () => Promise<void>;
  onProfile: () => void;
  onManual: () => void;
  onSummary: () => void;
}) {
  const [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [demoTimer, setDemoTimer] = useState<State["timer"]>(null),
    [startOpen, setStartOpen] = useState(false),
    [startError, setStartError] = useState(''),
    [startForm, setStartForm] = useState<StartForm>(() => startDefaults());
  const timer = demo ? demoTimer : state.timer,
    paused = !!timer?.paused_at;
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const day = today();
  const t = useMemo(
    () =>
      totals(
        calculate(state.entries).filter(
          (e) => e.user_id === state.me.id && e.date === day,
        ),
      ),
    [state.entries, state.me.id, day],
  );
  const pausedMs =
    timer?.pauses.reduce(
      (n, p) => n + new Date(p.end).getTime() - new Date(p.start).getTime(),
      0,
    ) || 0;
  const elapsed = timer
    ? Math.max(
        0,
        (paused ? new Date(timer.paused_at!).getTime() : now) -
          new Date(timer.started_at).getTime() -
          pausedMs,
      )
    : 0;
  const dayStart = new Date(day + "T00:00:00-03:00").getTime();
  const timerStart = timer
    ? Math.max(dayStart, new Date(timer.started_at).getTime())
    : now;
  const timerEnd = paused ? new Date(timer!.paused_at!).getTime() : now;
  const dayPauses =
    timer?.pauses.reduce(
      (n, p) =>
        n +
        Math.max(
          0,
          Math.min(timerEnd, new Date(p.end).getTime()) -
            Math.max(timerStart, new Date(p.start).getTime()),
        ),
      0,
    ) || 0;
  const todayElapsed = timer
    ? Math.max(0, timerEnd - timerStart - dayPauses)
    : 0;
  const seconds = Math.floor(elapsed / 1000),
    label = [
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  function openStart() {
    setStartForm(startDefaults());
    setStartError('');
    setStartOpen(true);
  }
  async function action(
    action: "start" | "pause" | "resume" | "stop",
    details?: StartForm,
  ) {
    setBusy(true);
    try {
      if (demo) {
        const at = details
          ? new Date(`${details.date}T${details.time}:00-03:00`).toISOString()
          : new Date().toISOString();
        if (action === "start")
          setDemoTimer({
            order_id: details?.order_id,
            order_number: details?.order_number,
            user_id: state.me.id,
            started_at: at,
            paused_at: null,
            pauses: [],
            company: details?.company || "Empresa de demonstração",
            service: details?.service || "Serviço técnico",
            notes: details?.notes || "",
            rate: state.me.hourly_rate,
            rules: state.settings,
          });
        if (action === "pause")
          setDemoTimer((x) => (x ? { ...x, paused_at: at } : x));
        if (action === "resume")
          setDemoTimer((x) =>
            x
              ? {
                  ...x,
                  paused_at: null,
                  pauses: [...x.pauses, { start: x.paused_at!, end: at }],
                }
              : x,
          );
        if (action === "stop") setDemoTimer(null);
        toast.info(
          action === "stop"
            ? "Serviço encerrado na demonstração. Nenhum dado foi salvo."
            : "Demonstração: marcação simulada.",
        );
      } else {
        await api(
          "/api/clock",
          action === "start" && details
            ? {
                action,
                order_id: details.order_id,
                started_at: `${details.date}T${details.time}`,
                notes: details.notes,
              }
            : { action },
        );
        await onChanged();
        toast.success(
          {
            start: "Serviço iniciado.",
            pause: "Pausa registrada.",
            resume: "Serviço retomado.",
            stop: "Serviço encerrado e ponto salvo.",
          }[action],
        );
      }
      return true;
    } catch (e) {
      if (action === 'start') setStartError((e as Error).message);
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submitStart(ev: FormEvent) {
    ev.preventDefault();
    if (!startForm.order_id) { setStartError('Selecione a OS deste trabalho.'); return; }
    setStartError('');
    if (!(await action("start", startForm))) return;
    setStartOpen(false);
  }
  return (
    <div className="max-w-4xl mx-auto">
      <section className="panel p-7 sm:p-10 text-center">
        <div className="flex justify-center gap-2 items-center text-sm muted">
          <UserRound size={17} />
          <span>
            Conectado como <b className="text-slate-800">{state.me.name}</b>
          </span>
        </div>
        <span
          className={
            "inline-flex items-center gap-2 mt-6 rounded-full px-4 py-2 text-sm font-medium " +
            (timer
              ? paused
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600")
          }
        >
          {timer ? (
            <span
              className={
                "size-2 rounded-full " +
                (paused ? "bg-amber-500" : "bg-emerald-500")
              }
            />
          ) : (
            <Clock3 size={16} />
          )}{" "}
          {timer
            ? paused
              ? "Serviço em pausa"
              : "Em serviço"
            : "Fora de serviço"}
        </span>
        <div className="num text-[clamp(3rem,9vw,5.5rem)] font-semibold tracking-[-.045em] mt-5 leading-tight">
          {timer ? label : "00:00:00"}
        </div>
        <p className="muted text-sm mt-2">
          {timer
            ? "Tempo líquido deste serviço"
            : "Pronto para começar seu próximo serviço?"}
        </p>
        {timer && (
          <div className="mx-auto mt-5 grid max-w-xl gap-2 rounded-xl border bg-slate-50 px-4 py-3 text-left text-sm sm:grid-cols-2">
            <p className="sm:col-span-2 font-semibold text-blue-900">{timer.order_number ? `Ponto vinculado à ${pointOrderNumber(timer.order_number)}` : 'Serviço antigo sem OS · encerre normalmente para preservar suas horas.'}</p>
            <span className="flex items-center gap-2">
              <Building2 size={16} className="text-blue-600" />
              <span>
                <span className="muted block text-xs">EMPRESA</span>
                <b>{timer.company || "Não informada"}</b>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-600" />
              <span>
                <span className="muted block text-xs">SERVIÇO</span>
                <b>{timer.service || "Serviço técnico"}</b>
              </span>
            </span>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {!timer ? (
            <Button
              disabled={busy}
              className="min-h-16! px-9 text-lg rounded-xl"
              onClick={openStart}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Play size={22} />
              )}
              Iniciar serviço
            </Button>
          ) : (
            <>
              <Button
                disabled={busy}
                variant="outline"
                className="min-h-14! px-6 rounded-xl"
                onClick={() => void action(paused ? "resume" : "pause")}
              >
                {paused ? <Play /> : <Pause />}
                {paused ? "Retomar" : "Pausar"}
              </Button>
              <Button
                disabled={busy}
                className="min-h-14! px-6 rounded-xl bg-[#142b42]"
                onClick={() => void action("stop")}
              >
                <Square size={19} />
                Encerrar serviço
              </Button>
            </>
          )}
        </div>
        <p className="muted text-xs mt-5">
          Todo ponto pertence a uma OS da sua equipe. Cliente e serviço vêm da OS;
          data e hora podem ser ajustadas antes de iniciar.
        </p>
        {timer && !demo && (
          <p className="muted text-xs mt-3">
            Você pode fechar a página: o início e as pausas ficam salvos.
          </p>
        )}
      </section>
      <div className="grid sm:grid-cols-3 gap-4 mt-5">
        {[
          [
            "Em serviço hoje",
            duration(t.worked + Math.floor(todayElapsed / 60000)),
          ],
          ["Extras registradas hoje", duration(t.extra)],
          [
            "Meu valor-hora",
            money(Number(state.me.hourly_rate), state.settings.currency),
          ],
        ].map(([k, v]) => (
          <div key={k} className="panel p-5">
            <p className="text-sm muted">{k}</p>
            <b className="block text-2xl mt-2 num">{v}</b>
          </div>
        ))}
      </div>
      {state.me.monthly_salary == null && (
        <button
          className="mt-5 w-full rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-amber-900 text-sm flex items-center justify-between gap-3 text-left"
          onClick={onProfile}
        >
          <span>
            Informe seu salário mensal para calcular automaticamente o valor da sua hora.
          </span>
          <Pencil size={18} />
        </button>
      )}
      <button
        onClick={onSummary}
        className="mt-5 w-full rounded-xl bg-blue-50 border border-blue-100 px-5 py-5 text-left flex items-center justify-between gap-4"
      >
        <span>
          <b className="block text-blue-900">Como estão minhas horas extras?</b>
          <span className="block text-sm text-blue-800 mt-1">
            Veja gráficos, datas e comparativos em Meu resumo.
          </span>
        </span>
        <ArrowRight className="shrink-0 text-blue-600" size={22} />
      </button>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button
          className="action min-h-14 w-full justify-start rounded-xl border-slate-300 bg-white px-5 font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md"
          variant="outline"
          onClick={onManual}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Pencil size={17} />
          </span>
          <span>Esqueci de bater o ponto</span>
        </Button>
        <Button
          className="action min-h-14 w-full justify-start rounded-xl border-slate-300 bg-white px-5 font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md"
          variant="outline"
          onClick={onProfile}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Wallet size={17} />
          </span>
          <span>Configurar meu salário</span>
        </Button>
      </div>
      <p className="text-sm muted text-center mt-7 leading-relaxed">
        Este ponto registra apenas os serviços técnicos.
        <br />
        Continue usando o ponto da empresa no dia a dia.
      </p>
      <Dialog
        open={startOpen}
        onOpenChange={(open) => !busy && setStartOpen(open)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Iniciar serviço</DialogTitle>
            <DialogDescription>
              Selecione a OS do trabalho. Cliente e serviço serão preenchidos
              automaticamente. Confira a data e o horário de Brasília.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitStart} className="form-grid mt-2">
            <PointOrderPicker value={startForm.order_id} date={startForm.date} live demo={demo} enabled={startOpen} disabled={busy}
              onChange={order => setStartForm(form => ({...form, order_id:order?.id || '', order_number:order?.number, company:order?.client_name || '', service:order?.title || ''}))} />
            <label>
              Data
              <input
                type="date"
                required
                min={earliestStartDate()}
                max={today()}
                value={startForm.date}
                onChange={(e) =>
                  setStartForm((form) => ({ ...form, date: e.target.value, order_id:'', order_number:undefined, company:'', service:'' }))
                }
              />
            </label>
            <label>
              Hora de início
              <input
                type="time"
                required
                value={startForm.time}
                onChange={(e) =>
                  setStartForm((form) => ({ ...form, time: e.target.value }))
                }
              />
            </label>
            <label className="full">
              Empresa atendida
              <input
                readOnly
                placeholder="Preenchida pela OS selecionada"
                value={startForm.company}
              />
              <span className="muted mt-1 block text-xs">
                Cliente registrado na OS. Não é necessário digitar novamente.
              </span>
            </label>
            <label className="full">
              Serviço a realizar
              <input
                readOnly
                placeholder="Preenchido pela OS selecionada"
                value={startForm.service}
              />
            </label>
            <label className="full">
              Observação (opcional)
              <textarea
                maxLength={2000}
                placeholder="Detalhes importantes do atendimento"
                value={startForm.notes}
                onChange={(e) =>
                  setStartForm((form) => ({ ...form, notes: e.target.value }))
                }
              />
            </label>
            {startError && <p role="alert" className="full rounded-lg bg-red-50 p-3 text-sm text-red-800">{startError}</p>}
            <div className="full flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStartOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || !startForm.order_id}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
                Iniciar agora
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
