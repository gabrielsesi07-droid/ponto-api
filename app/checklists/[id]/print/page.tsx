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
  return <main className="check-print"><div className="print-toolbar"><ChecklistPrintButton /><p>Impressão dos dados salvos. No diálogo de impressão, escolha A4 e, se quiser um arquivo, “Salvar como PDF”.</p></div>
    <header><div><b>HoraCerta · Conferência de equipamentos</b><h1>{c.title}</h1></div><div className="print-number">{orderNumber(o.number)}<small>Preenchimento rev. {c.version}</small></div></header>
    <p className="print-status">{c.status === 'completed' ? 'CONFERÊNCIA CONCLUÍDA' : 'EM PREENCHIMENTO — ITENS NÃO MARCADOS ESTÃO PENDENTES'}{c.detached ? ' · EQUIPAMENTO REMOVIDO DA OS — HISTÓRICO' : ''}{o.status === 'Cancelada' ? ' · OS CANCELADA' : ''}</p>
    {c.source_obsolete && <p className="print-warning">ATENÇÃO: documento de origem marcado como obsoleto. Consulte o coordenador antes de utilizar.</p>}
    {c.source_review_pending && <p className="print-warning">Lista importada do documento do equipamento, sem aprovação técnica do procedimento. Confira a adequação dos itens ao serviço.</p>}
    <section className="print-meta"><div><b>Cliente</b>{o.client_name}</div><div><b>Serviço</b>{o.title}</div><div><b>Equipamento / modelo</b>{c.model_name}</div><div><b>Identificação da unidade</b>{c.identification || '________________________________'}</div><div><b>Início previsto</b>{when(o.starts_at)}</div><div><b>Término previsto</b>{when(o.ends_at)}</div><div><b>Equipe designada</b>{o.team_names}</div><div><b>Veículo</b>{o.vehicle || 'Não informado'}</div><div className="wide"><b>Local do atendimento</b>{o.address || 'Não informado'}</div></section>
    <table><thead><tr><th>Item / descrição</th><th>Prev.</th><th>Ida ✓</th><th>Qtd. ida</th><th>Volta ✓</th><th>Qtd. volta</th><th>Observações</th></tr></thead><tbody>{c.items.map((i, index) => <tr key={i.id}><td>{index + 1}. {i.label}</td><td>{i.planned ?? '—'}</td><td>{i.na ? 'N/A' : <span className="paper-box">{i.outgoing ? '✓' : ''}</span>}</td><td>{i.na ? '—' : i.outgoing_qty ?? ''}</td><td>{i.na ? 'N/A' : <span className="paper-box">{i.incoming ? '✓' : ''}</span>}</td><td>{i.na ? '—' : i.incoming_qty ?? ''}</td><td>{i.notes || ' '}</td></tr>)}</tbody></table>
    {!c.items.length && <p>Checklist sem itens cadastrados.</p>}
    <section className="print-notes"><b>Observações gerais</b><p>{c.notes || '________________________________________________________________________________'}</p></section>
    <section className="print-signatures"><div>________________________________<br />Responsável pela entrega<br />Data: ____/____/______ Hora: ____:____</div><div>________________________________<br />Responsável pela devolução<br />Data: ____/____/______ Hora: ____:____</div></section>
    <footer><p>Origem: {c.source_name || 'Checklist personalizado na OS'}{c.template_version ? ` · padrão v${c.template_version}` : ''}. Cópia adaptável da OS; não substitui o documento SGQ original.</p><p>Última alteração: {c.updated_by_name} · {when(c.updated_at)}{c.completed_at ? ` · Concluído por ${c.completed_by_name} em ${when(c.completed_at)}` : ''}.</p><p>Emitido em {when(new Date().toISOString())} · Identificador: {c.id}</p></footer>
  </main>;
}
