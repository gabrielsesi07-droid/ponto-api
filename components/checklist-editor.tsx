"use client";
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, CheckCheck, Printer, ClipboardList, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { api } from './editors';
import { toast } from 'sonner';
import { checklistProgress, newChecklistItem, type ChecklistItem, type ChecklistTemplate, type OrderChecklist } from '@/lib/checklists';

export function ChecklistItems({ items, onChange, template = false, disabled = false }: {
  items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void; template?: boolean; disabled?: boolean;
}) {
  function update(id: string, patch: Partial<ChecklistItem>) { onChange(items.map(i => i.id === id ? { ...i, ...patch } : i)); }
  function move(index: number, delta: number) {
    const next = [...items]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onChange(next);
  }
  return <div className="space-y-3">
    {items.map((item, index) => <fieldset disabled={disabled} key={item.id} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${item.na ? 'bg-slate-100' : 'bg-white'}`}>
      <legend className="px-1 text-xs font-semibold text-slate-500">Item {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <label className="text-sm font-medium">Descrição<input className="check-input" aria-label={`Descrição do item ${index + 1}`} value={item.label} maxLength={200} onChange={e => update(item.id, { label: e.target.value })} placeholder="Ex.: cabo de comunicação" /></label>
        <label className="text-sm font-medium">Qtd. prevista<input className="check-input" aria-label={`Quantidade prevista do item ${index + 1}`} type="number" min={0} max={100000} step="any" value={item.planned ?? ''} placeholder="A definir" onChange={e => update(item.id, { planned: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>
      {!template && <>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['outgoing', 'incoming'] as const).map(stage => <div key={stage} className="rounded-lg border bg-slate-50 p-3">
            <label className="flex min-h-10 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-blue-600" disabled={item.na || disabled} checked={item[stage]} aria-label={`${stage === 'outgoing' ? 'Ida' : 'Volta'} conferida do item ${index + 1}`} onChange={e => update(item.id, { [stage]: e.target.checked, [stage + '_qty']: e.target.checked ? (stage === 'outgoing' ? item.outgoing_qty ?? item.planned : item.incoming_qty ?? item.outgoing_qty) : item[stage === 'outgoing' ? 'outgoing_qty' : 'incoming_qty'] })} />{stage === 'outgoing' ? 'Ida / entrega conferida' : 'Volta / devolução conferida'}</label>
            <label className="text-xs text-slate-600">Quantidade {stage === 'outgoing' ? 'entregue' : 'devolvida'}<input className="check-input" aria-label={`${stage === 'outgoing' ? 'Quantidade entregue' : 'Quantidade devolvida'} do item ${index + 1}`} disabled={item.na || disabled} type="number" min={0} max={100000} step="any" value={item[stage === 'outgoing' ? 'outgoing_qty' : 'incoming_qty'] ?? ''} onChange={e => update(item.id, { [stage + '_qty']: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          </div>)}
        </div>
        <label className="mt-3 flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={item.na} onChange={e => update(item.id, { na: e.target.checked })} />Não se aplica a este serviço</label>
        <label className="block text-sm">Observações do item<textarea className="check-input min-h-16" maxLength={500} value={item.notes} onChange={e => update(item.id, { notes: e.target.value })} placeholder="Avaria, falta, diferença de quantidade ou motivo de não se aplicar." /></label>
      </>}
      {!disabled && <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover item ${index + 1} para cima`}><ArrowUp size={15} /></Button>
        <Button type="button" size="sm" variant="outline" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Mover item ${index + 1} para baixo`}><ArrowDown size={15} /></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(items.filter(i => i.id !== item.id))}><Trash2 size={15} />Remover item {index + 1}</Button>
      </div>}
    </fieldset>)}
    {!disabled && <Button type="button" variant="outline" disabled={items.length >= 80} onClick={() => onChange([...items, newChecklistItem()])}><Plus size={18} />Adicionar item</Button>}
  </div>;
}

type TemplateData = { model: { id: string; name: string }; template: ChecklistTemplate | null;
  sources: { id: string; name: string }[]; suggested: ChecklistItem[] | null };
export function ChecklistTemplateEditor({ modelId, onClose, onSaved }: { modelId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<TemplateData | null>(null), [error, setError] = useState('');
  const [title, setTitle] = useState(''), [source, setSource] = useState(''), [items, setItems] = useState<ChecklistItem[]>([]);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/checklists/templates?model=' + modelId, { signal: controller.signal }).then(async res => {
      const out = await res.json() as TemplateData & { error?: string };
      if (!res.ok) throw new Error(out.error);
      if (controller.signal.aborted) return;
      setData(out); setTitle(out.template?.title || 'Checklist — ' + out.model.name); setSource(out.template?.source_document_id || ''); setItems(out.template?.items || []);
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [modelId]);
  function changeItems(next: ChecklistItem[]) { setItems(next); setDirty(true); setConfirmed(false); }
  async function importItems() {
    if (items.length && !window.confirm('Substituir os itens deste rascunho pelos itens sugeridos do documento?')) return;
    setBusy(true); setError('');
    try {
      const out = await api<TemplateData>(`/api/checklists/templates?model=${modelId}&source=${source}`);
      if (!out.suggested?.length) throw new Error('Não identifiquei uma tabela de itens segura. Monte a lista manualmente usando o original.');
      changeItems(out.suggested);
      toast.success('Sugestão importada. Confira os itens e quantidades antes de ativar.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save(status: ChecklistTemplate['status']) {
    setBusy(true); setError('');
    try {
      await api('/api/checklists/templates', { model_id: modelId, version: data?.template?.version || 0, title, source_document_id: source || null, items, status });
      toast.success(status === 'active' ? 'Checklist ativado e equipamento validado para novas OS.' : 'Modelo salvo.'); onSaved(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!dirty || window.confirm('Sair sem salvar as alterações do checklist padrão?'))) onClose(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Checklist padrão · {data?.model.name || 'Carregando…'}</DialogTitle><DialogDescription>Usado nas próximas OS. Cópias já criadas não serão alteradas. Versão {data?.template?.version || 0}.</DialogDescription></DialogHeader>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {data && <fieldset disabled={busy} className="min-w-0 space-y-4">
        <label className="block text-sm font-medium">Título<input className="check-input" maxLength={180} value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} /></label>
        <label className="block text-sm font-medium">Documento de referência<select className="check-input" value={source} onChange={e => { setSource(e.target.value); setDirty(true); setConfirmed(false); }}><option value="">Checklist próprio, sem documento de origem</option>{data.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{source && !data.sources.some(s => s.id === source) && <option value={source}>{data.template?.source_name} (verifique a origem)</option>}</select></label>
        <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={!source || busy} onClick={() => void importItems()}>Importar sugestão de itens do documento</Button>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Confira o original na Biblioteca. A sugestão remove datas, OS, comentários e números de série preenchidos. Não substitui a validação técnica nem garante compatibilidade com o equipamento.</p>
        <ChecklistItems items={items} onChange={changeItems} template />
        <label className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-4 shrink-0" />Conferi o equipamento, a revisão do documento, os itens e as quantidades. Este checklist pode ser usado pela equipe nas OS.</label>
        <p className="text-xs text-slate-600">Salvar como rascunho ou desativar interrompe o vínculo automático em novas OS. Cópias de serviços anteriores ficam preservadas.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={!confirmed || !items.length || busy} onClick={() => void save('active')}><CheckCheck size={18} />Ativar checklist e validar equipamento</Button><Button type="button" variant="outline" onClick={() => void save('draft')}><Save size={18} />Salvar rascunho</Button>{data.template && <Button type="button" variant="outline" onClick={() => void save('archived')}>Desativar padrão</Button>}</div>
      </fieldset>}
    </DialogContent>
  </Dialog>;
}

export function OrderChecklistEditor({ checklist, admin, closed, onClose, onSaved }: { checklist: OrderChecklist; admin: boolean; closed: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(checklist.title), [items, setItems] = useState(checklist.items);
  const [notes, setNotes] = useState(checklist.notes), [identification, setIdentification] = useState(checklist.identification);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reason, setReason] = useState('');
  const readOnly = closed || checklist.detached || checklist.status === 'completed';
  const progress = checklistProgress(items);
  async function save(action: 'save' | 'complete' | 'reopen') {
    setBusy(true); setError('');
    try { await api('/api/checklists', { action, id: checklist.id, version: checklist.version, title, items, notes, identification, reason });
      toast.success(action === 'complete' ? 'Checklist concluído.' : 'Checklist salvo.'); onSaved(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!dirty || window.confirm('Sair sem salvar este checklist da OS?'))) onClose(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{checklist.model_name} · conferência</DialogTitle><DialogDescription>Cópia exclusiva desta OS. Editar aqui não altera o catálogo. {checklist.status === 'completed' ? 'Concluído.' : 'Em preenchimento.'}</DialogDescription></DialogHeader>
      <p className="rounded-lg bg-blue-50 p-3 text-sm">Ida: {progress.outgoing}/{progress.total} · Volta: {progress.incoming}/{progress.total}. Salve para compartilhar as alterações com a equipe.</p>
      {checklist.source_obsolete && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">A origem foi marcada como obsoleta. Consulte o coordenador antes de utilizar este checklist.</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <fieldset disabled={readOnly || busy} className="min-w-0 space-y-3">
        <label className="block text-sm">Título<input className="check-input" value={title} maxLength={180} onChange={e => { setTitle(e.target.value); setDirty(true); }} /></label>
        <label className="block text-sm">Identificação deste equipamento (opcional)<input className="check-input" value={identification} maxLength={160} placeholder="Número de série ou patrimônio desta unidade" onChange={e => { setIdentification(e.target.value); setDirty(true); }} /></label>
        <ChecklistItems items={items} disabled={readOnly || busy} onChange={next => { setItems(next); setDirty(true); }} />
        <label className="block text-sm">Observações gerais<textarea className="check-input" maxLength={3000} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} /></label>
      </fieldset>
      <p className="text-xs text-slate-500">{checklist.source_name ? `Referência: ${checklist.source_name} · versão do checklist padrão ${checklist.template_version}` : 'Checklist personalizado nesta OS.'} · Revisão do preenchimento {checklist.version}</p>
      <div className="flex flex-wrap gap-2">
        {!readOnly && <><Button disabled={busy} onClick={() => void save('save')}><Save size={18} />Salvar conferência</Button><Button disabled={busy} variant="outline" onClick={() => void save('complete')}><CheckCheck size={18} />Concluir ida e volta</Button></>}
        {!dirty && <Button variant="outline" asChild><a href={`/checklists/${checklist.id}/print`} target="_blank" rel="noopener noreferrer"><Printer size={18} />Imprimir / salvar PDF</a></Button>}
      </div>
      {dirty && <p className="text-xs text-amber-800">Salve antes de imprimir. Somente os dados salvos entram no relatório.</p>}
      {admin && !closed && !checklist.detached && checklist.status === 'completed' && <div className="space-y-2 border-t pt-3"><label className="text-sm">Motivo da reabertura<input className="check-input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><Button disabled={busy || reason.trim().length < 3} variant="outline" onClick={() => void save('reopen')}>Reabrir para correção</Button></div>}
    </DialogContent>
  </Dialog>;
}

type OrderData = { checklists: OrderChecklist[]; models: { id: string; name: string; template_title: string | null }[];
  history: { id: number; action: string; name: string; created_at: string }[] };
export function OrderChecklists({ orderId, admin, closed, demo }: { orderId: string; admin: boolean; closed: boolean; demo: boolean }) {
  const [data, setData] = useState<OrderData | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<OrderChecklist | null>(null);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch('/api/checklists?order=' + orderId, { signal: controller.signal }).then(async res => {
      const out = await res.json() as OrderData & { error?: string };
      if (!res.ok) throw new Error(out.error);
      if (!controller.signal.aborted) { setData(out); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [orderId, demo, revision]);
  async function attach(action: 'sync' | 'custom', model_id?: string) {
    setBusy(true);
    try { await api('/api/checklists', { action, order_id: orderId, model_id }); setRevision(n => n + 1); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (demo) return <p className="text-sm text-slate-500">Checklists digitais disponíveis ao entrar com seu acesso.</p>;
  return <section className="space-y-3 rounded-xl border p-4">
    <h3 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} />Checklists dos equipamentos</h3>
    <p className="text-sm text-slate-600">Confira a ida e a volta, ajuste os itens necessários e imprima a cópia desta OS.</p>
    {!closed && data?.checklists.some(c => !c.detached && c.status === 'open') && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Conclua os checklists vinculados antes de encerrar a OS. Diferenças de quantidade precisam de observação.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}<button className="ml-2 underline" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></p>}
    {!data && !error && <p role="status" className="text-sm">Carregando checklists…</p>}
    {data?.checklists.map(c => { const progress = checklistProgress(c.items); return <div key={c.id} className="rounded-lg border bg-slate-50 p-3">
      <b className="text-sm">{c.model_name}</b><p className="mt-1 text-xs text-slate-600">{c.detached ? 'Equipamento removido da OS · histórico preservado' : c.status === 'completed' ? 'Concluído' : `Ida ${progress.outgoing}/${progress.total} · Volta ${progress.incoming}/${progress.total}`} · rev. {c.version}</p>
      <p className="mt-1 text-xs text-slate-500">Última alteração: {c.updated_by_name} · {new Date(c.updated_at).toLocaleString('pt-BR')}</p>
      <Button className="mt-3" variant="outline" onClick={() => setSelected(c)}>{closed || c.detached || c.status === 'completed' ? 'Consultar e imprimir' : 'Abrir checklist'}</Button>
    </div>; })}
    {data?.models.filter(m => !data.checklists.some(c => c.model_id === m.id)).map(m => <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" key={m.id}><b>{m.name}</b><p className="mt-1">{m.template_title ? 'Existe checklist padrão disponível para vincular.' : 'Sem checklist ativo. O coordenador pode configurar o padrão em Equipamentos ou criar uma lista só para esta OS.'}</p>{admin && !closed && <Button disabled={busy} className="mt-2" variant="outline" onClick={() => void attach(m.template_title ? 'sync' : 'custom', m.id)}>{m.template_title ? 'Vincular checklist padrão' : 'Criar checklist nesta OS'}</Button>}</div>)}
    {data && !data.models.length && !data.checklists.length && <p className="text-sm text-slate-500">Selecione um modelo do catálogo ao cadastrar ou editar a OS para vincular seu checklist.</p>}
    {!!data?.history.length && <details className="border-t pt-2 text-xs"><summary className="cursor-pointer py-2 font-semibold">Histórico de conferências</summary>{data.history.map(h => <p className="mb-2" key={h.id}>{h.action} · {h.name} · {new Date(h.created_at).toLocaleString('pt-BR')}</p>)}</details>}
    {selected && <OrderChecklistEditor checklist={selected} admin={admin} closed={closed} onClose={() => setSelected(null)} onSaved={() => setRevision(n => n + 1)} />}
  </section>;
}
