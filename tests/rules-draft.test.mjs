import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultRules, normalizeRules } from "../lib/work-rules.ts";
import { draftToRules, policyDrafts, simulate, asMinutes, asClock } from "../lib/rules-draft.ts";

const base = { day: "weekday", work_type: "work", rate: 30, start: "07:00", end: "18:00", break_minutes: 60, break_start: "12:00", shift: null };
const edited = (change) => {
  const rules = createDefaultRules(), drafts = policyDrafts(rules);
  change(drafts);
  const result = draftToRules(rules, drafts);
  assert.ok(result.ok, result.error);
  return result.rules;
};

test("rascunho sem alterações reproduz exatamente as regras salvas", () => {
  const rules = createDefaultRules();
  const result = draftToRules(rules, policyDrafts(rules));
  assert.ok(result.ok);
  assert.deepEqual(result.rules, normalizeRules(rules));
});

test("horas e minutos são convertidos sem aceitar formatos inválidos", () => {
  assert.equal(asMinutes("8:00"), 480);
  assert.equal(asMinutes("24:00"), 1440);
  assert.equal(asMinutes("24:01"), null);
  assert.equal(asMinutes("8h"), null);
  assert.equal(asClock(270), "4:30");
});

test("exemplo padrão: 07h–18h com 1h de intervalo tem 8h normais e 2h extras a 50%", () => {
  const result = simulate(createDefaultRules(), base);
  assert.equal(result.worked, 600);
  assert.equal(result.normal, 480);
  assert.equal(result.extra, 120);
  assert.equal(result.amount, 90);
});

test("com turno combinado, só o que fica fora do turno é extra", () => {
  const result = simulate(createDefaultRules(), { ...base, shift: { start: "08:00", end: "17:00" } });
  assert.equal(result.normal, 480);
  assert.equal(result.extra, 120);
  assert.equal(result.amount, 90);
  const late = simulate(createDefaultRules(), { ...base, start: "08:00", end: "20:00", shift: { start: "08:00", end: "17:00" } });
  assert.equal(late.extra, 180);
});

test("carga e várias faixas editadas pelo formulário chegam ao cálculo", () => {
  const rules = edited(drafts => {
    drafts.weekday.normal = "7:00";
    drafts.weekday.tiers = [{ limit: "2:00", bonus: "50" }, { limit: "4:00", bonus: "75" }, { limit: "", bonus: "100" }];
  });
  assert.equal(rules.daily_minutes, 420);
  const result = simulate(rules, { ...base, start: "06:00", end: "19:00" });
  assert.equal(result.worked, 720);
  assert.equal(result.normal, 420);
  assert.equal(result.extra, 300);
  assert.deepEqual(result.breakdown.map(item => [item.minutes, item.bonus, item.amount]), [[120, 50, 90], [120, 75, 105], [60, 100, 60]]);
  assert.equal(result.amount, 255);
});

test("carga zero faz todas as horas do dia serem extras", () => {
  const rules = edited(drafts => { drafts.weekday.normal = "0:00"; });
  const result = simulate(rules, { ...base, start: "08:00", end: "12:00", break_minutes: 0 });
  assert.equal(result.normal, 0);
  assert.equal(result.extra, 240);
  assert.equal(result.amount, 180);
});

test("sábado, domingo e feriado usam a política própria de cada tipo de dia", () => {
  const rules = createDefaultRules();
  const saturday = simulate(rules, { ...base, day: "saturday", start: "08:00", end: "18:00" });
  assert.equal(saturday.normal, 480);
  assert.equal(saturday.extra, 60);
  assert.equal(saturday.amount, 48);
  const sunday = simulate(rules, { ...base, day: "sunday", start: "08:00", end: "12:00", break_minutes: 0 });
  assert.equal(sunday.extra, 240);
  assert.equal(sunday.amount, 240);
  const custom = edited(drafts => { drafts.holiday.tiers = [{ limit: "", bonus: "150" }]; });
  const holiday = simulate(custom, { ...base, day: "holiday", start: "08:00", end: "10:00", break_minutes: 0 });
  assert.equal(holiday.kind, "Feriado");
  assert.equal(holiday.amount, 150);
});

test("modo de deslocamento altera o resultado de uma viagem", () => {
  const trip = { ...base, work_type: "travel", start: "05:00", end: "09:00", break_minutes: 0 };
  const daily = simulate(createDefaultRules(), trip);
  assert.equal(daily.extra, 0);
  const rules = { ...createDefaultRules(), travel_mode: "all_extra" };
  const allExtra = simulate(rules, trip);
  assert.equal(allExtra.extra, 240);
  assert.equal(allExtra.amount, 180);
});

test("valores inválidos são recusados com mensagem e nunca geram regras", () => {
  const rules = createDefaultRules();
  const attempt = change => { const drafts = policyDrafts(rules); change(drafts); return draftToRules(rules, drafts); };
  assert.match(attempt(d => { d.weekday.normal = "oito"; }).error, /carga normal/);
  assert.match(attempt(d => { d.weekday.tiers[0].bonus = "2000"; }).error, /adicionais/);
  assert.match(attempt(d => { d.weekday.tiers[0].bonus = ""; }).error, /adicionais/);
  assert.match(attempt(d => { d.saturday.tiers[0].limit = "abc"; }).error, /limites/);
  const decreasing = attempt(d => { d.saturday.tiers = [{ limit: "3:00", bonus: "60" }, { limit: "2:00", bonus: "80" }, { limit: "", bonus: "100" }]; });
  assert.equal(decreasing.ok, false);
});

test("simulação nunca altera as regras recebidas", () => {
  const rules = createDefaultRules(), before = structuredClone(rules);
  simulate(rules, base);
  assert.deepEqual(rules, before);
});
