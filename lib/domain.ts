export type Person = {
  id: string;
  name: string;
  access_code: string;
  username?: string;
  email: string;
  role: "coordinator" | "employee";
  job: string;
  phone: string;
  hourly_rate: number;
  monthly_salary?: number | null;
  monthly_hours?: number;
  active: boolean;
  can_edit: boolean;
  pin_change_required: boolean;
  pin_change_prompted: boolean;
};
export type Client = {
  id: string;
  name: string;
  city: string;
  state: string;
  service_type: string;
  notes: string;
  active: boolean;
};
export type Rules = {
  daily_minutes: number;
  weekday_bonus: number;
  saturday_bonus: number;
  sunday_bonus: number;
  holiday_bonus: number;
  allow_retro: boolean;
  approval_required: boolean;
  currency: string;
  date_format: string;
  time_format: string;
  calculation_version?: 2;
  day_policies?: DayPolicies;
  travel_mode?: "daily" | "shift" | "all_extra";
};
export type OvertimeTier = { up_to_minutes: number | null; bonus: number };
export type DayPolicy = { normal_minutes: number; tiers: OvertimeTier[] };
export type DayPolicies = Record<"weekday" | "saturday" | "sunday" | "holiday", DayPolicy>;
/** An agreed schedule is a snapshot; it never supplies actual worked times. */
export type Shift = { start: string; end: string; break_start: string; break_end: string };
export type Entry = {
  id: string;
  user_id: string;
  client_id: string | null;
  order_id?: string | null;
  order_number?: number | null;
  date: string;
  start: string;
  end: string | null;
  break_minutes: number;
  break_mode?: "automatic" | "custom";
  break_start?: string | null;
  work_type?: "work" | "travel";
  shift?: Shift | null;
  company: string;
  service: string;
  service_type: string;
  notes: string;
  holiday: boolean;
  status: "Pendente" | "Aprovado" | "Revisado";
  rate: number;
  rules: Rules;
  version: number;
  created_at?: string;
};
export type Calculated = Entry & {
  worked: number;
  normal: number;
  extra: number;
  amount: number;
  kind: string;
  bonus: number;
  breakdown?: { minutes: number; bonus: number; amount: number }[];
  missing_rate?: boolean;
  calculation_warning?: string;
};
export type State = {
  me: Person;
  users: Person[];
  clients: Client[];
  entries: Entry[];
  settings: Rules;
  closedMonths?: { month: string; closed_at: string; closed_by: string }[];
  teamTimers?: {
    user_id: string;
    started_at: string;
    paused_at: string | null;
  }[];
  timer?: {
    order_id?: string | null;
    order_number?: number | null;
    user_id: string;
    started_at: string;
    paused_at: string | null;
    pauses: { start: string; end: string }[];
    company: string;
    service: string;
    notes: string;
    rate: number;
    rules: Rules;
  } | null;
};
/** Kept only to interpret snapshots written before calculation version 2. */
export const legacyDefaults: Rules = {
  daily_minutes: 540,
  weekday_bonus: 50,
  saturday_bonus: 60,
  sunday_bonus: 100,
  holiday_bonus: 100,
  allow_retro: true,
  approval_required: true,
  currency: "BRL",
  date_format: "dd/MM/yyyy",
  time_format: "24h",
};
export const defaults: Rules = {
  ...legacyDefaults,
  daily_minutes: 480,
  approval_required: false,
  calculation_version: 2,
  travel_mode: "daily",
  day_policies: {
    weekday: { normal_minutes: 480, tiers: [{ up_to_minutes: null, bonus: 50 }] },
    saturday: { normal_minutes: 480, tiers: [{ up_to_minutes: 180, bonus: 60 }, { up_to_minutes: null, bonus: 100 }] },
    sunday: { normal_minutes: 0, tiers: [{ up_to_minutes: null, bonus: 100 }] },
    holiday: { normal_minutes: 0, tiers: [{ up_to_minutes: null, bonus: 100 }] },
  },
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const duration = (n: number) => {
  const rounded = Math.max(0, Math.round(n));
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, "0")}`;
};
export const money = (n: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
export const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export function kind(e: Pick<Entry, "date" | "holiday">) {
  const day = new Date(e.date + "T12:00:00Z").getUTCDay();
  return e.holiday
    ? "Feriado"
    : day === 0
      ? "Domingo"
      : day === 6
        ? "Sábado"
        : "Dia útil";
}
export function dayPolicy(rules: Rules, day: string): DayPolicy {
  const key = day === "Sábado" ? "saturday" : day === "Domingo" ? "sunday" : day === "Feriado" ? "holiday" : "weekday";
  const bonus = key === "saturday" ? rules.saturday_bonus : key === "sunday" ? rules.sunday_bonus : key === "holiday" ? rules.holiday_bonus : rules.weekday_bonus;
  return rules.day_policies?.[key] ?? {
    normal_minutes: key === "weekday" || key === "saturday" ? rules.daily_minutes : 0,
    tiers: key === "saturday"
      ? [{ up_to_minutes: 180, bonus }, { up_to_minutes: null, bonus: 100 }]
      : [{ up_to_minutes: null, bonus }],
  };
}
const overlap = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));
const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Locate only recorded breaks. A duration alone is insufficient to use a shift window. */
function breakWindow(e: Entry, daySpan: [number, number]): { window: [number, number] | null; warning?: string } {
  if (!e.break_minutes) return { window: null };
  const start = minutes(e.start), end = minutes(e.end!);
  if (e.break_mode === "automatic") {
    const [from, to] = overlap(daySpan[0], daySpan[1], 720, 780) > 0 ? [720, 780] : [1140, 1200];
    const actual: [number, number] = [Math.max(start, from), Math.min(end, to)];
    if (actual[1] - actual[0] === e.break_minutes) return { window: actual };
    return { window: null, warning: "O intervalo automático não corresponde à janela do dia. Cálculo pela carga diária; confira o intervalo." };
  }
  if (e.break_start) {
    const from = minutes(e.break_start), to = from + e.break_minutes;
    if (Number.isFinite(from) && from >= start && to <= end) return { window: [from, to] };
    return { window: null, warning: "O intervalo informado fica fora do registro. Cálculo pela carga diária; confira o intervalo." };
  }
  return { window: null, warning: "Informe o início real do intervalo para calcular pelo turno. Este registro usa a carga diária." };
}

// Quotas and progressive tiers are shared by person/date, before any UI filters.
export function calculate(entries: Entry[]): Calculated[] {
  const legacyUsed = new Map<string, number>();
  const normalUsed = new Map<string, number>();
  const extraUsed = new Map<string, number>();
  // Round the accumulated daily value, so splitting one service does not lose cents.
  // Different historical rates, currencies and bonus tiers keep separate monetary ledgers.
  const paidMinutes = new Map<string, number>();
  const daySpans = new Map<string, [number, number]>();
  for (const e of entries) {
    if (!e.end) continue;
    const key = `${e.user_id}:${e.date}`, span = daySpans.get(key);
    daySpans.set(key, [Math.min(span?.[0] ?? 1440, minutes(e.start)), Math.max(span?.[1] ?? 0, minutes(e.end))]);
  }
  return [...entries]
    .sort((a, b) =>
      (a.date + a.start + a.id).localeCompare(b.date + b.start + b.id),
    )
    .map((e) => {
      const worked = e.end
        ? Math.max(0, minutes(e.end) - minutes(e.start) - e.break_minutes)
        : 0;
      const k = kind(e),
        key = `${e.user_id}:${e.date}`;
      const legacyBonus =
          k === "Sábado"
            ? e.rules.saturday_bonus
            : k === "Domingo"
              ? e.rules.sunday_bonus
              : k === "Feriado"
                ? e.rules.holiday_bonus
                : e.rules.weekday_bonus;
      if (e.rules.calculation_version !== 2) {
        const previous = legacyUsed.get(key) || 0;
        const normal = k === "Dia útil" ? Math.min(worked, Math.max(0, e.rules.daily_minutes - previous)) : 0;
        legacyUsed.set(key, previous + worked);
        normalUsed.set(key, (normalUsed.get(key) || 0) + normal);
        const extra = worked - normal;
        const missing_rate = !Number.isFinite(Number(e.rate)) || Number(e.rate) <= 0;
        extraUsed.set(key, (extraUsed.get(key) || 0) + extra);
        return {
          ...e, worked, normal, extra,
          amount: missing_rate ? 0 : Math.round((extra / 60) * Number(e.rate) * (1 + legacyBonus / 100) * 100) / 100,
          kind: k, bonus: legacyBonus,
          missing_rate,
        };
      }

      const policy = dayPolicy(e.rules, k);
      const mode = e.work_type === "travel" ? e.rules.travel_mode ?? "daily" : "shift";
      let eligible = worked, calculation_warning: string | undefined;
      if (mode === "all_extra") eligible = 0;
      else if (mode === "shift" && e.shift && e.end && worked > 0) {
        const pause = breakWindow(e, daySpans.get(key)!);
        calculation_warning = pause.warning;
        if (!pause.warning) {
          eligible = overlap(minutes(e.start), minutes(e.end), minutes(e.shift.start), minutes(e.shift.end));
          if (pause.window) eligible -= overlap(pause.window[0], pause.window[1], minutes(e.shift.start), minutes(e.shift.end));
          eligible = Math.max(0, Math.min(worked, eligible));
        }
      } else if (mode === "shift" && !e.shift && worked > 0) {
        calculation_warning = "Registro sem turno definido. Cálculo pela carga diária.";
      }
      const normal = Math.min(eligible, Math.max(0, policy.normal_minutes - (normalUsed.get(key) || 0)));
      normalUsed.set(key, (normalUsed.get(key) || 0) + normal);
      // Legacy snapshots retain their historical worked-time allowance if mixed on the same day.
      legacyUsed.set(key, (legacyUsed.get(key) || 0) + worked);
      const extra = worked - normal;
      let cursor = extraUsed.get(key) || 0, remaining = extra;
      const rate = Number(e.rate), missing_rate = !Number.isFinite(rate) || rate <= 0;
      const breakdown: NonNullable<Calculated["breakdown"]> = [];
      for (const tier of policy.tiers) {
        const inTier = Math.min(remaining, Math.max(0, (tier.up_to_minutes ?? Infinity) - cursor));
        if (inTier > 0) {
          let amount = 0;
          if (!missing_rate) {
            const moneyKey = JSON.stringify([e.user_id, e.date, e.rules.currency, rate, tier.bonus]);
            const previousMinutes = paidMinutes.get(moneyKey) || 0;
            const value = (n: number) => roundMoney((n / 60) * rate * (1 + tier.bonus / 100));
            amount = roundMoney(value(previousMinutes + inTier) - value(previousMinutes));
            paidMinutes.set(moneyKey, previousMinutes + inTier);
          }
          breakdown.push({ minutes: inTier, bonus: tier.bonus, amount });
          cursor += inTier;
          remaining -= inTier;
        }
        if (!remaining) break;
      }
      extraUsed.set(key, (extraUsed.get(key) || 0) + extra);
      return {
        ...e, worked, normal, extra,
        amount: roundMoney(breakdown.reduce((sum, item) => sum + item.amount, 0)),
        kind: k, bonus: breakdown[0]?.bonus ?? policy.tiers[0]?.bonus ?? legacyBonus,
        breakdown, missing_rate,
        ...(calculation_warning ? { calculation_warning } : {}),
      };
    });
}
export function totals(entries: Calculated[]) {
  return entries.reduce(
    (a, e) => ({
      worked: a.worked + e.worked,
      normal: a.normal + e.normal,
      extra: a.extra + e.extra,
      amount: a.amount + e.amount,
    }),
    { worked: 0, normal: 0, extra: 0, amount: 0 },
  );
}
/** Entries of a closed month are read-only for everyone until the coordinator reopens it. */
export const isClosedMonth = (state: Pick<State, "closedMonths">, date: string) =>
  !!state.closedMonths?.some((c) => c.month === date.slice(0, 7));
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    previous: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10),
  };
}
