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
  active: boolean;
  can_edit: boolean;
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
};
export type Entry = {
  id: string;
  user_id: string;
  client_id: string | null;
  date: string;
  start: string;
  end: string | null;
  break_minutes: number;
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
};
export type State = {
  me: Person;
  users: Person[];
  clients: Client[];
  entries: Entry[];
  settings: Rules;
  teamTimers?: {
    user_id: string;
    started_at: string;
    paused_at: string | null;
  }[];
  timer?: {
    user_id: string;
    started_at: string;
    paused_at: string | null;
    pauses: { start: string; end: string }[];
    rate: number;
    rules: Rules;
  } | null;
};
export const defaults: Rules = {
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
// The daily allowance is shared across every record, before UI filters are applied.
export function calculate(entries: Entry[]): Calculated[] {
  const used = new Map<string, number>();
  return [...entries]
    .sort((a, b) =>
      (a.date + a.start + a.id).localeCompare(b.date + b.start + b.id),
    )
    .map((e) => {
      const worked = e.end
        ? Math.max(0, minutes(e.end) - minutes(e.start) - e.break_minutes)
        : 0;
      const k = kind(e),
        key = e.user_id + e.date,
        previous = used.get(key) || 0;
      const normal =
        k === "Dia útil"
          ? Math.min(worked, Math.max(0, e.rules.daily_minutes - previous))
          : 0;
      used.set(key, previous + worked);
      const extra = worked - normal,
        bonus =
          k === "Sábado"
            ? e.rules.saturday_bonus
            : k === "Domingo"
              ? e.rules.sunday_bonus
              : k === "Feriado"
                ? e.rules.holiday_bonus
                : e.rules.weekday_bonus;
      return {
        ...e,
        worked,
        normal,
        extra,
        amount:
          Math.round((extra / 60) * Number(e.rate) * (1 + bonus / 100) * 100) /
          100,
        kind: k,
        bonus,
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
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    previous: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10),
  };
}
