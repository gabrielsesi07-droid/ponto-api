import type { Calculated, State } from "./domain";
import { duration } from "./domain.ts";
import type { ReportOptions } from "./export";

/** Print colors deliberately use the light Signature palette in every app theme. */
export const reportColors = {
  forest: "245748", brass: "966F28", ink: "202D27", muted: "626F65",
  paper: "FFFEFA", linen: "F5F5F0", border: "DCE2D9", white: "FFFFFF",
} as const;

export type ReportDocumentContext = {
  headers: string[];
  data: (string | number)[][];
  rows: Calculated[];
  state: State;
  period: string;
  options: ReportOptions;
  generatedAt: Date;
};

export function formatReportDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value;
}

export function formatReportPeriod(value: string) {
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)));
  }
  return value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, formatReportDate);
}

export function formatReportTimestamp(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(value) + " (Brasília)";
}

/** Summaries respect the same content selection as the detail table. */
export function reportSummary(context: ReportDocumentContext) {
  const { rows, options } = context;
  return [
    { label: "Lançamentos", value: String(rows.length) },
    { label: "Colaboradores", value: String(new Set(rows.map(row => row.user_id)).size) },
    ...(options.hours ? [
      { label: "Horas trabalhadas", value: duration(rows.reduce((sum, row) => sum + row.worked, 0)) },
      { label: "Horas extras", value: duration(rows.reduce((sum, row) => sum + row.extra, 0)) },
    ] : []),
  ];
}
