import { z } from "zod";
import { defaults, dayPolicy } from "./domain.ts";
import type { Rules } from "./domain.ts";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido.");
const endClock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Informe um horário válido.");
const clockMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const shiftSchema = z.object({
  start: clock,
  end: endClock,
  break_start: clock,
  break_end: endClock,
}).strict().superRefine((shift, ctx) => {
  const start = clockMinutes(shift.start), end = clockMinutes(shift.end);
  const from = clockMinutes(shift.break_start), to = clockMinutes(shift.break_end);
  if (end <= start) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end"], message: "O fim do turno deve ser após o início. Para viradas, defina um turno por data." });
  if (from < start || to > end || to < from || to - from >= end - start)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["break_start"], message: "O intervalo deve estar dentro do turno e ser menor que sua duração." });
});

export const overtimeTierSchema = z.object({
  up_to_minutes: z.number().int().min(1).max(1440).nullable(),
  bonus: z.number().finite().min(0).max(1000),
}).strict();
export const dayPolicySchema = z.object({
  normal_minutes: z.number().int().min(0).max(1440),
  tiers: z.array(overtimeTierSchema).min(1).max(12),
}).strict().superRefine((policy, ctx) => {
  let previous = 0;
  policy.tiers.forEach((tier, index) => {
    if (index === policy.tiers.length - 1) {
      if (tier.up_to_minutes !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiers", index, "up_to_minutes"], message: "A última faixa deve ser sem limite." });
    } else if (tier.up_to_minutes === null || tier.up_to_minutes <= previous) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiers", index, "up_to_minutes"], message: "Os limites das faixas devem ser crescentes; apenas a última pode ser sem limite." });
    }
    previous = tier.up_to_minutes ?? Infinity;
  });
});
export const dayPoliciesSchema = z.object({
  weekday: dayPolicySchema,
  saturday: dayPolicySchema,
  sunday: dayPolicySchema,
  holiday: dayPolicySchema,
}).strict();

/** Legacy snapshots remain valid and are never implicitly upgraded. */
export const rulesSchema = z.object({
  daily_minutes: z.coerce.number().int().min(1).max(1440),
  weekday_bonus: z.coerce.number().finite().min(0).max(1000),
  saturday_bonus: z.coerce.number().finite().min(0).max(1000),
  sunday_bonus: z.coerce.number().finite().min(0).max(1000),
  holiday_bonus: z.coerce.number().finite().min(0).max(1000),
  allow_retro: z.boolean(),
  approval_required: z.boolean(),
  currency: z.enum(["BRL", "USD", "EUR"]),
  date_format: z.enum(["dd/MM/yyyy", "yyyy-MM-dd"]),
  time_format: z.enum(["24h", "12h"]),
  calculation_version: z.literal(2).optional(),
  day_policies: dayPoliciesSchema.optional(),
  travel_mode: z.enum(["daily", "shift", "all_extra"]).optional(),
}).superRefine((rules, ctx) => {
  if (rules.calculation_version !== 2 && (rules.day_policies || rules.travel_mode))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["calculation_version"], message: "Selecione o cálculo versão 2 para configurar turnos e faixas por dia." });
});

/** Fresh objects prevent settings forms from mutating shared defaults or saved snapshots. */
export function createDefaultRules(): Rules {
  return structuredClone(defaults);
}

export function normalizeRules(input: Rules): Rules {
  const rules = rulesSchema.parse(input);
  if (rules.calculation_version !== 2) return structuredClone(rules);
  return {
    ...rules,
    travel_mode: rules.travel_mode ?? "daily",
    day_policies: {
      weekday: structuredClone(dayPolicy(rules, "Dia útil")),
      saturday: structuredClone(dayPolicy(rules, "Sábado")),
      sunday: structuredClone(dayPolicy(rules, "Domingo")),
      holiday: structuredClone(dayPolicy(rules, "Feriado")),
    },
  };
}
