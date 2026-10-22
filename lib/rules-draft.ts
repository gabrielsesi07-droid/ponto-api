import { calculate, type Calculated, type DayPolicies, type Entry, type Rules } from "./domain.ts";
import { createDefaultRules, normalizeRules, rulesSchema } from "./work-rules.ts";

export const dayNames = { weekday: "Dias úteis", saturday: "Sábado", sunday: "Domingo", holiday: "Feriado" } as const;
export type DayKey = keyof typeof dayNames;
export const dayKeys = Object.keys(dayNames) as DayKey[];
export type DraftTier = { limit: string; bonus: string };
export type DraftPolicy = { normal: string; tiers: DraftTier[] };
export type DraftPolicies = Record<DayKey, DraftPolicy>;

export const asClock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
export function asMinutes(value: string) {
  if (!/^\d{1,2}:[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes;
  return total <= 1440 ? total : null;
}

/** Text fields mirror the saved policies, so partially typed values never reach the schema. */
export function policyDrafts(rules: Rules): DraftPolicies {
  const policies = normalizeRules(rules).day_policies || createDefaultRules().day_policies!;
  return Object.fromEntries(Object.entries(policies).map(([key, policy]) => [key, {
    normal: asClock(policy.normal_minutes),
    tiers: policy.tiers.map(tier => ({ limit: tier.up_to_minutes === null ? "" : asClock(tier.up_to_minutes), bonus: String(tier.bonus) })),
  }])) as DraftPolicies;
}

export type DraftResult = { ok: true; rules: Rules } | { ok: false; error: string };

/** Builds the exact payload the server stores. Never throws: the form shows `error` inline. */
export function draftToRules(form: Rules, drafts: DraftPolicies): DraftResult {
  try {
    const policies = {} as DayPolicies;
    for (const key of dayKeys) {
      const draft = drafts[key];
      const normal = asMinutes(draft.normal);
      if (normal === null) return { ok: false, error: `${dayNames[key]}: informe a carga normal em horas:minutos, entre 0:00 e 24:00.` };
      const tiers = [];
      for (let index = 0; index < draft.tiers.length; index++) {
        const tier = draft.tiers[index], last = index === draft.tiers.length - 1;
        const limit = last ? null : asMinutes(tier.limit);
        if (!last && (limit === null || limit < 1)) return { ok: false, error: `${dayNames[key]}: confira os limites das faixas em horas:minutos.` };
        const bonus = Number(tier.bonus);
        if (!tier.bonus.trim() || !Number.isFinite(bonus) || bonus < 0 || bonus > 1000) return { ok: false, error: `${dayNames[key]}: informe adicionais entre 0% e 1000%.` };
        tiers.push({ up_to_minutes: limit, bonus });
      }
      policies[key] = { normal_minutes: normal, tiers };
    }
    const candidate = { ...form, day_policies: policies, daily_minutes: Math.max(1, policies.weekday.normal_minutes),
      weekday_bonus: policies.weekday.tiers[0].bonus, saturday_bonus: policies.saturday.tiers[0].bonus,
      sunday_bonus: policies.sunday.tiers[0].bonus, holiday_bonus: policies.holiday.tiers[0].bonus };
    const parsed = rulesSchema.safeParse(candidate);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    return { ok: true, rules: normalizeRules(parsed.data) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// Fixed reference dates (Wed, Sat, Sun) keep the simulator deterministic and independent of today.
const simulationDates: Record<DayKey, string> = { weekday: "2026-10-21", saturday: "2026-10-24", sunday: "2026-10-25", holiday: "2026-10-21" };

export type SimulationInput = {
  day: DayKey;
  work_type: "work" | "travel";
  rate: number;
  start: string;
  end: string;
  break_minutes: number;
  break_start?: string | null;
  /** Agreed shift; when absent the daily load is used, exactly like a point without a confirmed shift. */
  shift?: { start: string; end: string } | null;
};

/** Runs the production calculator on a throwaway point, so the preview can never drift from real totals. */
export function simulate(rules: Rules, input: SimulationInput): Calculated {
  const shift = input.shift ? { start: input.shift.start, end: input.shift.end, break_start: input.break_start || input.shift.start, break_end: input.break_start || input.shift.start } : null;
  const entry: Entry = {
    id: "simulation", user_id: "simulation", client_id: null, date: simulationDates[input.day],
    start: input.start, end: input.end, break_minutes: input.break_minutes, break_mode: "custom",
    break_start: input.break_minutes > 0 ? input.break_start || null : null,
    work_type: input.work_type, shift, company: "", service: "", service_type: "", notes: "",
    holiday: input.day === "holiday", status: "Pendente", rate: input.rate, rules, version: 1,
  };
  return calculate([entry])[0];
}
