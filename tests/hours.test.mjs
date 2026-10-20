import test from "node:test";
import assert from "node:assert/strict";
import { calculate, defaults as currentDefaults, legacyDefaults as defaults, totals } from "../lib/domain.ts";
const entry = (patch = {}) => ({
  id: "1",
  user_id: "u",
  client_id: "c",
  date: "2026-09-21",
  start: "07:00",
  end: "20:00",
  break_minutes: 60,
  service: "Serviço",
  service_type: "",
  notes: "",
  holiday: false,
  status: "Pendente",
  rate: 30,
  rules: defaults,
  version: 1,
  ...patch,
});
test("12h em serviço: 9 normais, 3 extras; valor inclui adicional de 50%", () => {
  const [r] = calculate([entry()]);
  assert.equal(r.worked, 720);
  assert.equal(r.normal, 540);
  assert.equal(r.extra, 180);
  assert.equal(r.amount, 135);
});
test("sábado e domingo: todas as horas recebem 60% e 100%", () => {
  const [sat] = calculate([
    entry({ date: "2026-09-19", start: "08:00", end: "13:00" }),
  ]);
  const [sun] = calculate([
    entry({ date: "2026-09-20", start: "08:00", end: "13:00" }),
  ]);
  assert.equal(sat.amount, 192);
  assert.equal(sun.amount, 240);
  assert.equal(sat.normal, 0);
});
test("a franquia de 9h é diária e compartilhada entre serviços", () => {
  const rows = calculate([
    entry({ id: "2", start: "13:00", end: "20:00", break_minutes: 0 }),
    entry({ id: "1", start: "07:00", end: "12:00", break_minutes: 0 }),
  ]);
  assert.equal(totals(rows).extra, 180);
  assert.equal(rows.find((e) => e.id === "1").extra, 0);
});
test("a jornada de um colaborador não afeta a de outro", () => {
  const rows = calculate([
    entry({ user_id: "a" }),
    entry({ id: "2", user_id: "b" }),
  ]);
  assert.equal(totals(rows).normal, 1080);
});
test("registros em aberto ficam fora dos totais", () => {
  assert.equal(totals(calculate([entry({ end: null })])).worked, 0);
});
test("feriados e regras históricas são respeitados", () => {
  const [r] = calculate([
    entry({
      holiday: true,
      rules: { ...defaults, holiday_bonus: 80 },
      rate: 20,
    }),
  ]);
  assert.equal(r.amount, 432);
});

const shift = { start: "08:00", end: "17:00", break_start: "12:00", break_end: "13:00" };
const modern = (patch = {}) => entry({ rules: structuredClone(currentDefaults), end: "18:00", break_mode: "custom", break_start: "12:00", ...patch });

test("v2: 07h–18h com 1h real de intervalo são 8h normais e 2h extras", () => {
  const [r] = calculate([modern()]);
  assert.equal(r.worked, 600);
  assert.equal(r.normal, 480);
  assert.equal(r.extra, 120);
  assert.equal(r.amount, 90);
});

test("v2: sábado tem a mesma franquia útil e só o excedente é extra", () => {
  const [r] = calculate([modern({ date: "2026-10-10" })]);
  assert.equal(r.normal, 480);
  assert.equal(r.extra, 120);
  assert.equal(r.amount, 96);
  assert.deepEqual(r.breakdown, [{ minutes: 120, bonus: 60, amount: 96 }]);
});

test("v2: sábado com 4h extras divide 3h a 60% e 1h a 100%", () => {
  const [r] = calculate([modern({ date: "2026-10-10", start: "06:00", end: "19:00" })]);
  assert.equal(r.extra, 240);
  assert.equal(r.amount, 204);
  assert.deepEqual(r.breakdown, [{ minutes: 180, bonus: 60, amount: 144 }, { minutes: 60, bonus: 100, amount: 60 }]);
});

test("v2: franquia e faixas acumulam entre OS, usando a tarifa histórica de cada registro", () => {
  const rows = calculate([
    modern({ id: "3", order_id: "os3", date: "2026-10-10", start: "18:00", end: "19:00", break_minutes: 0, rate: 50 }),
    modern({ id: "1", order_id: "os1", date: "2026-10-10", start: "06:00", end: "12:00", break_minutes: 0 }),
    modern({ id: "2", order_id: "os2", date: "2026-10-10", start: "13:00", end: "18:00", break_minutes: 0 }),
  ]);
  assert.deepEqual(rows.map(r => r.extra), [0, 180, 60]);
  assert.deepEqual(rows[2].breakdown, [{ minutes: 60, bonus: 100, amount: 100 }]);
  assert.equal(totals(rows).amount, 244);
});

