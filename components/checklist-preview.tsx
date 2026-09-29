"use client";
import { useEffect, useState } from 'react';
import { ChecklistItems, ChecklistTemplateEditor } from './checklist-editor';
import { Button } from './ui/button';
import type { ChecklistItem } from '@/lib/checklists';
export type ChecklistDraft = { model_id: string; template_version: number; title: string; items: ChecklistItem[] };
type Preview = { model_id: string; name: string; template_version: number; title: string; items: ChecklistItem[]; status: string | null; source_obsolete: boolean };
export function ChecklistPreview({ modelIds, drafts, onChange, existing, demo }: {
  modelIds: string[]; drafts: ChecklistDraft[]; onChange: (drafts: ChecklistDraft[]) => void; existing: boolean; demo: boolean;
}) {
  const [models, setModels] = useState<Preview[]>([]), [error, setError] = useState(''), [editor, setEditor] = useState(''), [revision, setRevision] = useState(0);
  const key = modelIds.join(',');
  useEffect(() => {
    if (!key || demo) return;
    const controller = new AbortController();
    fetch('/api/checklists/preview?models=' + encodeURIComponent(key), { signal: controller.signal }).then(async res => {
      const out = await res.json() as { models: Preview[]; error?: string };
      if (!res.ok) throw new Error(out.error);
      if (!controller.signal.aborted) { setModels(out.models); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [key, demo, revision]);
  if (!key || demo) return null;
  return <div className="full space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
    <h3 className="font-semibold">Checklists automáticos</h3>
    <p className="text-xs text-slate-600">{existing ? 'Novos equipamentos recebem seu checklist ativo ao salvar. Conferências existentes são preservadas; edite-as na tela da OS.' : 'Ao salvar a OS, os checklists ativos serão copiados para ela. Equipamentos sem padrão ativo também podem ser usados; revise o padrão aqui ou crie uma lista depois.'}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}<button type="button" className="ml-2 underline" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></p>}
    {modelIds.some(id => !models.some(m => m.model_id === id)) && !error && <p role="status" className="text-sm">Buscando checklists dos equipamentos…</p>}
    {models.filter(m => modelIds.includes(m.model_id)).map(m => {
      const draft = drafts.find(d => d.model_id === m.model_id), active = m.status === 'active' && !m.source_obsolete;
      return <div className="rounded-lg border bg-white p-3" key={m.model_id}>
        <b className="text-sm">{m.name}</b>
        {active ? <>
          <p className="mt-1 text-xs text-blue-800">{m.title} · padrão v{m.template_version} · {draft?.items.length ?? m.items.length} itens</p>
          {!existing && <details className="mt-2"><summary className="cursor-pointer rounded-lg border bg-slate-50 p-3 text-sm font-medium">Marcar ou personalizar o checklist desta OS</summary><div className="mt-3"><ChecklistItems items={draft?.items || m.items} onChange={items => onChange([...drafts.filter(d => d.model_id !== m.model_id), { model_id: m.model_id, template_version: draft?.template_version || m.template_version, title: draft?.title || m.title, items }])} /></div></details>}
          {draft && draft.template_version !== m.template_version && <p className="mt-2 text-sm text-red-700">O padrão mudou. Refaça a seleção deste equipamento antes de salvar.</p>}
        </> : <><p className="mt-1 text-xs text-amber-900">{m.source_obsolete ? 'A origem está obsoleta. Configure um padrão válido.' : 'Sem checklist ativo. Você pode configurar agora ou criar uma lista personalizada depois de salvar a OS.'}</p><Button type="button" variant="outline" className="mt-2" onClick={() => setEditor(m.model_id)}>Configurar checklist padrão</Button></>}
      </div>;
    })}
    {editor && <ChecklistTemplateEditor modelId={editor} onClose={() => setEditor('')} onSaved={() => setRevision(n => n + 1)} />}
  </div>;
}
