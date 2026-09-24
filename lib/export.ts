import type { Calculated, State } from "./domain";
import { duration, money } from "./domain";
export async function exportReport(
  format: "csv" | "xlsx" | "pdf",
  rows: Calculated[],
  state: State,
  period: string,
) {
  const headers = [
    "Data",
    "Colaborador",
    "Entrada",
    "Saída",
    "Intervalo min",
    "Trabalhadas",
    "Normais",
    "Extras",
    "Tipo de dia",
    "Valor extras",
    "Status",
  ];
  const data = rows.map((e) => [
    e.date,
    state.users.find((u) => u.id === e.user_id)?.name || "",
    e.start.slice(0, 5),
    e.end?.slice(0, 5) || "Em aberto",
    e.break_minutes,
    duration(e.worked),
    duration(e.normal),
    duration(e.extra),
    e.kind,
    Number(e.amount.toFixed(2)),
    e.status,
  ]);
  const name = "horacerta-" + period.replace(/[^0-9-]/g, "") + "." + format;
  function download(blob: Blob) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (format === "csv") {
    const safe = (v: unknown) => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    download(
      new Blob(
        [
          "\ufeff" +
            [headers, ...data].map((r) => r.map(safe).join(";")).join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
  }
  if (format === "xlsx") {
    const { Workbook } = await import("exceljs");
    const book = new Workbook(),
      sheet = book.addWorksheet("Lançamentos");
    sheet.addRow(headers);
    data.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF142B42" },
    };
    sheet.columns.forEach(
      (c, i) => (c.width = i === 1 ? 28 : 18),
    );
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "K1" };
    download(
      new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
  }
  if (format === "pdf") {
    const [{ jsPDF }, { autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const pdf = new jsPDF({ orientation: "landscape" });
    pdf.setFontSize(20);
    pdf.text("HoraCerta | Relatório de jornada", 14, 18);
    pdf.setFontSize(10);
    pdf.text(
      period + " · Valores estimados · Moeda: " + state.settings.currency,
      14,
      26,
    );
    autoTable(pdf, {
      startY: 33,
      head: [headers],
      body: data.map((r) => r.map(String)),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [20, 43, 66] },
      didDrawPage: () => {
        pdf.setFontSize(8);
        pdf.text(
          "Gerado em " + new Date().toLocaleString("pt-BR"),
          14,
          pdf.internal.pageSize.height - 7,
        );
      },
    });
    download(pdf.output('blob'));
  }
}
