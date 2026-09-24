"use client";
import { useEffect, useState, useMemo } from "react";
import {
  Play,
  Pause,
  Square,
  Clock3,
  UserRound,
  Wallet,
  ArrowRight,
  Pencil,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "./editors";
import {
  today,
  calculate,
  totals,
  duration,
  money,
  type State,
} from "@/lib/domain";
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
    [demoTimer, setDemoTimer] = useState<State["timer"]>(null);
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
  async function action(action: "start" | "pause" | "resume" | "stop") {
    setBusy(true);
    try {
      if (demo) {
        const at = new Date().toISOString();
        if (action === "start")
          setDemoTimer({
            user_id: state.me.id,
            started_at: at,
            paused_at: null,
            pauses: [],
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
        await api("/api/clock", { action });
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
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
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
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {!timer ? (
            <Button
              disabled={busy}
              className="min-h-16! px-9 text-lg rounded-xl"
              onClick={() => void action("start")}
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
          Horário registrado automaticamente. Sem formulário e sem seleção de
          pessoa.
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
      {Number(state.me.hourly_rate) === 0 && (
        <button
          className="mt-5 w-full rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-amber-900 text-sm flex items-center justify-between gap-3 text-left"
          onClick={onProfile}
        >
          <span>
            Configure quanto vale sua hora para calcular o valor das extras.
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
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <Button className="action muted" variant="ghost" onClick={onManual}>
          <Pencil size={16} />
          Esqueci de bater o ponto
        </Button>
        <Button className="action muted" variant="ghost" onClick={onProfile}>
          <Wallet size={16} />
          Configurar minha hora
        </Button>
      </div>
      <p className="text-sm muted text-center mt-7 leading-relaxed">
        Este ponto registra apenas os serviços técnicos.
        <br />
        Continue usando o ponto da empresa no dia a dia.
      </p>
    </div>
  );
}
