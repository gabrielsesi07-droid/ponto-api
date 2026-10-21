import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { db, member } from '@/lib/server';
import { orderForChecklist } from '@/lib/checklist-server';
import { orderNumber } from '@/lib/orders';
import type { OrderChecklist } from '@/lib/checklists';
import { ChecklistPrintButton } from '@/components/checklist-print-button';
import './print.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checklist da OS · HoraCerta', robots: { index: false, follow: false } };
const when = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
export default async function PrintChecklist({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let me;
  try { me = await member(); } catch { redirect('/login'); }
  const [row] = await db()`SELECT c.*,u.name updated_by_name,fin.name completed_by_name,coalesce(d.obsolete,false) source_obsolete,
    NOT c.model_id=ANY(o.model_ids) detached FROM horacerta.order_checklists c JOIN horacerta.orders o ON o.id=c.order_id
    JOIN horacerta.users u ON u.id=c.updated_by LEFT JOIN horacerta.users fin ON fin.id=c.completed_by
    LEFT JOIN horacerta.library_documents d ON d.id=c.source_document_id WHERE c.id=${id}::uuid AND (${me.role === 'coordinator'} OR ${me.id}::uuid=ANY(o.members))`;
  if (!row) notFound();
  const c = row as OrderChecklist, o = await orderForChecklist(c.order_id, me);
  return <main className="check-print">
    <div className="print-toolbar">
      <div><span className="print-eyebrow">Documento para conferência</span><p>Dados salvos do checklist. Escolha A4 e “Salvar como PDF” no diálogo de impressão para baixar uma cópia.</p></div>
      <ChecklistPrintButton />
    </div>
    <header className="print-header">
      <div className="print-brand-row">
        <div className="print-brand"><span className="print-monogram" aria-hidden="true">hc</span><span><b>HoraCerta<span className="print-brand-dot">.</span></b><small>Gestão de jornada e operações</small></span></div>
        <span className="print-document-label">Conferência de equipamentos</span>
      </div>
      <div className="print-title-row"><div><p className="print-eyebrow">Checklist da ordem de serviço</p><h1>{c.title}</h1></div><div className="print-number"><span>Ordem de serviço</span><b>{orderNumber(o.number, o.official_number)}</b><small>Preenchimento rev. {c.version}</small></div></div>
    </header>
    <p className={`print-status print-status-${c.status}`}>{c.status === 'waived' ? 'CHECKLIST DISPENSADO — NÃO EQUIVALE A CONFERÊNCIA CONCLUÍDA' : c.status === 'completed' ? 'CONFERÊNCIA CONCLUÍDA' : 'EM PREENCHIMENTO — ITENS NÃO MARCADOS ESTÃO PENDENTES'}{c.detached ? ' · EQUIPAMENTO REMOVIDO DA OS — HISTÓRICO' : ''}{o.status === 'Cancelada' ? ' · OS CANCELADA' : ''}</p>
    {c.status === 'waived' && <p className="print-warning">Dispensado por {c.updated_by_name}{c.waived_at ? ` em ${when(c.waived_at)}` : ''}. Justificativa: {c.waived_reason}. Marcações preservadas do preenchimento anterior; não comprova devolução.</p>}
    {c.source_obsolete && <p className="print-warning">ATENÇÃO: documento de origem marcado como obsoleto. Consulte o coordenador antes de utilizar.</p>}
    {c.source_review_pending && <p className="print-warning">Lista importada do documento do equipamento, sem aprovação técnica do procedimento. Confira a adequação dos itens ao serviço.</p>}
    <section className="print-details" aria-labelledby="print-details-title"><h2 id="print-details-title" className="print-section-title"><span>01</span>Informações do atendimento</h2>
      <dl className="print-meta"><div><dt>Cliente</dt><dd>{o.client_name}</dd></div><div><dt>Serviço</dt><dd>{o.title}</dd></div><div><dt>Equipamento / modelo</dt><dd>{c.model_name}</dd></div><div><dt>Identificação da unidade</dt><dd>{c.identification || '________________________________'}</dd></div><div><dt>Início previsto</dt><dd className="print-mono">{when(o.starts_at)}</dd></div><div><dt>Término previsto</dt><dd className="print-mono">{when(o.ends_at)}</dd></div><div><dt>Equipe designada</dt><dd>{o.team_names}</dd></div><div><dt>Veículo</dt><dd>{o.vehicle || 'Não informado'}</dd></div><div className="wide"><dt>Local do atendimento</dt><dd>{o.address || 'Não informado'}</dd></div></dl>
    </section>
    <section className="print-items" aria-labelledby="print-items-title"><h2 id="print-items-title" className="print-section-title"><span>02</span>Conferência de ida e retorno<small>{c.items.length} {c.items.length === 1 ? 'item' : 'itens'}</small></h2>
      <p className="print-legend">✓ Conferido · N/A: não se aplica · Campos em branco: sem informação registrada</p>
      <table><caption>Itens e quantidades do checklist, com as conferências salvas de ida e retorno.</caption><colgroup><col className="print-col-item" /><col className="print-col-planned" /><col className="print-col-check" /><col className="print-col-quantity" /><col className="print-col-check" /><col className="print-col-quantity" /><col className="print-col-notes" /></colgroup><thead><tr><th rowSpan={2} scope="col">Item / descrição</th><th rowSpan={2} scope="col">Prev.</th><th colSpan={2} scope="colgroup">Ida</th><th colSpan={2} scope="colgroup">Retorno</th><th rowSpan={2} scope="col">Observações</th></tr><tr><th scope="col">Conf.</th><th scope="col">Qtd.</th><th scope="col">Conf.</th><th scope="col">Qtd.</th></tr></thead><tbody>{c.items.map((i, index) => <tr key={i.id}><th scope="row"><span className="print-item-number">{String(index + 1).padStart(2, '0')}</span>{i.label}</th><td className="print-cell-number">{i.planned ?? '—'}</td><td className="print-cell-check">{i.na ? 'N/A' : <span className="paper-box" aria-label={i.outgoing ? 'Ida conferida' : 'Ida pendente'}>{i.outgoing ? '✓' : ''}</span>}</td><td className="print-cell-number">{i.na ? '—' : i.outgoing_qty ?? ''}</td><td className="print-cell-check">{i.na ? 'N/A' : <span className="paper-box" aria-label={i.incoming ? 'Retorno conferido' : 'Retorno pendente'}>{i.incoming ? '✓' : ''}</span>}</td><td className="print-cell-number">{i.na ? '—' : i.incoming_qty ?? ''}</td><td>{i.notes || ' '}</td></tr>)}</tbody></table>
      {!c.items.length && <p className="print-empty">Checklist sem itens cadastrados.</p>}
    </section>
    <section className="print-notes" aria-labelledby="print-notes-title"><h2 id="print-notes-title" className="print-section-title"><span>03</span>Observações gerais</h2><p className={c.notes ? undefined : 'print-blank-notes'}>{c.notes || 'Sem observações registradas.'}</p></section>
    <section className="print-responsibles" aria-labelledby="print-responsibles-title"><h2 id="print-responsibles-title" className="print-section-title"><span>04</span>Registro de responsáveis</h2><p className="print-legend">Campos para preenchimento manual.</p><div className="print-signatures"><div><span className="print-signature-line" /><b>Responsável pela entrega</b><span>Data: ____/____/______ · Hora: ____:____</span></div><div><span className="print-signature-line" /><b>Responsável pela devolução</b><span>Data: ____/____/______ · Hora: ____:____</span></div></div></section>
    <footer className="print-footer"><p><b>Origem do checklist</b> {c.source_name || 'Checklist personalizado na OS'}{c.template_version ? ` · padrão v${c.template_version}` : ''}. Cópia adaptável da OS; não substitui o documento SGQ original.</p><p>Última alteração: {c.updated_by_name} · {when(c.updated_at)}{c.completed_at ? ` · Concluído por ${c.completed_by_name} em ${when(c.completed_at)}` : ''}.</p><div className="print-footer-meta"><span>Emitido em {when(new Date().toISOString())}</span><span className="print-document-id">Identificador: {c.id}</span></div></footer>
  </main>;
}
