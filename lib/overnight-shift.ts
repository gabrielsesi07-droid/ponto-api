// Jornada que atravessa a meia-noite. O banco guarda cada registro em uma única data,
// então o formulário aceita "15:00 → 02:00" e grava dois registros: até 24:00 no dia do
// serviço e a partir de 00:00 no dia seguinte.
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export type ShiftPart = { date: string; start: string; end: string };

export function nextDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Saída "00:00" depois de uma entrada no mesmo dia significa fim do dia (24:00). */
export function normalizeEnd(start: string, end: string): string {
  return end === "00:00" && validTime(start) && start !== "00:00" ? "24:00" : end;
}

/** Saída anterior à entrada: o trabalho terminou no dia seguinte. */
export function isOvernight(start: string, end: string): boolean {
  const e = normalizeEnd(start, end);
  return validTime(start) && validTime(e) && toMinutes(e) < toMinutes(start);
}

export function splitOvernight(date: string, start: string, end: string): [ShiftPart, ShiftPart] {
  return [
    { date, start, end: "24:00" },
    { date: nextDate(date), start: "00:00", end },
  ];
}