test("v2: limite exato de 3h permanece a 60%; o minuto seguinte recebe 100%", () => {
  const rules = structuredClone(currentDefaults);
  rules.day_policies.saturday.normal_minutes = 0;
  const rows = calculate([
    modern({ id: "1", date: "2026-10-10", start: "08:00", end: "11:00", break_minutes: 0, rules }),
    modern({ id: "2", date: "2026-10-10", start: "11:00", end: "11:01", break_minutes: 0, rules }),
  ]);
  assert.deepEqual(rows[0].breakdown, [{ minutes: 180, bonus: 60, amount: 144 }]);
  assert.deepEqual(rows[1].breakdown, [{ minutes: 1, bonus: 100, amount: 1 }]);
});

test("v2: turno 08h–17h classifica 07h–18h como 2h extras", () => {
  const [r] = calculate([modern({ shift })]);
  assert.equal(r.normal, 480);
  assert.equal(r.extra, 120);
  assert.equal(r.calculation_warning, undefined);
});

test("v2: minutos fora do turno não consomem a franquia dos registros seguintes", () => {
  const rows = calculate([
    modern({ id: "1", shift, start: "07:00", end: "08:00", break_minutes: 0 }),
    modern({ id: "2", shift, start: "08:00", end: "12:00", break_minutes: 0 }),
    modern({ id: "3", shift, start: "13:00", end: "17:00", break_minutes: 0 }),
    modern({ id: "4", shift, start: "17:00", end: "18:00", break_minutes: 0 }),
  ]);
  assert.deepEqual(rows.map(r => r.normal), [0, 240, 240, 0]);
  assert.equal(totals(rows).extra, 120);
});

test("v2: entrada tardia não compensa trabalho fora do turno", () => {
  const [r] = calculate([modern({ shift, start: "10:00", end: "19:00" })]);
  assert.equal(r.worked, 480);
  assert.equal(r.normal, 360);
  assert.equal(r.extra, 120);
});

test("v2: intervalo automático compartilhado é posicionado uma única vez em registros divididos", () => {
  const rows = calculate([
    modern({ id: "1", shift, start: "07:00", end: "12:30", break_mode: "automatic", break_start: null, break_minutes: 30 }),
    modern({ id: "2", shift, start: "12:30", end: "18:00", break_mode: "automatic", break_start: null, break_minutes: 30 }),
  ]);
  assert.equal(totals(rows).worked, 600);
  assert.equal(totals(rows).normal, 480);
  assert.equal(totals(rows).extra, 120);
  assert.ok(rows.every(r => !r.calculation_warning));
});

test("v2: intervalo automático usa a janela da noite se não houver almoço no dia", () => {
  const [r] = calculate([modern({ shift: { start: "17:00", end: "22:00", break_start: "19:00", break_end: "20:00" }, start: "17:00", end: "22:00", break_mode: "automatic", break_start: null })]);
  assert.equal(r.worked, 240);
  assert.equal(r.normal, 240);
  assert.equal(r.calculation_warning, undefined);
});

test("v2: pausa sem horário não é inventada e pede conferência ao usar carga diária", () => {
  const [r] = calculate([modern({ shift, start: "10:00", end: "19:00", break_start: null })]);
  assert.equal(r.worked, 480);
  assert.equal(r.normal, 480);
  assert.equal(r.extra, 0);
  assert.match(r.calculation_warning, /início real do intervalo/);
});

test("v2: intervalo real fora do turno não é descontado das horas dentro do turno", () => {
  const [r] = calculate([modern({ shift: { ...shift, end: "16:00" }, start: "07:00", end: "18:00", break_start: "17:00" })]);
  assert.equal(r.worked, 600);
  assert.equal(r.normal, 480);
  assert.equal(r.extra, 120);
});

test("v2: deslocamento diário não herda turno do destino e compartilha franquia com trabalho", () => {
  const rows = calculate([
    modern({ id: "1", work_type: "travel", shift, start: "05:00", end: "09:00", break_minutes: 0 }),
    modern({ id: "2", shift, start: "09:00", end: "18:00" }),
  ]);
  assert.equal(rows[0].normal, 240);
  assert.equal(rows[0].extra, 0);
  assert.equal(rows[1].normal, 240);
  assert.equal(rows[1].extra, 240);
  assert.equal(totals(rows).extra, 240);
});

test("v2: opções de deslocamento por turno e integralmente extra são respeitadas", () => {
  const shiftRules = { ...structuredClone(currentDefaults), travel_mode: "shift" };
  const allRules = { ...structuredClone(currentDefaults), travel_mode: "all_extra" };
  const [byShift] = calculate([modern({ work_type: "travel", shift, rules: shiftRules })]);
  const [allExtra] = calculate([modern({ work_type: "travel", rules: allRules })]);
  assert.equal(byShift.extra, 120);
  assert.equal(allExtra.extra, 600);
  assert.equal(allExtra.normal, 0);
});

