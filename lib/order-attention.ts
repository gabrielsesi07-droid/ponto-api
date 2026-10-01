import type { Order } from './orders';

type AttentionOrder = Pick<Order, 'status' | 'starts_at' | 'ends_at' | 'trips' | 'active_points' | 'pending_checklists' | 'team' | 'logged_members'>;
export const orderAttentionFilters = ['Todas', 'Pendências de encerramento', 'Sem horas registradas', 'Prazo previsto vencido'] as const;

const localDay = (value: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));

/** Operational facts only. Missing hours are a reminder, never a closeout blocker. */
export function orderAttention(order: AttentionOrder, day: string, now = Date.now(), admin = true) {
  const open = ['Agendada', 'Em andamento'].includes(order.status);
  const actionable = open || order.status === 'Cancelada';
  const scheduled = localDay(order.starts_at) > day;
  const missingHours = admin && order.logged_members !== undefined
    ? order.team.filter(person => !order.logged_members!.includes(person.id)) : [];
  const blockers: { id: string; label: string; action: string }[] = [];
  if (actionable) {
    if (Number(order.active_points) > 0) blockers.push({ id: 'points', label: `${order.active_points} ponto(s) sem encerramento`, action: 'Quem registrou deve encerrar o cronômetro antigo em Meu ponto ou preencher a saída no histórico; o coordenador pode corrigir o lançamento.' });
    const trips = order.trips.filter(trip => trip.return_km === null).length;
    if (trips) blockers.push({ id: 'vehicle', label: `${trips} viagem(ns) sem retorno`, action: 'Uma pessoa da equipe deve registrar a quilometragem de retorno nesta OS.' });
    if (Number(order.pending_checklists) > 0) blockers.push({ id: 'equipment', label: `${order.pending_checklists} checklist(s) pendente(s)`, action: order.status === 'Cancelada'
      ? 'Um colaborador designado deve conferir; o coordenador pode dispensar o checklist cancelado com justificativa.'
      : 'Um colaborador designado deve conferir a ida e a volta e finalizar o checklist pelo próprio acesso.' });
    if (order.active_points === undefined || order.pending_checklists === undefined) blockers.push({ id: 'unknown', label: 'Conferência ainda não verificada', action: 'Atualize as OS para verificar os pontos e checklists antes de concluir.' });
  }
  const overdue = open && new Date(order.ends_at).getTime() < now;
  const nextAction = blockers[0]?.action || (open
    ? scheduled ? 'Aguarde o dia agendado para registrar o atendimento.' : 'Abra a OS, descreva o resultado e confira as etapas para concluir.'
    : order.status === 'Concluída' && missingHours.length ? 'Lembre os integrantes abaixo de registrar as horas realizadas; isso não reabre a OS.'
    : 'Consulte o resultado e o histórico deste atendimento.');
  return { blockers, missingHours, overdue, scheduled, nextAction };
}

export function matchesOrderAttention(order: AttentionOrder, filter: string, day: string, now = Date.now(), admin = true) {
  const attention = orderAttention(order, day, now, admin);
  if (filter === 'Pendências de encerramento') return attention.blockers.length > 0;
  if (filter === 'Sem horas registradas') return attention.missingHours.length > 0;
  if (filter === 'Prazo previsto vencido') return attention.overdue;
  return true;
}

/** Client names support orders created without a client record. Dates use the planned start. */
export function matchesOrderScope(order: Pick<Order, 'client_name' | 'members' | 'starts_at'>, scope: { client: string; person: string; from: string; to: string }) {
  const day = localDay(order.starts_at);
  return (!scope.client || order.client_name === scope.client)
    && (!scope.person || order.members.includes(scope.person))
    && (!scope.from || day >= scope.from) && (!scope.to || day <= scope.to);
}
