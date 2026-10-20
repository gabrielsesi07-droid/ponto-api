import test from "node:test";
import assert from "node:assert/strict";
import { legacyDefaults } from "../lib/domain.ts";
import { rulesSchema, shiftSchema, createDefaultRules, normalizeRules } from "../lib/work-rules.ts";

test("padrões v2 têm 8h úteis/sábado, faixas de sábado, domingo integral e aprovação automática", () => {
  const rules = rulesSchema.parse(createDefaultRules());
  assert.equal(rules.calculation_version, 2);
  assert.equal(rules.approval_required, false);
  assert.equal(rules.travel_mode, "daily");
  assert.equal(rules.day_policies.weekday.normal_minutes, 480);
  assert.equal(rules.day_policies.saturday.normal_minutes, 480);
  assert.equal(rules.day_policies.sunday.normal_minutes, 0);
  assert.deepEqual(rules.day_policies.saturday.tiers, [{ up_to_minutes: 180, bonus: 60 }, { up_to_minutes: null, bonus: 100 }]);
});

test("normalização mantém snapshots v1 e completa somente v2", () => {
  assert.deepEqual(normalizeRules(legacyDefaults), legacyDefaults);
  assert.equal(normalizeRules(legacyDefaults).calculation_version, undefined);
  const partial = { ...legacyDefaults, calculation_version: 2, daily_minutes: 420 };
  const normalized = normalizeRules(partial);
  assert.equal(normalized.day_policies.weekday.normal_minutes, 420);
  assert.equal(normalized.day_policies.saturday.normal_minutes, 420);
  assert.equal(partial.day_policies, undefined);
});

test("fábrica e normalização não compartilham objetos mutáveis com padrões ou snapshots", () => {
  const first = createDefaultRules();
  const second = createDefaultRules();
  first.day_policies.saturday.tiers[0].bonus = 200;
  assert.equal(second.day_policies.saturday.tiers[0].bonus, 60);
  const normalized = normalizeRules(second);
  normalized.day_policies.weekday.normal_minutes = 300;
  assert.equal(second.day_policies.weekday.normal_minutes, 480);
});

test("faixas exigem limites crescentes e última faixa sem limite", () => {
  for (const tiers of [[], [{ up_to_minutes: 180, bonus: 60 }], [{ up_to_minutes: null, bonus: 60 }, { up_to_minutes: null, bonus: 100 }], [{ up_to_minutes: 180, bonus: 60 }, { up_to_minutes: 120, bonus: 80 }, { up_to_minutes: null, bonus: 100 }], [{ up_to_minutes: 0, bonus: 60 }, { up_to_minutes: null, bonus: 100 }]]) {
    const rules = createDefaultRules();
    rules.day_policies.saturday.tiers = tiers;
    assert.equal(rulesSchema.safeParse(rules).success, false, JSON.stringify(tiers));
  }
});

test("regras rejeitam valores fora do intervalo e versões incompatíveis", () => {
  for (const minutes of [-1, 1441, 1.5, Infinity]) {
    const rules = createDefaultRules();
    rules.day_policies.weekday.normal_minutes = minutes;
    assert.equal(rulesSchema.safeParse(rules).success, false);
  }
  for (const bonus of [-1, 1001, NaN, Infinity]) {
    const rules = createDefaultRules();
    rules.day_policies.weekday.tiers[0].bonus = bonus;
    assert.equal(rulesSchema.safeParse(rules).success, false);
  }
  const rules = createDefaultRules();
  delete rules.calculation_version;
  assert.equal(rulesSchema.safeParse(rules).success, false);
  assert.equal(rulesSchema.safeParse({ ...createDefaultRules(), travel_mode: "unknown" }).success, false);
});

test("turnos validam horários, intervalo real dentro da janela e viradas por data", () => {
  const valid = { start: "08:00", end: "17:00", break_start: "12:00", break_end: "13:00" };
  assert.equal(shiftSchema.safeParse(valid).success, true);
  assert.equal(shiftSchema.safeParse({ ...valid, break_end: "12:00" }).success, true);
  assert.equal(shiftSchema.safeParse({ start: "16:00", end: "24:00", break_start: "19:00", break_end: "20:00" }).success, true);
  for (const patch of [{ end: "07:00" }, { start: "25:00" }, { break_start: "07:00" }, { break_end: "18:00" }, { break_start: "13:30" }, { break_start: "08:00", break_end: "17:00" }])
    assert.equal(shiftSchema.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(patch));
});
