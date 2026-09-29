export type EquipmentModel = {
  id: string; name: string; family: string; status: 'pending' | 'published' | 'archived'; version: number;
  document_count?: number;
};
export type LibraryDocument = {
  id: string; name: string; extension: string; size: number;
  category: 'checklist' | 'catalog' | 'manual'; status: 'pending' | 'published' | 'archived';
  obsolete: boolean; warnings: string[]; section_count: number; chunk_count: number;
  version: number; sha256: string; models: EquipmentModel[];
  origins?: { path: string; category: string; obsolete: boolean }[];
};
export const documentCategories = { checklist: 'Checklists e formulários', catalog: 'Catálogos', manual: 'Manuais e procedimentos' };
export const reviewLabels = { pending: 'Revisão pendente', published: 'Liberado para equipe', archived: 'Arquivado' };
// Selecting a catalogue model is not approval of its documents or checklist.
export function selectableModels(models: EquipmentModel[], selected: string[]) {
  return models.filter(model => model.status !== 'archived' || selected.includes(model.id));
}
export function normalizeSearch(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
