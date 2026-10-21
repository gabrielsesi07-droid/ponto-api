import { formatReportPeriod, formatReportTimestamp, reportColors, type ReportDocumentContext } from "./export-document.ts";
import type { Row, Worksheet } from "exceljs";

const palette = {
  forest: `FF${reportColors.forest}`,
  brass: `FF${reportColors.brass}`,
  linen: `FF${reportColors.linen}`,
  paper: `FF${reportColors.paper}`,
  ink: `FF${reportColors.ink}`,
  muted: `FF${reportColors.muted}`,
  border: `FF${reportColors.border}`,
  white: `FF${reportColors.white}`,
};

/** Stable row location for filtering, printing and consumers reading the export. */
export const reportWorkbookHeaderRow = 8;

function columnWidth(header: string) {
  const widths: Record<string, number> = {
    Data: 15,
    Colaborador: 31,
    OS: 23,
    "Empresa atendida": 26,
    Serviço: 30,
    Entrada: 12,
    Saída: 13,
    "Intervalo min": 15,
    Trabalhadas: 15,
    Normais: 14,
    Extras: 14,
    "Tipo de dia": 17,
    "Tipo de apontamento": 22,
    Status: 16,
    "Faixas de extras": 44,
    "Observações do cálculo": 48,
    "Valor extras estimado": 24,
    "Conferência do valor": 45,
  };
  return widths[header] ?? 24;
}

function hoursLabel(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}`;
}

function currencyFormat(currency: string | undefined) {
  const code = currency?.trim().toUpperCase() ?? "";
  const label = code === "BRL" ? "R$" : /^[A-Z]{3}$/.test(code) ? code : "";
  return label ? `"${label}" #,##0.00;[Red]("${label}" #,##0.00)` : "#,##0.00;[Red](#,##0.00)";
}

function wrappedLineCount(value: string | number, width: number) {
  // Excel does not reliably auto-fit wrapped rows when a file is generated.
  // A conservative width estimate leaves room for cell padding and accents.
  const characters = Math.max(8, Math.floor(width * 0.85));
  return String(value).split(/\r?\n/).reduce((lines, part) => lines + Math.max(1, Math.ceil(part.length / characters)), 0);
}

function splitDetailText(text: string, width: number) {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 500, text.length);
    if (wrappedLineCount(text.slice(start, end), width) > 24) {
      let low = start + 1;
      let high = end;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (wrappedLineCount(text.slice(start, middle), width) <= 24) low = middle;
        else high = middle - 1;
      }
      end = low;
    }
    if (end < text.length) {
      const lowerBoundary = start + Math.floor((end - start) / 2);
      for (let boundary = end - 1; boundary >= lowerBoundary; boundary--) {
        if (/\s/.test(text[boundary])) {
          end = boundary + 1;
          break;
        }
      }
      // Do not separate a UTF-16 surrogate pair at a chunk boundary.
      if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

function addHeading(sheet: Worksheet, columns: number, rowNumber: number, text: string, size: number, color: string, bold = false) {
  if (columns > 1 && !sheet.getCell(rowNumber, 1).isMerged) sheet.mergeCells(rowNumber, 1, rowNumber, columns);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  cell.font = { name: "Arial", size, color: { argb: color }, bold };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

function styleHeader(header: Row) {
  header.height = 34;
  header.eachCell(cell => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: palette.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.forest } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { right: { style: "thin", color: { argb: "FF668B7E" } } };
  });
}

function excelDate(value: string | number) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : value;
}

function excelTime(value: string | number) {
  if (typeof value !== "string") return value;
  const parts = /^(\d{2}):(\d{2})$/.exec(value);
  if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59) return value;
  return (Number(parts[1]) * 60 + Number(parts[2])) / 1440;
}

