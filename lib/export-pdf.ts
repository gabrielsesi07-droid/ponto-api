import { duration, money } from "./domain.ts";
import { orderLabel } from "./order-label.mjs";
import {
  formatReportDate, formatReportPeriod, formatReportTimestamp, reportColors, reportSummary,
  type ReportDocumentContext,
} from "./export-document.ts";
import type { Calculated } from "./domain";

export async function createReportPdf(context: ReportDocumentContext): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { rows, state, options } = context;
  // Group related fields for readable paper columns, without omitting selected data.
  const withDetails = options.breakdown || options.notes;
  const reference = (index: number) => String(index + 1).padStart(3, "0");
  const columns: { title: string; width: number; value: (row: Calculated, index: number) => string }[] = [
    { title: "Data", width: 23, value: (row, index) => formatReportDate(row.date) + (withDetails ? `\nRef. ${reference(index)}` : "") },
    { title: "Colaborador", width: 40, value: row => state.users.find(user => user.id === row.user_id)?.name || "" },
  ];
  if (options.service) columns.push({ title: "Atendimento", width: 52, value: row => [
    row.order_number ? orderLabel(row.order_number, row.order_official_number) : "Histórico anterior · sem OS",
    row.company || "Não informada", row.service || "Serviço técnico",
  ].join("\n") });
  if (options.times) columns.push({ title: "Jornada", width: 35, value: row =>
    `${row.start.slice(0, 5)} - ${row.end?.slice(0, 5) || "Em aberto"}\nIntervalo: ${row.break_minutes} min` });
  if (options.hours) columns.push({ title: "Horas", width: 38, value: row =>
    `Trabalhadas: ${duration(row.worked)}\nNormais: ${duration(row.normal)}\nExtras: ${duration(row.extra)}` });
  if (options.classification) columns.push({ title: "Classificação", width: 30, value: row =>
    `${row.kind}\n${row.work_type === "travel" ? "Deslocamento" : "Serviço"}` });
  if (options.status) columns.push({ title: "Status", width: 26, value: row => row.status });
  if (options.values) columns.push({ title: "Estimativa de extras", width: 38, value: row => {
    const unavailable = row.missing_rate || Number(row.rate) === 0;
    return unavailable
      ? "Valor-hora não informado; estimativa indisponível"
      : `${money(row.amount, row.rules.currency)}\nValor estimado`;
  } });

  const landscape = columns.length > 4;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", compress: false });
  pdf.setProperties({ title: "Relatório de jornada - HoraCerta", author: "HoraCerta", subject: formatReportPeriod(context.period), creator: "HoraCerta" });
  pdf.setCreationDate(context.generatedAt);
  const pageWidth = pdf.internal.pageSize.width, pageHeight = pdf.internal.pageSize.height;
  const margin = 14, usable = pageWidth - margin * 2;
  const color = (key: keyof typeof reportColors) => `#${reportColors[key]}`;
  const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\t/g, "  ");

  function brand(y: number, compact = false) {
    pdf.setDrawColor(color("brass"));
    pdf.setLineWidth(0.35);
    pdf.roundedRect(margin, y, 10, 10, 2.8, 2.8, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(color("forest"));
    pdf.text("hc", margin + 5, y + 6.5, { align: "center" });
    pdf.setFontSize(compact ? 14 : 17);
    pdf.text("HoraCerta", margin + 14, y + 6.8);
    const markX = margin + 14 + pdf.getTextWidth("HoraCerta") + 0.7;
    pdf.setFillColor(color("brass"));
    pdf.circle(markX, y + 6.2, 0.7, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(color("muted"));
    pdf.text(compact ? "Relatório de jornada" : "GESTÃO DE JORNADA", pageWidth - margin, y + 6.5, { align: "right" });
  }

  function sectionHeading(title: string, y: number) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(color("forest"));
    pdf.text(title, margin, y);
    pdf.setDrawColor(color("brass"));
    pdf.setLineWidth(0.4);
    pdf.line(margin, y + 3, pageWidth - margin, y + 3);
  }

  brand(12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(25);
  pdf.setTextColor(color("ink"));
  pdf.text("Relatório de jornada", margin, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(color("muted"));
  const periodLines = pdf.splitTextToSize(clean(formatReportPeriod(context.period)), usable) as string[];
  pdf.text(periodLines, margin, 47);
  const cardsY = 53 + Math.max(0, periodLines.length - 1) * 4;
  const summary = reportSummary(context), gap = 4, cardWidth = (usable - gap * (summary.length - 1)) / summary.length;
  summary.forEach((item, index) => {
    const x = margin + index * (cardWidth + gap);
    pdf.setFillColor(color("linen"));
    pdf.setDrawColor(color("border"));
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, cardsY, cardWidth, 20, 2, 2, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(color("muted"));
    pdf.text(item.label, x + 4, cardsY + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(color("forest"));
    pdf.text(item.value, x + 4, cardsY + 14.5);
  });
  sectionHeading("Lançamentos do período", cardsY + 30);

  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const fontSize = columns.length > 7 ? 8 : 8.8;
  const tableStart = cardsY + 36;
  autoTable(pdf, {
    startY: tableStart,
    margin: { top: 33, bottom: 19, left: margin, right: margin },
    head: [columns.map(column => column.title)],
    body: rows.length ? rows.map((row, index) => columns.map(column => clean(column.value(row, index)))) : [
      [{ content: "Nenhum lançamento no período selecionado.", colSpan: columns.length, styles: { cellPadding: 8, textColor: color("muted") } }],
    ],
    theme: "plain", rowPageBreak: "avoid", showHead: "everyPage",
    styles: { font: "helvetica", fontSize, cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 }, textColor: color("ink"), overflow: "linebreak", valign: "top", lineColor: color("border"), lineWidth: { bottom: 0.15 } },
    headStyles: { fillColor: color("forest"), textColor: color("white"), fontStyle: "bold", minCellHeight: 10, valign: "middle", lineWidth: 0 },
    alternateRowStyles: { fillColor: color("linen") },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, { cellWidth: usable * column.width / totalWidth }])),
    willDrawPage: hook => {
      if (hook.pageNumber > 1) {
        brand(12, true);
        pdf.setDrawColor(color("brass"));
        pdf.setLineWidth(0.35);
        pdf.line(margin, 27, pageWidth - margin, 27);
      }
    },
  });

  // Optional long details get their own full-width lines, avoiding tiny table text.
  if (withDetails && rows.length) {
    let y = (pdf as typeof pdf & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    const ensureSpace = (height: number, continuation = "") => {
      if (y + height <= pageHeight - 20) return;
      const font = pdf.getFont(), size = pdf.getFontSize(), textColor = pdf.getTextColor();
      pdf.addPage(); brand(12, true); y = 36;
      if (continuation) {
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(color("forest"));
        pdf.text(continuation, margin, 31);
        y = 40;
      }
      pdf.setFont(font.fontName, font.fontStyle); pdf.setFontSize(size); pdf.setTextColor(textColor);
    };
    ensureSpace(18);
    sectionHeading("Detalhamento dos lançamentos", y);
    y += 10;
    for (const [index, row] of rows.entries()) {
      const detail = [
        ...(options.breakdown ? ["Faixas de extras: " + (row.breakdown?.map(tier =>
          `${duration(tier.minutes)} com +${tier.bonus}%${options.values ? (row.missing_rate || Number(row.rate) === 0 ? " · valor a calcular" : ` · ${money(tier.amount, row.rules.currency)}`) : ""}`
        ).join("; ") || "Sem faixas de extras.")] : []),
        ...(options.notes ? ["Observações do cálculo: " + (row.calculation_warning || "Sem observações.")] : []),
      ];
      const name = state.users.find(user => user.id === row.user_id)?.name || "";
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
      const heading = pdf.splitTextToSize(clean(`Ref. ${reference(index)} · ${formatReportDate(row.date)} · ${name}`), usable) as string[];
      pdf.setFont("helvetica", "normal");
      const lines = detail.flatMap(value => pdf.splitTextToSize(clean(value), usable - 8) as string[]);
      ensureSpace(Math.min(55, (heading.length + lines.length) * 4.5 + 9));
      pdf.setFont("helvetica", "bold"); pdf.setTextColor(color("forest"));
      for (const line of heading) { ensureSpace(6); pdf.text(line, margin, y); y += 4.5; }
      pdf.setFont("helvetica", "normal"); pdf.setTextColor(color("ink"));
      for (const line of lines) { ensureSpace(6, `Ref. ${reference(index)} (continuação)`); pdf.text(line, margin + 4, y); y += 4.5; }
      y += 5;
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(color("border")); pdf.setLineWidth(0.2);
    pdf.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(color("muted"));
    pdf.text(`Gerado em ${formatReportTimestamp(context.generatedAt)}`, margin, pageHeight - 8);
    pdf.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
  return pdf.output("blob");
}
