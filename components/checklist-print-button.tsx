"use client";
export function ChecklistPrintButton() {
  return <button className="print-action" type="button" onClick={() => window.print()}>Imprimir ou salvar como PDF</button>;
}
