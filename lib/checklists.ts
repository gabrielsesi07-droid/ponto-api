import { z } from 'zod';

export const checklistItemSchema = z.object({
  id: z.string().uuid(), label: z.string().trim().min(1, 'Descreva cada item.').max(200),
  planned: z.number().min(0).max(100000).nullable().default(null),
  outgoing: z.boolean().default(false), incoming: z.boolean().default(false),
  outgoing_qty: z.number().min(0).max(100000).nullable().default(null),
  incoming_qty: z.number().min(0).max(100000).nullable().default(null),
  na: z.boolean().default(false), notes: z.string().trim().max(500).default(''),
});
export const checklistItemsSchema = z.array(checklistItemSchema).max(80).refine(items => new Set(items.map(i => i.id)).size === items.length, 'Há identificadores de item repetidos.');
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export function plannedChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.map(item => ({ ...item, outgoing: false, incoming: false, outgoing_qty: null, incoming_qty: null, na: false, notes: '' }));
}
export type ChecklistTemplate = { id: string; model_id: string; title: string; items: ChecklistItem[]; source_document_id: string | null;
  source_name: string; source_hash: string; status: 'draft' | 'imported' | 'active' | 'archived'; version: number };
export type OrderChecklist = { id: string; order_id: string; model_id: string; model_name: string; template_version: number | null;
  title: string; source_name: string; source_hash: string; source_obsolete?: boolean; source_review_pending?: boolean; items: ChecklistItem[];
  notes: string; identification: string; version: number; status: 'open' | 'completed' | 'waived';
  waived_reason?: string | null; waived_at?: string | null; waived_by_name?: string | null;
  assigned_to?: string | null; assigned_to_name?: string | null; assigned_by_name?: string | null;
  assigned_at?: string | null; assignment_reason?: string | null; can_edit?: boolean;
  updated_at: string; updated_by_name: string; completed_at: string | null; completed_by_name: string | null; detached: boolean };
export const newChecklistItem = (): ChecklistItem => ({ id: crypto.randomUUID(), label: '', planned: null,
  outgoing: false, incoming: false, outgoing_qty: null, incoming_qty: null, na: false, notes: '' });
export function checklistProgress(items: ChecklistItem[]) {
  return { total: items.length, outgoing: items.filter(i => i.na || i.outgoing).length, incoming: items.filter(i => i.na || i.incoming).length };
}
export function checklistProblems(items: ChecklistItem[]) {
  if (!items.length) return ['Adicione pelo menos um item.'];
  return items.flatMap(i => {
    if (i.na) return i.notes.trim() ? [] : [`${i.label}: justifique o “não se aplica”.`];
    if (!i.outgoing || !i.incoming) return [`${i.label}: confira a ida e a volta.`];
    if (i.outgoing_qty === null || i.incoming_qty === null) return [`${i.label}: informe as quantidades conferidas.`];
    if ((i.incoming_qty !== i.outgoing_qty || (i.planned !== null && i.outgoing_qty !== i.planned)) && !i.notes.trim())
      return [`${i.label}: descreva a diferença de quantidade nas observações.`];
    return [];
  });
}

export function checklistCompletionIssues(items: ChecklistItem[]) {
  return items.flatMap((item, index) => checklistProblems([item]).map(message => ({ itemId: item.id, index: index + 1, message })));
}

// Only recognized item tables are candidates. Never import old dates, signatures,
// comments, filled checkmarks, OS numbers or physical serial numbers as defaults.
export function suggestChecklistItems(sections: { content: string }[], uuid: () => string): ChecklistItem[] {
  let inTable = false;
  const items: ChecklistItem[] = [];
  for (const section of sections) {
    const cells = section.content.split('|').map(s => s.trim());
    const normalized = section.content.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/^itens?\b/.test(normalized) && /qtd|quantidade/.test(normalized)) { inTable = true; continue; }
    if (!inTable || cells.length < 3 || !cells[0]) continue;
    if (/assinatura|responsavel|recebido por|entregue por|^data\b/i.test(normalized)) { inTable = false; continue; }
    const label = cells[0].replace(/\b(?:SN|S\/N|PN|P\/N)\b\s*[:#]?\s*[\w-]+|\bserial\s*[:#]\s*[\w-]+/gi, '').trim().slice(0, 200);
    if (!label) continue;
    const number = /^\d+(?:[,.]\d+)?$/.test(cells[1]) ? Number(cells[1].replace(',', '.')) : null;
    items.push({ id: uuid(), label, planned: number !== null && number <= 100000 ? number : null,
      outgoing: false, incoming: false, outgoing_qty: null, incoming_qty: null, na: false, notes: '' });
  }
  return items.slice(0, 80);
}
