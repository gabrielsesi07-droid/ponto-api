export type EquipmentModel = {
  id: string; name: string; family: string; status: 'pending' | 'published' | 'archived'; version: number;
  document_count?: number;
  checklist_status?: 'draft' | 'imported' | 'active' | 'archived' | null;
  checklist_source?: string | null;
  checklist_items?: number;
  checklist_ready?: boolean;
};
export function equipmentChecklistLabel(model: EquipmentModel) {
  if (model.checklist_ready) return model.checklist_status === 'imported' ? 'Referência importada · disponível na OS' : 'Checklist ativo';
  if (model.checklist_status === 'draft') return 'Rascunho · ainda não acompanha a OS';
  if (model.checklist_status === 'archived') return 'Checklist desativado';
  if (model.checklist_status) return 'Checklist indisponível · revisar origem ou itens';
  return 'Sem checklist atribuído';
}
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
