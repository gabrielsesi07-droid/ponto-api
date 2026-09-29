"use client";
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Search, Download, ShieldCheck, Archive, FileText, LoaderCircle, Wrench } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { api } from './editors';
import { toast } from 'sonner';
import { ChecklistTemplateEditor } from './checklist-editor';
import { documentCategories, reviewLabels, type EquipmentModel, type LibraryDocument } from '@/lib/library';

type Section = { position: number; locator: string; content: string };
type LibraryData = { documents: LibraryDocument[]; models: EquipmentModel[]; total: number;
  recent: { created_at: string; finished_at: string | null; summary: { documents?: number; obsolete?: number; no_text?: number; source_errors?: number; failed?: boolean } } | null };
const sizeLabel = (size: number) => size < 104858 ? Math.max(1, Math.round(size / 1024)) + ' KB' : (size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';

async function downloadOriginal(doc: LibraryDocument, progress: (value: string) => void) {
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < doc.chunk_count; i++) {
    progress(`Baixando ${i + 1}/${doc.chunk_count}…`);
    const res = await fetch(`/api/library/${doc.id}/file?part=${i}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível baixar. Verifique seu acesso e tente novamente.');
    parts.push(await res.arrayBuffer());
  }
  const blob = new Blob(parts, { type: 'application/octet-stream' });
  if (blob.size !== doc.size) throw new Error('Arquivo incompleto. Tente novamente.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== doc.sha256) throw new Error('O arquivo recebido não passou pela verificação de integridade.');
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = doc.name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DocumentReader({ doc, models, admin, close, refreshed }: {
  doc: LibraryDocument; models: EquipmentModel[]; admin: boolean; close: () => void; refreshed: () => void;
}) {
  const [details, setDetails] = useState<LibraryDocument | null>(null);
  const [sections, setSections] = useState<Section[]>([]), [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const [modelIds, setModelIds] = useState(doc.models.map(m => m.id));
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/library/${doc.id}?offset=${offset}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => {
        const out = await res.json() as { error?: string; document: LibraryDocument; sections: Section[] };
        if (!res.ok) throw new Error(out.error || 'Não foi possível abrir o documento.');
        if (!controller.signal.aborted) { setDetails(out.document); setSections(out.sections); }
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [doc.id, offset]);
  async function review(status: LibraryDocument['status']) {
    setBusy(true);
    try {
      await api('/api/library', { kind: 'document', id: doc.id,
        version: details?.version || doc.version, status, model_ids: modelIds });
      toast.success('Revisão salva.'); refreshed(); close();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="pr-6 break-words">{doc.name}</DialogTitle>
        <DialogDescription>Documento original preservado · {sizeLabel(doc.size)} · {reviewLabels[doc.status]}</DialogDescription>
      </DialogHeader>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Texto extraído para consulta. Desenhos, fotos, campos e fórmulas podem não aparecer corretamente aqui. Use o original para executar o procedimento.
        {doc.obsolete && <strong className="mt-2 block">OBSOLETO — NÃO UTILIZAR em serviços.</strong>}
        {doc.warnings.map((w, i) => <p className="mt-2" key={i}>{w}</p>)}
      </div>
      <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await downloadOriginal(doc, setProgress); }
        catch (e) { toast.error((e as Error).message); }
        finally { setBusy(false); setProgress(''); }
      }}><Download size={18} />{progress || 'Baixar original'}</Button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p role="status" className="flex gap-2"><LoaderCircle className="animate-spin" />Carregando texto…</p>
        : <div className="space-y-4">{sections.length ? sections.map(s => <section className="rounded-lg bg-slate-50 p-3" key={s.position}>
          <h3 className="mb-2 text-xs font-semibold text-blue-800">{s.locator}</h3>
          <p className="whitespace-pre-wrap break-words text-sm">{s.content}</p>
        </section>) : <p>Sem texto pesquisável. Baixe o original para consultar.</p>}</div>}
      {doc.section_count > 20 && <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={loading || offset === 0} onClick={() => { setLoading(true); setError(''); setOffset(o => Math.max(0, o - 20)); }}>Anterior</Button>
        <span className="text-xs">Trechos {offset + 1}–{Math.min(offset + 20, doc.section_count)} de {doc.section_count}</span>
        <Button variant="outline" disabled={loading || offset + 20 >= doc.section_count} onClick={() => { setLoading(true); setError(''); setOffset(o => o + 20); }}>Próximos trechos</Button>
      </div>}
      {admin && <section className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Revisão do coordenador</h3>
        <p className="text-sm text-slate-600">Os vínculos abaixo são sugestões por nome do arquivo. Confira o modelo, a revisão e possíveis dados de clientes antes de liberar.</p>
        <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
          <legend className="px-1 text-sm">Modelos relacionados</legend>
          {models.map(m => <label className="flex min-h-10 items-center gap-3 text-sm" key={m.id}>
            <input type="checkbox" checked={modelIds.includes(m.id)} disabled={busy} onChange={e => setModelIds(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} />{m.name}
          </label>)}
        </fieldset>
        {details?.origins && <details className="text-xs"><summary className="cursor-pointer py-2 font-semibold">Origens e cópias encontradas</summary>
          {details.origins.map((origin, i) => <p className="my-2 break-all" key={i}>{origin.path}</p>)}
        </details>}
        {!doc.obsolete && <label className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm">
          <input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          Conferi o original, a revisão e os modelos; o conteúdo pode ser disponibilizado a todos os colaboradores cadastrados.
        </label>}
        <div className="flex flex-wrap gap-2">
          {!doc.obsolete && <Button disabled={busy || !confirmed || !details || !!error} onClick={() => void review('published')}><ShieldCheck size={18} />Liberar para equipe</Button>}
          <Button disabled={busy || !details} variant="outline" onClick={() => void review(doc.obsolete ? 'archived' : 'pending')}>Salvar em revisão</Button>
          <Button disabled={busy || !details} variant="outline" onClick={() => void review('archived')}><Archive size={18} />Arquivar</Button>
        </div>
      </section>}
    </DialogContent>
  </Dialog>;
}

export function TechnicalLibrary({ admin, demo = false, orderId, initialTab = 'documents' }: { admin: boolean; demo?: boolean; orderId?: string; initialTab?: 'documents' | 'models' }) {
  const [data, setData] = useState<LibraryData | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [q, setQ] = useState(''), [category, setCategory] = useState('');
  const [status, setStatus] = useState(''), [model, setModel] = useState(''), [page, setPage] = useState(1);
  const [tab, setTab] = useState<'documents' | 'models'>(initialTab);
  const [checklistModel, setChecklistModel] = useState('');
  const [selected, setSelected] = useState<LibraryDocument | null>(null), [revision, setRevision] = useState(0);
  const [busyModel, setBusyModel] = useState('');
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const params = new URLSearchParams({ q, category, status, page: String(page) });
        if (model) params.set('model', model);
        if (orderId) params.set('order', orderId);
        const res = await fetch('/api/library?' + params, { signal: controller.signal, cache: 'no-store' });
        const result = await res.json() as LibraryData & { error?: string };
        if (!res.ok) throw new Error(result.error || 'Não foi possível carregar a biblioteca.');
        if (!controller.signal.aborted) setData(result);
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [demo, q, category, status, model, page, orderId, revision]);
  async function reviewModel(m: EquipmentModel, next: EquipmentModel['status']) {
    setBusyModel(m.id);
    try {
      await api('/api/library', { kind: 'model', id: m.id, version: m.version, status: next });
      refresh(); toast.success('Modelo atualizado.');
    } catch (e) { toast.error((e as Error).message); } finally { setBusyModel(''); }
  }
  if (demo) return <div className="rounded-xl border bg-white p-5"><BookOpen className="mb-2" /><h2 className="font-semibold">Biblioteca técnica privada</h2><p className="mt-2 text-sm">Entre com seu acesso para consultar os materiais liberados. Documentos internos não aparecem na demonstração.</p></div>;
  return <section className="min-w-0 space-y-5" aria-label="Biblioteca técnica">
    {!orderId && <header className="rounded-2xl border bg-white p-5 sm:p-7">
      <span className="flex items-center gap-2 text-sm font-semibold text-blue-700"><BookOpen size={20} />CONHECIMENTO DA EQUIPE</span>
      <h2 className="mt-3 text-2xl font-bold">{initialTab === 'models' ? 'Catálogo e checklists padrão' : 'Biblioteca técnica'}</h2>
      <p className="mt-2 text-sm text-slate-600">Checklists, catálogos e manuais em um só lugar. Modelos de equipamento, sem controle de estoque físico.</p>
      {admin && data?.recent && <p className="mt-3 text-xs text-slate-600">Última importação: {new Date(data.recent.created_at).toLocaleString('pt-BR')}{data.recent.finished_at ? ` · ${data.recent.summary.documents || 0} documentos · ${data.recent.summary.obsolete || 0} obsoletos · ${data.recent.summary.no_text || 0} sem texto` : ' · Importação incompleta; contate o responsável'}. Atualizações das pastas exigem nova importação local.</p>}
    </header>}
    {!orderId && <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de consulta">
      <Button variant={tab === 'documents' ? 'default' : 'outline'} onClick={() => setTab('documents')}><FileText size={18} />Documentos</Button>
      <Button variant={tab === 'models' ? 'default' : 'outline'} onClick={() => setTab('models')}><Wrench size={18} />Modelos de equipamento</Button>
      <Button variant="outline" disabled={loading} onClick={refresh}>Atualizar biblioteca</Button>
    </div>}
    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}<Button className="ml-2" variant="outline" onClick={refresh}>Tentar novamente</Button></div>}
    {tab === 'documents' ? <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Buscar no conteúdo<div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3"><Search className="shrink-0 text-slate-400" size={18} /><input className="min-h-11 min-w-0 w-full bg-transparent outline-none" value={q} maxLength={120} placeholder="Modelo, termo ou documento…" onChange={e => { setQ(e.target.value); setPage(1); }} /></div></label>
        <label className="text-sm font-medium">Tipo<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Todos os tipos</option>{Object.entries(documentCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm font-medium">Modelo<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3" value={model} onChange={e => { setModel(e.target.value); setPage(1); }}><option value="">Todos os modelos</option>{data?.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {admin && <label className="text-sm font-medium">Revisão<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todas as situações</option>{Object.entries(reviewLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      </div>
      <p className="text-sm text-slate-600" role="status">{loading ? 'Buscando documentos…' : `${data?.total || 0} documento(s) encontrado(s)`}</p>
      {!loading && !error && data?.total === 0 && <div className="rounded-xl border border-dashed p-6 text-sm">{orderId ? 'Nenhum documento liberado para os modelos desta OS. O coordenador pode vincular modelos e revisar os materiais na Biblioteca.' : 'Nenhum documento com estes filtros. Materiais novos precisam ser liberados pelo coordenador.'}</div>}
      {!loading && !error && <div className={`grid gap-3 ${orderId ? '' : 'lg:grid-cols-2'}`}>
        {data?.documents.map(doc => <article key={doc.id} className="min-w-0 rounded-xl border bg-white p-4">
          <div className="flex items-start gap-3"><FileText className="mt-1 shrink-0 text-blue-600" size={22} /><div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{documentCategories[doc.category]} · {sizeLabel(doc.size)}</p>
            <h3 className="mt-1 break-words text-sm font-semibold">{doc.name}</h3>
            <p className={`mt-2 text-xs ${doc.obsolete ? 'font-bold text-red-700' : 'text-slate-600'}`}>{doc.obsolete ? 'Obsoleto — não utilizar' : reviewLabels[doc.status]}</p>
            {doc.models.length > 0 && <p className="mt-2 text-xs text-blue-700">{doc.models.map(m => m.name).join(' · ')}</p>}
            {!doc.section_count && <p className="mt-2 text-xs text-amber-800">Somente original · sem texto pesquisável</p>}
          </div></div>
          <Button className="mt-4 min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setSelected(doc)}><BookOpen size={16} />{admin && doc.status === 'pending' ? 'Abrir e revisar' : 'Consultar documento'}</Button>
        </article>)}
      </div>}
      {(data?.total || 0) > 24 && <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">{page} / {Math.ceil((data?.total || 0) / 24)}</span><Button variant="outline" disabled={loading || page * 24 >= (data?.total || 0)} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
    </> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data?.models.map(m => <article key={m.id} className="rounded-xl border bg-white p-4">
        <Wrench className="text-blue-600" size={22} /><h3 className="mt-3 font-bold">{m.name}</h3><p className="mt-1 text-sm text-slate-500">{m.family}</p>
        <p className="mt-3 text-xs">{m.document_count} documento(s) · {reviewLabels[m.status]}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setModel(m.id); setQ(''); setCategory(''); setStatus(''); setPage(1); setTab('documents'); }}>Ver documentos</Button>
          {admin && <Button onClick={() => setChecklistModel(m.id)}>Configurar checklist</Button>}
          {admin && <Button disabled={!!busyModel} variant={m.status === 'published' ? 'outline' : 'default'} onClick={() => void reviewModel(m, m.status === 'published' ? 'archived' : 'published')}>{m.status === 'published' ? 'Arquivar modelo' : 'Validar modelo'}</Button>}
        </div>
      </article>)}
    </div>}
    {selected && <DocumentReader key={selected.id} doc={selected} admin={admin} models={data?.models || []} close={() => setSelected(null)} refreshed={refresh} />}
    {checklistModel && <ChecklistTemplateEditor modelId={checklistModel} onClose={() => setChecklistModel('')} onSaved={refresh} />}
  </section>;
}

export function ModelPicker({ value, onChange, demo }: { value: string[]; onChange: (ids: string[]) => void; demo: boolean }) {
  const [models, setModels] = useState<EquipmentModel[]>([]), [message, setMessage] = useState(demo ? 'Catálogo privado indisponível na demonstração.' : 'Carregando modelos…');
  const [initialIds] = useState(value);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch('/api/library?status=published', { signal: controller.signal }).then(async res => {
      const out = await res.json() as { models: EquipmentModel[]; error?: string };
      if (!res.ok) throw new Error(out.error);
      if (!controller.signal.aborted) {
        setModels(out.models.filter((m: EquipmentModel) => m.status === 'published' || initialIds.includes(m.id)));
        setMessage('Valide modelos na Biblioteca para disponibilizá-los aqui. Não representa reserva de estoque.');
      }
    }).catch(() => { if (!controller.signal.aborted) setMessage('Catálogo indisponível. Você pode descrever o equipamento no campo abaixo.'); });
    return () => controller.abort();
  }, [demo, initialIds]);
  return <fieldset className="full rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">Modelos e documentos técnicos (opcional)</legend>
    <p className="mb-2 text-xs text-slate-600">{message}</p>
    <div className="max-h-44 overflow-y-auto">{models.map(m => <label key={m.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={value.includes(m.id)} onChange={e => onChange(e.target.checked ? [...value, m.id] : value.filter(id => id !== m.id))} />{m.name}{m.status !== 'published' ? ' (arquivado)' : ''}</label>)}</div>
  </fieldset>;
}
