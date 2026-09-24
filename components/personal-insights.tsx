"use client";
import { useState } from "react";
import {
  Clock3,
  Timer,
  Wallet,
  CalendarDays,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Blank, Status } from "./controls";
import {
  totals,
  duration,
  money,
  type State,
  type Calculated,
} from "@/lib/domain";

export function PersonalInsights({
  state,
  rows,
  month,
  onHistory,
  onClock,
}: {
  state: State;
  rows: Calculated[];
  month: string;
  onHistory: () => void;
  onClock: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const own = rows.filter((e) => e.user_id === state.me.id),
    current = own.filter((e) => e.date.startsWith(month)),
    t = totals(current);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    const key = d.toISOString().slice(0, 7);
    return {
      key,
      label: d
        .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
        .replace(".", ""),
      ...totals(own.filter((e) => e.date.startsWith(key))),
    };
  });
  const previous = months[4],
    difference = t.extra - previous.extra;
  const dates = [...new Set(current.map((e) => e.date))].sort().reverse();
  const daily = dates.map((date) => ({
    date,
    ...totals(current.filter((e) => e.date === date)),
  }));
  const extraDays = daily.filter((d) => d.extra > 0),
    shown = selectedDay
      ? current.filter((e) => e.date === selectedDay)
      : current.filter((e) => e.extra > 0);
  const lastDate = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const offset = (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7;
  const chart = Array.from({ length: lastDate }, (_, i) => {
    const d = daily.find((d) => Number(d.date.slice(8)) === i + 1);
    return { day: i + 1, hours: (d?.extra || 0) / 60 };
  });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        {[
          {
            label: "Minhas horas extras",
            value: duration(t.extra),
            note: extraDays.length + " dias com extras",
            Icon: Timer,
            color: "text-amber-700 bg-amber-50",
          },
          {
            label: "Valor das extras",
            value: money(t.amount, state.settings.currency),
            note: "Estimado · inclui pendências",
            Icon: Wallet,
            color: "text-emerald-700 bg-emerald-50",
          },
          {
            label: "Horas em serviço",
            value: duration(t.worked),
            note: dates.length + " dias registrados",
            Icon: Clock3,
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "Meu valor-hora",
            value: money(Number(state.me.hourly_rate), state.settings.currency),
            note: "Valor atual do seu perfil",
            Icon: CalendarDays,
            color: "text-violet-600 bg-violet-50",
          },
        ].map(({ label, value, note, Icon, color }) => (
          <section className="panel min-w-0 p-4 sm:p-6" key={label}>
            <span className={"inline-flex p-2 rounded-lg mb-3 " + color}>
              <Icon size={18} />
            </span>
            <p className="text-sm muted">{label}</p>
            <strong className="num text-xl sm:text-3xl block mt-2 break-words">
              {value}
            </strong>
            <p className="muted text-xs mt-2">{note}</p>
          </section>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5">
        <section className="panel min-w-0 p-5 sm:p-6">
          <h2>Quando fiz horas extras?</h2>
          <p className="muted text-sm mt-1">Horas extras em cada dia do mês</p>
          {t.extra > 0 ? (
            <div
              className="h-64 mt-5"
              role="img"
              aria-label={
                "Gráfico de horas extras por dia. Total: " + duration(t.extra)
              }
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 320, height: 256 }}
              >
                <BarChart
                  data={chart}
                  margin={{ left: -22, right: 0, top: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#e8edf5"
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    interval={5}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    unit="h"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    labelFormatter={(v) => "Dia " + v}
                    formatter={(v) => [duration(Number(v) * 60), "Extras"]}
                  />
                  <Bar
                    dataKey="hours"
                    fill="#3d73e5"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Blank
              title="Sem extras neste mês"
              description="As horas extras dos seus serviços aparecerão aqui."
            />
          )}
        </section>
        <section className="panel min-w-0 p-5 sm:p-6">
          <h2>Comparativo entre meses</h2>
          <p className="muted text-sm mt-1">
            Últimos seis meses · somente seus pontos
          </p>
          <div
            className="h-48 mt-5"
            role="img"
            aria-label="Comparação mensal de horas extras"
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 320, height: 192 }}
            >
              <BarChart
                data={months.map((m) => ({ ...m, hours: m.extra / 60 }))}
                margin={{ left: -22, right: 0, top: 5, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  unit="h"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  labelFormatter={(_, payload) =>
                    payload[0]?.payload?.key || ""
                  }
                  formatter={(v) => [duration(Number(v) * 60), "Extras"]}
                />
                <Bar
                  dataKey="hours"
                  radius={[5, 5, 0, 0]}
                  isAnimationActive={false}
                >
                  {months.map((m) => (
                    <Cell
                      key={m.key}
                      fill={m.key === month ? "#3d73e5" : "#c9d8f5"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="rounded-xl bg-blue-50 text-blue-900 p-4 text-sm mt-4 flex gap-2 items-start">
            <TrendingUp size={18} className="shrink-0" />
            <span>
              {previous.worked
                ? duration(Math.abs(difference)) +
                  (difference >= 0 ? " a mais" : " a menos") +
                  " de extras em relação ao mês anterior."
                : "Ainda não há registros no mês anterior para comparar."}
              <span className="block text-xs mt-1">
                {month ===
                new Date()
                  .toLocaleDateString("en-CA", {
                    timeZone: "America/Sao_Paulo",
                    year: "numeric",
                    month: "2-digit",
                  })
                  .slice(0, 7)
                  ? "O mês atual ainda está em andamento."
                  : "Comparação dos totais registrados de cada mês."}
              </span>
            </span>
          </p>
        </section>
      </div>
      <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-5">
        <section className="panel min-w-0 p-5 sm:p-6">
          <h2>Meu calendário</h2>
          <p className="muted text-sm mt-1">
            Toque em uma data para conferir os pontos
          </p>
          <div className="grid grid-cols-7 gap-1 mt-5">
            {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
              <span key={"h" + i} className="text-center text-xs muted py-2">
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: lastDate }, (_, i) => {
              const date = month + "-" + String(i + 1).padStart(2, "0"),
                day = daily.find((d) => d.date === date),
                active = selectedDay === date;
              return (
                <button
                  key={date}
                  aria-label={
                    date.split("-").reverse().join("/") +
                    (day
                      ? " · " + duration(day.extra) + " extras"
                      : " · Sem pontos")
                  }
                  aria-pressed={active}
                  onClick={() => setSelectedDay(active ? null : date)}
                  className={
                    "min-h-11 rounded-lg text-sm relative " +
                    (active
                      ? "bg-blue-600 text-white"
                      : day?.extra
                        ? "bg-amber-50 text-amber-900"
                        : day
                          ? "bg-blue-50 text-blue-800"
                          : "text-slate-500")
                  }
                >
                  {i + 1}
                  {!!day?.extra && (
                    <span
                      className={
                        "absolute bottom-1 left-1/2 size-1 rounded-full " +
                        (active ? "bg-white" : "bg-amber-500")
                      }
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-xs muted">
            <span>🔵 Com serviço</span>
            <span>🟠 Com horas extras</span>
          </div>
        </section>
        <section className="panel min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2>
                {selectedDay
                  ? "Pontos de " + selectedDay.split("-").reverse().join("/")
                  : "Detalhamento das minhas extras"}
              </h2>
              <p className="muted text-sm mt-1">
                Data, horários e valor de cada marcação
              </p>
            </div>
            {selectedDay && (
              <Button
                variant="ghost"
                className="action text-sm"
                onClick={() => setSelectedDay(null)}
              >
                Limpar data
              </Button>
            )}
          </div>
          <div className="mt-4 max-h-[420px] overflow-y-auto">
            {shown.length ? (
              shown
                .slice()
                .sort((a, b) =>
                  (b.date + b.start).localeCompare(a.date + a.start),
                )
                .map((e) => (
                  <article key={e.id} className="py-4 border-b last:border-0">
                    <div className="flex justify-between flex-wrap gap-2">
                      <b className="text-sm">
                        {e.date.split("-").reverse().join("/")}{" "}
                        <span className="font-normal muted">· {e.kind}</span>
                      </b>
                      <Status value={e.status} />
                    </div>
                    <p className="text-sm muted mt-2">
                      {e.start.slice(0, 5)} —{" "}
                      {e.end?.slice(0, 5) || "Em aberto"} · Pausa de{" "}
                      {e.break_minutes} min
                    </p>
                    <div className="flex justify-between flex-wrap gap-2 mt-3">
                      <b className="text-amber-700 text-sm num">
                        {duration(e.extra)} extras
                      </b>
                      <b className="text-sm num">
                        {money(e.amount, e.rules.currency)}
                      </b>
                    </div>
                  </article>
                ))
            ) : (
              <Blank
                description={
                  selectedDay
                    ? "Nenhum ponto nesta data."
                    : "Você ainda não tem extras neste mês."
                }
              />
            )}
          </div>
          <Button
            variant="outline"
            className="action mt-4 w-full"
            onClick={onHistory}
          >
            Ver histórico completo <ArrowRight size={16} />
          </Button>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#142b42] text-white p-5">
        <div>
          <b>Vai começar um serviço?</b>
          <p className="text-sm text-slate-300 mt-1">
            O ponto rápido está sempre a um toque.
          </p>
        </div>
        <Button
          className="action bg-white text-slate-900 hover:bg-slate-100"
          onClick={onClock}
        >
          <Timer size={17} />
          Ir para meu ponto
        </Button>
      </div>
    </div>
  );
}