export async function createReportWorkbook(context: ReportDocumentContext): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const { headers, data, rows, state, period, options, generatedAt } = context;
  const book = new ExcelJS.Workbook();
  book.creator = "HoraCerta";
  book.lastModifiedBy = "HoraCerta";
  book.created = generatedAt;
  book.modified = generatedAt;
  book.title = "Relatório de jornada";
  book.subject = formatReportPeriod(period);
  book.company = "HoraCerta";
  const totalWidth = headers.reduce((width, header) => width + columnWidth(header), 0);
  const printPagesAcross = headers.length > 8 || totalWidth > 160 ? Math.ceil(totalWidth / 115) : 1;

  const sheet = book.addWorksheet("Lançamentos", {
    properties: { defaultRowHeight: 25, tabColor: { argb: palette.forest } },
    views: [{ state: "frozen", xSplit: 2, ySplit: reportWorkbookHeaderRow, showGridLines: false, zoomScale: 90 }],
    pageSetup: {
      paperSize: 9,
      orientation: headers.length > 6 || totalWidth > 115 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: printPagesAcross,
      fitToHeight: 0,
      pageOrder: "overThenDown",
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
      printTitlesRow: `${reportWorkbookHeaderRow}:${reportWorkbookHeaderRow}`,
      ...(printPagesAcross > 1 ? { printTitlesColumn: "A:B" } : {}),
    },
    headerFooter: {
      oddHeader: '&L&"Arial,Bold"&K245748HoraCerta.&R&"Arial,Regular"&K626F65Relatório de jornada',
      oddFooter: '&L&"Arial,Regular"&K626F65Lançamentos selecionados&R&"Arial,Regular"&K626F65Página &P de &N',
    },
  });
  sheet.columns = headers.map(header => ({ width: columnWidth(header) }));

  const heading = (rowNumber: number, text: string, size: number, color: string, bold = false) => addHeading(sheet, headers.length, rowNumber, text, size, color, bold);

  heading(1, "HoraCerta.", 12, palette.forest, true);
  heading(2, "Relatório de jornada", 16, palette.ink, true);
  heading(3, `Período: ${formatReportPeriod(period)}`, 10, palette.muted);
  heading(4, `Gerado em ${formatReportTimestamp(generatedAt)}`, 10, palette.muted);
  const people = new Set(rows.map(row => row.user_id)).size;
  heading(5, `${data.length} ${data.length === 1 ? "lançamento" : "lançamentos"} · ${people} ${people === 1 ? "colaborador" : "colaboradores"}`, 10, palette.ink, true);
  if (options.hours) {
    const totals = rows.reduce((total, row) => ({ worked: total.worked + row.worked, normal: total.normal + row.normal, extra: total.extra + row.extra }), { worked: 0, normal: 0, extra: 0 });
    heading(6, `${hoursLabel(totals.worked)} trabalhadas · ${hoursLabel(totals.normal)} normais · ${hoursLabel(totals.extra)} extras`, 10, palette.forest);
  }
  [24, 28, 20, 20, 22, options.hours ? 24 : 8, 8].forEach((height, index) => { sheet.getRow(index + 1).height = height; });
  for (let column = 1; column <= headers.length; column++) {
    sheet.getCell(7, column).border = { bottom: { style: "medium", color: { argb: palette.brass } } };
  }

  const header = sheet.getRow(reportWorkbookHeaderRow);
  header.values = headers;
  styleHeader(header);
  const longCells: { reference: string; date: string | number; person: string | number; field: string; text: string }[] = [];
  const dateColumn = headers.indexOf("Data");
  const personColumn = headers.indexOf("Colaborador");

  data.forEach((values, index) => {
    const row = sheet.getRow(reportWorkbookHeaderRow + index + 1);
    const entry = rows[index];
    const typedValues = values.map((value, column) => {
      const label = headers[column];
      if (label === "Data") return excelDate(value);
      if (label === "Entrada" || label === "Saída") return excelTime(value);
      const minutes = label === "Trabalhadas" ? entry?.worked : label === "Normais" ? entry?.normal : label === "Extras" ? entry?.extra : undefined;
      return typeof minutes === "number" && Number.isFinite(minutes) ? minutes / 1440 : value;
    });
    // ExcelJS treats strings as literal text. Only an explicit { formula: ... }
    // object creates a formula, so user-entered strings remain inert.
    row.values = typedValues;
    const lines = Math.max(1, ...values.map((value, column) => wrappedLineCount(value, columnWidth(headers[column]))));
    row.height = Math.min(409, Math.max(26, lines * 14 + 10));
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const label = headers[column - 1];
      const numeric = typeof typedValues[column - 1] === "number";
      const original = values[column - 1];
      const overHeight = typeof original === "string" && wrappedLineCount(original, columnWidth(label)) * 14 + 10 > 409;
      if (overHeight) {
        longCells.push({ reference: `Lançamentos!${cell.address}`, date: values[dateColumn] ?? "", person: values[personColumn] ?? "", field: label, text: original });
      }
      cell.font = { name: "Arial", size: 10, color: { argb: label === "Extras" ? palette.forest : palette.ink }, bold: label === "Extras" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? palette.linen : palette.paper } };
      cell.alignment = { vertical: row.height === 409 ? "top" : "middle", horizontal: numeric ? "right" : "left", wrapText: true, indent: 1 };
      cell.border = { bottom: { style: "hair", color: { argb: palette.border } } };
      if (numeric) cell.numFmt = "#,##0";
      if (label === "Data" && typedValues[column - 1] instanceof Date) cell.numFmt = "dd/mm/yyyy";
      if ((label === "Entrada" || label === "Saída") && numeric) cell.numFmt = "hh:mm";
      if ((label === "Trabalhadas" || label === "Normais" || label === "Extras") && numeric) cell.numFmt = '[h]"h "mm';
      if (options.values && label === "Valor extras estimado" && numeric) {
        cell.numFmt = currencyFormat(rows[index]?.rules?.currency ?? state.settings.currency);
      }
    });
  });

  const lastRow = reportWorkbookHeaderRow + data.length;
  if (headers.length > 0) {
    sheet.autoFilter = { from: { row: reportWorkbookHeaderRow, column: 1 }, to: { row: lastRow, column: headers.length } };
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(headers.length).letter}${lastRow}`;
  }
  if (longCells.length) {
    const summary = sheet.getCell(6, 1).value;
    heading(6, `${typeof summary === "string" ? `${summary}\n` : ""}Textos extensos na aba Detalhes.`, 10, palette.forest);
    sheet.getRow(6).height = 40;
    const detailHeaders = ["Referência", "Data", "Colaborador", "Campo", "Parte", "Conteúdo"];
    const widths = [26, 15, 31, 25, 12, 90];
    const details = book.addWorksheet("Detalhes", {
      properties: { defaultRowHeight: 25, tabColor: { argb: palette.brass } },
      views: [{ state: "frozen", xSplit: 3, ySplit: reportWorkbookHeaderRow, showGridLines: false, zoomScale: 90 }],
      pageSetup: {
        paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 2, fitToHeight: 0,
        pageOrder: "overThenDown", printTitlesRow: `${reportWorkbookHeaderRow}:${reportWorkbookHeaderRow}`, printTitlesColumn: "A:B",
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
      },
      headerFooter: {
        oddHeader: '&L&"Arial,Bold"&K245748HoraCerta.&R&"Arial,Regular"&K626F65Detalhes dos lançamentos',
        oddFooter: '&L&"Arial,Regular"&K626F65Campos selecionados&R&"Arial,Regular"&K626F65Página &P de &N',
      },
    });
    details.columns = widths.map(width => ({ width }));
    addHeading(details, detailHeaders.length, 1, "HoraCerta.", 12, palette.forest, true);
    addHeading(details, detailHeaders.length, 2, "Detalhes dos lançamentos", 16, palette.ink, true);
    addHeading(details, detailHeaders.length, 3, `Período: ${formatReportPeriod(period)}`, 10, palette.muted);
    addHeading(details, detailHeaders.length, 4, `Gerado em ${formatReportTimestamp(generatedAt)}`, 10, palette.muted);
    addHeading(details, detailHeaders.length, 5, `${longCells.length} ${longCells.length === 1 ? "campo extenso" : "campos extensos"}`, 10, palette.ink, true);
    addHeading(details, detailHeaders.length, 6, "A referência indica a célula original na aba Lançamentos.", 10, palette.muted);
    [24, 28, 20, 20, 22, 24, 8].forEach((height, index) => { details.getRow(index + 1).height = height; });
    for (let column = 1; column <= detailHeaders.length; column++) {
      details.getCell(7, column).border = { bottom: { style: "medium", color: { argb: palette.brass } } };
    }
    details.getRow(reportWorkbookHeaderRow).values = detailHeaders;
    styleHeader(details.getRow(reportWorkbookHeaderRow));
    let detailRowNumber = reportWorkbookHeaderRow;
    for (const longCell of longCells) {
      const parts = splitDetailText(longCell.text, widths[5]);
      parts.forEach((part, index) => {
        const detailRow = details.getRow(++detailRowNumber);
        const detailValues = [longCell.reference, excelDate(longCell.date), longCell.person, longCell.field, index + 1, part];
        detailRow.values = detailValues;
        const displayValues = [longCell.reference, longCell.date, longCell.person, longCell.field, `${index + 1}/${parts.length}`, part];
        const detailLines = Math.max(...displayValues.map((value, column) => wrappedLineCount(value, widths[column])));
        detailRow.height = Math.min(409, Math.max(26, detailLines * 14 + 10));
        detailRow.eachCell({ includeEmpty: true }, (cell, column) => {
          cell.font = { name: "Arial", size: 10, color: { argb: column === 1 ? palette.forest : palette.ink } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: (detailRowNumber - reportWorkbookHeaderRow) % 2 ? palette.paper : palette.linen } };
          cell.alignment = { vertical: "top", horizontal: column === 5 ? "right" : "left", wrapText: true, indent: 1 };
          cell.border = { bottom: { style: "hair", color: { argb: palette.border } } };
          if (column === 2 && detailValues[1] instanceof Date) cell.numFmt = "dd/mm/yyyy";
          if (column === 5) cell.numFmt = `0"/${parts.length}"`;
        });
      });
    }
    details.autoFilter = { from: { row: reportWorkbookHeaderRow, column: 1 }, to: { row: detailRowNumber, column: detailHeaders.length } };
    details.pageSetup.printArea = `A1:F${detailRowNumber}`;
  }
  const bytes = await book.xlsx.writeBuffer();
  return new Blob([bytes as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
