import type { Entry, Person } from './domain';

export function entryEditExplanation(me: Pick<Person, 'role' | 'can_edit'>, entry: Pick<Entry, 'status'>, closed: boolean) {
  if (closed) return me.role === 'coordinator'
    ? 'Mês fechado. Reabra o mês com justificativa antes de corrigir este lançamento.'
    : 'Mês fechado. Peça ao coordenador a reabertura com justificativa antes de corrigir este lançamento.';
  if (me.role === 'coordinator') return '';
  if (entry.status === 'Aprovado') return 'Ponto aprovado. Para corrigir horários ou dados, informe a data e a OS ao coordenador. Ele pode ajustar o lançamento enquanto o mês estiver aberto.';
  if (!me.can_edit) return 'Seu acesso não permite editar pontos. Informe a data e a OS ao coordenador para solicitar a correção.';
  return '';
}