test("v2: domingo e feriado continuam integralmente extras mesmo com turno", () => {
  for (const patch of [{ date: "2026-10-11" }, { holiday: true }]) {
    const [r] = calculate([modern({ ...patch, shift, start: "08:00", end: "17:00" })]);
    assert.equal(r.normal, 0);
    assert.equal(r.extra, 480);
    assert.equal(r.amount, 480);
  }
});

test("v2: regras e tarifa são snapshots, não mudam quando o padrão é alterado", () => {
  const original = modern({ shift, rate: 20 });
  const originalSnapshot = structuredClone(original);
  const changedRules = structuredClone(currentDefaults);
  changedRules.day_policies.weekday.tiers = [{ up_to_minutes: null, bonus: 100 }];
  const [historical] = calculate([original]);
  const [changed] = calculate([modern({ rules: changedRules, shift, rate: 40 })]);
  assert.equal(historical.amount, 60);
  assert.equal(changed.amount, 160);
  assert.deepEqual(original, originalSnapshot);
});

test("v2: tarifa ausente é sinalizada sem perder as horas calculadas", () => {
  const [r] = calculate([modern({ rate: 0, shift })]);
  assert.equal(r.extra, 120);
  assert.equal(r.missing_rate, true);
  assert.equal(r.amount, 0);
});

test("v2: acumuladores são independentes por pessoa e data; registro aberto não consome nada", () => {
  const rows = calculate([
    modern({ id: "open", start: "00:00", end: null }),
    modern({ id: "a", user_id: "a", shift }),
    modern({ id: "b", user_id: "b", shift }),
    modern({ id: "next", date: "2026-09-22", shift }),
  ]);
  assert.equal(rows.find(r => r.id === "open").worked, 0);
  for (const row of rows.filter(r => r.id !== "open")) assert.equal(row.normal, 480);
});

test("v2: arredondamento diário preserva centavos ao dividir horas extras entre OS", () => {
  const rules = structuredClone(currentDefaults);
  rules.day_policies.saturday.normal_minutes = 0;
  const base = { date: "2026-10-10", rate: 10.61, rules, break_minutes: 0 };
  const [single] = calculate([modern({ ...base, start: "08:00", end: "08:03" })]);
  const split = calculate([
    modern({ ...base, id: "1", order_id: "os1", start: "08:00", end: "08:01" }),
    modern({ ...base, id: "2", order_id: "os2", start: "08:01", end: "08:02" }),
    modern({ ...base, id: "3", order_id: "os3", start: "08:02", end: "08:03" }),
  ]);
  assert.equal(single.amount, 0.85);
  assert.deepEqual(split.map(r => r.amount), [0.28, 0.29, 0.28]);
  assert.equal(Math.round(totals(split).amount * 100), 85);
  for (const row of split) assert.equal(row.amount, row.breakdown.reduce((sum, tier) => sum + tier.amount, 0));
});

test("v2: arredondamento acumulado separa dia, pessoa, moeda, tarifa histórica e adicional", () => {
  const rules = structuredClone(currentDefaults);
  rules.day_policies.saturday.normal_minutes = 0;
  rules.day_policies.weekday.normal_minutes = 0;
  rules.day_policies.weekday.tiers[0].bonus = 60;
  const base = { date: "2026-10-10", rate: 10.61, rules, break_minutes: 0 };
  const rows = calculate([
    modern({ ...base, id: "1", start: "08:00", end: "08:01" }),
    modern({ ...base, id: "2", start: "08:01", end: "08:02", user_id: "other" }),
    modern({ ...base, id: "3", start: "08:02", end: "08:03", date: "2026-10-12" }),
    modern({ ...base, id: "4", start: "08:03", end: "08:04", rules: { ...rules, currency: "USD" } }),
    modern({ ...base, id: "5", start: "08:04", end: "08:05", rate: 20.61 }),
    modern({ ...base, id: "6", start: "08:05", end: "08:06", rules: { ...rules, day_policies: { ...rules.day_policies, saturday: { normal_minutes: 0, tiers: [{ up_to_minutes: null, bonus: 100 }] } } } }),
    modern({ ...base, id: "7", start: "08:06", end: "08:07" }),
  ]);
  assert.equal(rows.find(r => r.id === "7").amount, 0.29);
  for (const id of ["1", "2", "3", "4"]) assert.equal(rows.find(r => r.id === id).amount, 0.28);
  assert.equal(rows.find(r => r.id === "5").amount, 0.55);
  assert.equal(rows.find(r => r.id === "6").amount, 0.35);
});

test("v1: arredondamento histórico por registro permanece preservado", () => {
  const base = { date: "2026-10-10", rate: 10.61, break_minutes: 0 };
  const rows = calculate([
    entry({ ...base, id: "1", start: "08:00", end: "08:01" }),
    entry({ ...base, id: "2", start: "08:01", end: "08:02" }),
    entry({ ...base, id: "3", start: "08:02", end: "08:03" }),
  ]);
  assert.deepEqual(rows.map(r => r.amount), [0.28, 0.28, 0.28]);
});
