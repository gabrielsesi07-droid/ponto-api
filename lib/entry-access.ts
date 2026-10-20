import type { Entry, Person } from './domain';

export function canEditEntry(me: Pick<Person, 'id' | 'role' | 'can_edit'>, entry: Pick<Entry, 'user_id' | 'status'>, closed: boolean, approvalRequired = true) {
  return !closed && (me.role === 'coordinator' || (entry.user_id === me.id && me.can_edit && (!approvalRequired || entry.status !== 'Aprovado')));
}

export function entryEditExplanation(me: Pick<Person, 'role' | 'can_edit'> & Partial<Pick<Person, 'id'>>, entry: Pick<Entry, 'status'> & Partial<Pick<Entry, 'user_id'>>, closed: boolean, approvalRequired = true) {
  if (closed) return me.role === 'coordinator'
    ? 'Mês fechado. Reabra o mês com justificativa antes de corrigir este lançamento.'
    : 'Mês fechado. Peça ao coordenador a reabertura com justificativa antes de corrigir este lançamento.';
  if (me.role === 'coordinator') return '';
  if (me.id && entry.user_id && me.id !== entry.user_id) return 'Você só pode editar seus próprios pontos. Solicite a correção ao coordenador.';
  if (approvalRequired && entry.status === 'Aprovado') return 'Ponto aprovado. Para corrigir horários ou dados, informe a data e a OS ao coordenador. Ele pode ajustar o lançamento enquanto o mês estiver aberto.';
  if (!me.can_edit) return 'Seu acesso não permite editar pontos. Informe a data e a OS ao coordenador para solicitar a correção.';
  return '';
}
