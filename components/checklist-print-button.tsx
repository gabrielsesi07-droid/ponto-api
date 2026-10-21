"use client";
export function ChecklistPrintButton() {
  return <button className="print-action" type="button" onClick={() => window.print()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a1 1 0 0 1-1 1h-3" /><path d="M7 13h10v8H7zM17 11h.01" /></svg>Imprimir ou salvar PDF</button>;
}
