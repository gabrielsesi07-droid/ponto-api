"use client";
import { useState } from 'react';
import { Button } from './ui/button';
import { api } from './editors';
import { duration, money } from '@/lib/domain';
type Summary = { worked:number; normal:number; extra:number; amount:number };
type Preview = { token:string; before:Summary; after:Summary; entries:number; missing_rates:number; recovered_rates:number; updated_shifts:number; without_shift:number };

export function RecalculationPanel({month,userId,currency,demo,onChanged}: {
  month:string; userId:string; currency:string; demo:boolean; onChanged:()=>Promise<void>;
}) {
  const [preview,setPreview] = useState<Preview|null>(null), [busy,setBusy] = useState(false);
  const [error,setError] = useState(''), [reason,setReason] = useState(''), [fill,setFill] = useState(false), [message,setMessage] = useState('');
  const [useShifts,setUseShifts] = useState(false);
  async function run(apply:boolean) {
    if (demo) { setError('O recálculo fica disponível ao entrar com sua conta.'); return; }
    setBusy(true); setError(''); setMessage('');
    const scope = {month,user_id:userId === 'all' ? null : userId,fill_missing_rates:fill,use_current_shifts:useShifts};
    try {
      if (apply && preview) {
        const result = await api<{updated:number}>('/api/recalculation',{...scope,token:preview.token,reason});
        setPreview(null); await onChanged(); setMessage(`${result.updated} registro(s) recalculado(s), com histórico preservado.`);
      } else {
        setPreview(await api<Preview>(`/api/recalculation?month=${month}&fill_missing_rates=${fill}&use_current_shifts=${useShifts}${scope.user_id ? `&user_id=${scope.user_id}` : ''}`));
      }
    } catch (e) { setError((e as Error).message); if(apply) setPreview(null); } finally { setBusy(false); }
  }
  return <details className="mt-4 border-t pt-4">
    <summary className="cursor-pointer font-medium text-sm">Conferir e corrigir o cálculo dos registros antigos</summary>
    <p className="mt-3 text-sm muted">Aplica as regras salvas nas configurações a todos os registros de {month.split('-').reverse().join('/')} {userId === 'all' ? 'da equipe' : 'do colaborador selecionado'}. A prévia considera o mês completo. Entrada, saída e intervalo permanecem como foram informados.</p>
    <label className="my-3 flex-row! items-start gap-2! text-sm"><input type="checkbox" className="h-4! w-4! mt-1" checked={fill} disabled={busy} onChange={e => {setFill(e.target.checked);setPreview(null);}}/>Preencher valores-hora zerados com o valor atual do cadastro. Marque somente se esse também era o valor correto no período.</label>
    <p className="text-xs muted">Os demais valores-hora históricos são preservados. Registros sem turno pessoal usam a carga diária; não presumimos qual era o turno antigo.</p>
    <label className="my-3 flex-row! items-start gap-2! text-sm"><input type="checkbox" className="h-4! w-4! mt-1" checked={useShifts} disabled={busy} onChange={e => {setUseShifts(e.target.checked);setPreview(null);}}/>Usar os turnos atualmente confirmados nas OS. Marque para corrigir um turno histórico incorreto; os demais registros preservam o turno original.</label>
    <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(false)}>{busy ? 'Conferindo…' : 'Gerar prévia do recálculo'}</Button>
    {preview && <div className="mt-4 rounded-xl border bg-slate-50 p-4">
      <b className="text-sm">{preview.entries} registro(s) no escopo</b>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Cálculo</th><th className="p-2">Horas extras</th><th className="p-2">Estimativa</th></tr></thead><tbody><tr><th className="p-2 font-normal">Atual</th><td className="p-2">{duration(preview.before.extra)}</td><td className="p-2">{money(preview.before.amount,currency)}</td></tr><tr><th className="p-2 font-normal">Após correção</th><td className="p-2">{duration(preview.after.extra)}</td><td className="p-2">{money(preview.after.amount,currency)}{preview.missing_rates > 0 ? ' (parcial)' : ''}</td></tr></tbody></table></div>
      {preview.without_shift > 0 && <p className="mt-2 text-xs muted">{preview.without_shift} registro(s) de serviço sem turno histórico usarão a carga diária.</p>}
      {preview.missing_rates > 0 && <p className="mt-2 text-sm text-amber-900">{preview.missing_rates} registro(s) com extras ainda sem valor-hora. A estimativa está incompleta.</p>}
      {preview.recovered_rates > 0 && <p className="mt-2 text-sm">{preview.recovered_rates} valor(es)-hora zerado(s) serão preenchidos com o cadastro atual.</p>}
      {preview.updated_shifts > 0 && <p className="mt-2 text-sm">{preview.updated_shifts} referência(s) de turno serão substituídas pelos turnos confirmados nas OS.</p>}
      <label className="mt-3">Motivo do recálculo<textarea value={reason} minLength={10} maxLength={1000} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="Ex.: correção da jornada normal e das faixas de sábado."/></label>
      <Button type="button" className="mt-3" disabled={busy || !preview.entries || reason.trim().length < 10} onClick={() => void run(true)}>Aplicar recálculo conferido</Button>
    </div>}
    {message && <p className="mt-3 text-sm text-emerald-800" role="status">{message}</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </details>;
}
