"use client";
import {
  Clock3,
  Timer,
  Wallet,
  BriefcaseBusiness,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  CalendarDays,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Blank } from "./controls";
import {
  duration,
  money,
  totals,
  initials,
  type Calculated,
  type State,
} from "@/lib/domain";
const palette = ["#3d73e5", "#f3b24a", "#27a77d", "#9b8be6"];
export function Dashboard({
  rows,
  previous,
  state,
  onRegister,
  onEntries,
}: {
  rows: Calculated[];
  previous: Calculated[];
  state: State;
  onRegister: () => void;
  onEntries: () => void;
}) {
  const t = totals(rows),
    prev = totals(previous),
    days = new Set(rows.filter((e) => e.end).map((e) => e.user_id + e.date))
      .size,
    pending = rows.filter((e) => e.status === "Pendente").length,
    open = rows.filter((e) => !e.end).length;
  const weekly = Array.from({ length: 5 }, (_, i) => ({
    name: "Semana " + (i + 1),
    extras: Number(
      (
        rows
          .filter((e) => Math.floor((Number(e.date.slice(8)) - 1) / 7) === i)
          .reduce((n, e) => n + e.extra, 0) / 60
      ).toFixed(2),
    ),
  }));
  const byUser = state.users
    .map((u) => ({
      name: u.name.split(" ")[0],
      full: u.name,
      ...totals(rows.filter((e) => e.user_id === u.id)),
    }))
    .sort((a, b) => b.extra - a.extra);
  const distribution = [
    { name: "Horas normais", value: t.normal },
    {
      name: "Extras em dias úteis",
      value: rows
        .filter((e) => e.kind === "Dia útil")
        .reduce((n, e) => n + e.extra, 0),
    },
    {
      name: "Sábados",
      value: rows
        .filter((e) => e.kind === "Sábado")
        .reduce((n, e) => n + e.extra, 0),
    },
    {
      name: "Domingos e feriados",
      value: rows
        .filter((e) => ["Domingo", "Feriado"].includes(e.kind))
        .reduce((n, e) => n + e.extra, 0),
    },
  ];
  const trend = prev.extra
      ? Math.round(((t.extra - prev.extra) / prev.extra) * 100)
      : null,
    weekend = (day: string) =>
      new Set(rows.filter((e) => e.kind === day && e.end).map((e) => e.date))
        .size;
  return (
    <>
      <section className="panel p-6 mb-6">
        <div className="flex flex-wrap justify-between gap-2">
          <h2>Equipe agora</h2>
          <span className="muted text-xs">
            Atualizado ao abrir ou atualizar a página
          </span>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
          {state.users.map((u) => {
            const timer = state.teamTimers?.find((t) => t.user_id === u.id);
            return (
              <div key={u.id} className="rounded-xl border p-4">
                <b className="text-sm">{u.name}</b>
                <p className="mt-3">
                  <span
                    className={
                      "badge " +
                      (timer ? (timer.paused_at ? "pending" : "approved") : "")
                    }
                  >
                    {!u.active
                      ? "Conta inativa"
                      : timer
                        ? timer.paused_at
                          ? "Em pausa"
                          : "Em serviço"
                        : "Fora de serviço"}
                  </span>
                </p>
                <p className="muted text-xs mt-3">
                  {money(Number(u.hourly_rate), state.settings.currency)} / hora
                </p>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          {
            name: "Horas trabalhadas",
            value: duration(t.worked),
            Icon: Clock3,
            color: "bg-blue-50 text-blue-600",
            note: days
              ? duration(t.worked / days) + " em média por jornada"
              : "Aguardando seu primeiro registro",
          },
          {
            name: "Horas extras",
            value: duration(t.extra),
            Icon: Timer,
            color: "bg-amber-50 text-amber-700",
            note:
              trend === null
                ? "Sem base no mês anterior"
                : (trend >= 0 ? "+" : "") +
                  trend +
                  "% em relação ao mês anterior",
          },
          {
            name: "Valor estimado de extras",
            value: money(t.amount, state.settings.currency),
            Icon: Wallet,
            color: "bg-emerald-50 text-emerald-700",
            note: "Inclui registros ainda não aprovados",
          },
          {
            name: "Pontos encerrados",
            value: String(rows.filter((e) => e.end).length),
            Icon: BriefcaseBusiness,
            color: "bg-violet-50 text-violet-600",
            note: pending
              ? pending + " lançamentos pendentes"
              : "Todos os registros em dia",
          },
        ].map(({ name, value, Icon, color, note }) => (
          <section key={name} className="panel metric">
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm font-medium muted">{name}</span>
              <span className={"p-2.5 rounded-xl " + color}>
                <Icon size={19} />
              </span>
            </div>
            <strong>{value}</strong>
            <p className="text-[13px] muted">{note}</p>
          </section>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1.65fr_1fr] gap-5 mt-6">
        <section className="panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2>Evolução de horas extras</h2>
              <p className="muted text-sm mt-1">
                Distribuição semanal no período
              </p>
            </div>
            <span className="badge">
              <span className="size-2 rounded-full bg-blue-500 mr-2" />
              Horas extras
            </span>
          </div>
          {rows.length ? (
            <div className="chart-height mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={weekly}
                  margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="extraArea" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#3d73e5"
                        stopOpacity={0.22}
                      />
                      <stop offset="100%" stopColor="#3d73e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#e9edf4"
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#69758a" }}
                    dy={10}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#69758a" }}
                    unit="h"
                  />
                  <Tooltip
                    formatter={(v) => [
                      duration(Number(v) * 60),
                      "Horas extras",
                    ]}
                    contentStyle={{ borderRadius: 10, borderColor: "#e2e7ef" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="extras"
                    stroke="#3d73e5"
                    strokeWidth={3}
                    fill="url(#extraArea)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Blank
              title="A jornada começa aqui"
              description="Registre um serviço para acompanhar a evolução da equipe."
              action={
                <Button
                  onClick={onRegister}
                  variant="outline"
                  className="action"
                >
                  Registrar primeiro ponto
                </Button>
              }
            />
          )}
        </section>
        <section className="rounded-2xl bg-[#142b42] text-white p-7 flex flex-col">
          <div className="flex items-center gap-2 text-amber-300 eyebrow">
            <Sparkles size={16} />
            Resumo inteligente
          </div>
          <h2 className="text-[23px] leading-snug mt-5">
            {rows.length
              ? "Uma visão mais clara da sua equipe."
              : "Cada hora merece ser bem acompanhada."}
          </h2>
          <p className="text-slate-300 mt-3 leading-relaxed text-sm">
            {pending
              ? pending +
                " pontos aguardam sua revisão. Confira horários, pausas e valores antes de aprovar."
              : "Acompanhe os pontos em serviço da equipe. Cada colaborador configura o próprio valor-hora."}
          </p>
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between border-b border-white/15 pb-4">
              <span className="text-slate-300">Maior volume de extras</span>
              <b>{byUser[0]?.extra ? byUser[0].name : "—"}</b>
            </div>
            <div className="flex justify-between border-b border-white/15 pb-4">
              <span className="text-slate-300">Sábados / domingos</span>
              <b>
                {weekend("Sábado")} / {weekend("Domingo")}
              </b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Registros incompletos</span>
              <b className={open ? "text-amber-300" : ""}>{open}</b>
            </div>
          </div>
          <button
            onClick={onEntries}
            className="mt-auto pt-7 text-sm font-semibold flex items-center gap-2 text-white"
          >
            Conferir lançamentos <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="grid xl:grid-cols-3 gap-5 mt-6">
        <section className="panel p-6">
          <div className="flex justify-between items-center">
            <h2>Extras por colaborador</h2>
            <Users size={18} className="muted" />
          </div>
          <p className="muted text-sm mt-1">Compare a distribuição da equipe</p>
          {t.extra ? (
            <div className="h-60 mt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byUser.map((u) => ({ ...u, hours: u.extra / 60 }))}
                  margin={{ left: -25, right: 5, top: 8, bottom: 5 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="4 4"
                    stroke="#edf0f5"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                    unit="h"
                  />
                  <Tooltip
                    formatter={(v) => [duration(Number(v) * 60), "Extras"]}
                  />
                  <Bar
                    dataKey="hours"
                    radius={[5, 5, 0, 0]}
                    barSize={30}
                    isAnimationActive={false}
                  >
                    {byUser.map((u, i) => (
                      <Cell key={u.full} fill={palette[i % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Blank description="As horas extras serão comparadas aqui." />
          )}
        </section>
        <section className="panel p-6">
          <h2>Distribuição de horas</h2>
          <p className="muted text-sm mt-1">O que compõe a jornada</p>
          {t.worked ? (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {distribution.map((d, i) => (
                        <Cell key={d.name} fill={palette[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => duration(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <b className="text-xl num">{Math.round(t.worked / 60)}h</b>
                  <span className="text-xs muted">no período</span>
                </div>
              </div>
              <div className="space-y-2">
                {distribution.map((d, i) => (
                  <div
                    className="flex justify-between text-[13px]"
                    key={d.name}
                  >
                    <span className="flex items-center gap-2 muted">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: palette[i] }}
                      />
                      {d.name}
                    </span>
                    <b>{duration(d.value)}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Blank description="A composição das jornadas aparecerá aqui." />
          )}
        </section>
        <section className="panel p-6">
          <h2>Conferência de pontos</h2>
          <p className="muted text-sm mt-1">O que precisa da sua atenção</p>
          <div className="mt-6 space-y-5">
            {[
              ["Pendentes", pending],
              ["Revisados", rows.filter((e) => e.status === "Revisado").length],
              ["Aprovados", rows.filter((e) => e.status === "Aprovado").length],
              ["Sem saída", open],
              [
                "Sem valor-hora",
                state.users.filter((u) => u.active && !Number(u.hourly_rate))
                  .length,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 text-sm border-b pb-3"
              >
                <span className="muted">{label}</span>
                <b className="num">{value}</b>
              </div>
            ))}
          </div>
          <Button
            className="action mt-5 w-full"
            variant="outline"
            onClick={onEntries}
          >
            Revisar pontos <ArrowRight size={16} />
          </Button>
        </section>
      </div>
      <div className="panel mt-6 px-6 py-5 flex flex-wrap justify-between gap-4 items-center">
        <div className="flex gap-3 items-center">
          <CalendarDays className="text-blue-500" />
          <div>
            <h2>Comparativo com o mês anterior</h2>
            <p className="muted text-sm mt-1">
              {previous.length
                ? "Horas extras no mesmo filtro de equipe"
                : "Ainda não há lançamentos no mês anterior."}
            </p>
          </div>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="muted text-xs mb-1">MÊS ANTERIOR</p>
            <b className="text-lg num">{duration(prev.extra)}</b>
          </div>
          <div>
            <p className="muted text-xs mb-1">PERÍODO ATUAL</p>
            <b className="text-lg num text-blue-600">{duration(t.extra)}</b>
          </div>
        </div>
      </div>
    </>
  );
}
