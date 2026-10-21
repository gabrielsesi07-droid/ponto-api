import { orderLabel } from "./order-label.mjs";
import type { Calculated, State } from "./domain";
import { duration } from "./domain.ts";
import type { ReportDocumentContext } from "./export-document";
export const reportSections = [
  { key: "service", label: "OS, empresa e serviço" },
  { key: "times", label: "Entrada, saída e intervalo" },
  { key: "hours", label: "Horas trabalhadas, normais e extras" },
  { key: "classification", label: "Tipo de dia e deslocamento" },
  { key: "status", label: "Status do ponto" },
  { key: "breakdown", label: "Faixas de horas extras" },
  { key: "notes", label: "Observações do cálculo" },
  { key: "values", label: "Valores estimados das extras" },
] as const;
export type ReportOptions = Record<(typeof reportSections)[number]["key"], boolean>;
export const defaultReportOptions: ReportOptions = {
  service: true, times: true, hours: true, classification: true,
  status: true, breakdown: false, notes: false, values: false,
};

export function buildReportData(rows: Calculated[], state: State, options: ReportOptions = defaultReportOptions) {
  const columns: { header: string; group?: keyof ReportOptions; value: (e: Calculated) => string | number }[] = [
    { header: "Data", value: e => e.date },
    { header: "Colaborador", value: e => state.users.find(u => u.id === e.user_id)?.name || "" },
    { header: "OS", group: "service", value: e => e.order_number ? orderLabel(e.order_number, e.order_official_number) : "Histórico anterior · sem OS" },
    { header: "Empresa atendida", group: "service", value: e => e.company || "Não informada" },
    { header: "Serviço", group: "service", value: e => e.service || "Serviço técnico" },
    { header: "Entrada", group: "times", value: e => e.start.slice(0, 5) },
    { header: "Saída", group: "times", value: e => e.end?.slice(0, 5) || "Em aberto" },
    { header: "Intervalo min", group: "times", value: e => e.break_minutes },
    { header: "Trabalhadas", group: "hours", value: e => duration(e.worked) },
    { header: "Normais", group: "hours", value: e => duration(e.normal) },
    { header: "Extras", group: "hours", value: e => duration(e.extra) },
    { header: "Tipo de dia", group: "classification", value: e => e.kind },
    { header: "Tipo de apontamento", group: "classification", value: e => e.work_type === "travel" ? "Deslocamento" : "Serviço" },
    { header: "Status", group: "status", value: e => e.status },
    { header: "Faixas de extras", group: "breakdown", value: e => e.breakdown?.map(tier => `${duration(tier.minutes)} com +${tier.bonus}%${options.values ? (e.missing_rate ? " · valor a calcular" : ` · ${tier.amount.toFixed(2)} ${e.rules.currency}`) : ""}`).join(" | ") || "" },
    { header: "Observações do cálculo", group: "notes", value: e => e.calculation_warning || "" },
    { header: "Valor extras estimado", group: "values", value: e => e.extra > 0 && e.missing_rate ? "" : Number(e.amount.toFixed(2)) },
    { header: "Conferência do valor", group: "values", value: e => e.missing_rate || Number(e.rate) === 0 ? "Valor-hora não informado; estimativa indisponível" : "Valor estimado" },
    { header: "Moeda", group: "values", value: e => e.rules.currency || state.settings.currency },
  ];
  const selected = columns.filter(column => !column.group || options[column.group]);
  return { headers: selected.map(column => column.header), data: rows.map(entry => selected.map(column => column.value(entry))) };
}

export async function createReportDocument(
  format: "csv" | "xlsx" | "pdf",
  rows: Calculated[],
  state: State,
  period: string,
  options: ReportOptions = defaultReportOptions,
  generatedAt = new Date(),
) {
  const { headers, data } = buildReportData(rows, state, options);
  const context: ReportDocumentContext = { headers, data, rows, state, period, options, generatedAt };
  if (format === "csv") {
    const safe = (v: unknown) => {
      let s = String(v);
      if (/^(?:[\s\uFEFF]*[=+\-@]|[\t\r\n])/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return new Blob(
        [
          "\ufeff" +
            [headers, ...data].map((r) => r.map(safe).join(";")).join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
    );
  }
  if (format === "xlsx") {
    const { createReportWorkbook } = await import("./export-xlsx.ts");
    return createReportWorkbook(context);
  }
  const { createReportPdf } = await import("./export-pdf.ts");
  return createReportPdf(context);
}

export async function exportReport(
  format: "csv" | "xlsx" | "pdf", rows: Calculated[], state: State,
  period: string, options: ReportOptions = defaultReportOptions,
) {
  const blob = await createReportDocument(format, rows, state, period, options);
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url;
  const filenamePeriod = period.trim().replace(/\s+a\s+/g, "-a-").replace(/[^0-9a-]/g, "");
  anchor.download = "horacerta-jornada-" + filenamePeriod + "." + format;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
