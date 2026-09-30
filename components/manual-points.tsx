"use client";
import { CalendarDays, ClipboardList, History, Wallet, BarChart3 } from 'lucide-react';
import { Button } from './ui/button';
import { QuickClock } from './quick-clock';
import { calculate, totals, duration, today, type State } from '@/lib/domain';

export function ManualPoints({state,demo,onChanged,onManual,onHistory,onSummary,onProfile}: {
  state: State; demo: boolean; onChanged: () => Promise<void>; onManual: () => void;
  onHistory: () => void; onSummary: () => void; onProfile: () => void;
}) {
  const own = state.entries.filter(e => e.user_id === state.me.id);
  const day = today();
  const summary = totals(calculate(own.filter(e => e.date === day)));
  return <div className="mx-auto max-w-4xl space-y-5">
    <section className="panel p-6 sm:p-9">
      <p className="text-sm muted">Olá, {state.me.name}</p>
      <h2 className="mt-2 text-2xl font-bold">Registre as horas do seu trabalho</h2>
      <p className="mt-3 muted">Terminou o atendimento? Escolha a OS e informe os horários reais de entrada, saída e intervalo. Você também pode registrar dias anteriores, conforme as permissões da empresa.</p>
      <ol className="my-6 grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-xl bg-blue-50 p-4">1. Escolha a data e a OS</li>
        <li className="rounded-xl bg-blue-50 p-4">2. Informe os horários realizados</li>
        <li className="rounded-xl bg-blue-50 p-4">3. Confira e salve suas horas</li>
      </ol>
      <Button className="h-auto min-h-12 w-full whitespace-normal sm:w-auto" onClick={onManual} disabled={!!state.timer}><CalendarDays />Registrar horas trabalhadas</Button>
      {state.timer && <p className="mt-3 text-sm text-amber-900">Existe um cronômetro antigo aberto. Resolva-o abaixo antes de registrar o mesmo período novamente.</p>}
      <p className="mt-3 text-sm muted">O registro é pessoal e sempre vinculado a uma OS. Salvar as horas não conclui a OS.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="panel p-5"><p className="text-sm muted">Horas registradas hoje</p><p className="mt-2 text-2xl font-bold">{duration(summary.worked)}</p></section>
      <section className="panel p-5"><p className="text-sm muted">Extras registradas hoje</p><p className="mt-2 text-2xl font-bold">{duration(summary.extra)}</p></section>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Button variant="outline" className="h-auto min-h-14 whitespace-normal" onClick={onHistory}><History />Ver e corrigir registros</Button>
      <Button variant="outline" className="h-auto min-h-14 whitespace-normal" onClick={onSummary}><BarChart3 />Horas extras e comparativos</Button>
      <Button variant="outline" className="h-auto min-h-14 whitespace-normal" onClick={onProfile}><Wallet />Configurar meu salário</Button>
    </div>
    {state.timer && <section className="rounded-xl border border-amber-300 p-4">
      <h3 className="font-semibold"><ClipboardList className="mr-2 inline size-5" />Registro antigo em andamento</h3>
      <p className="my-3 text-sm">Este controle aparece apenas para preservar um cronômetro que já estava aberto. Ao encerrá-lo, a saída será o horário atual; se o trabalho terminou antes, corrija o registro no histórico ou solicite o ajuste ao coordenador. Não confirme horários que não correspondam ao trabalho realizado.</p>
      <QuickClock state={state} demo={demo} onChanged={onChanged} onManual={onHistory} onSummary={onSummary} onProfile={onProfile} />
    </section>}
    <p className="text-center text-sm muted">Este sistema registra os serviços técnicos. Continue usando o ponto da empresa no dia a dia.</p>
  </div>;
}
