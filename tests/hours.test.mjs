import test from "node:test";
import assert from "node:assert/strict";
import { calculate, defaults, totals } from "../lib/domain.ts";
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
test("12h úteis: 9 normais, 3 extras; valor inclui adicional de 50%", () => {
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
