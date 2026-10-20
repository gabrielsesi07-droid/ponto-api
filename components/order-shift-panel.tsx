"use client";
import { useEffect, useState } from 'react';
import { LockKeyhole, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { defaults, duration, minutes, type Rules, type Shift } from '@/lib/domain';
import { shiftSchema } from '@/lib/work-rules';

type SavedShift = { work_type: 'work' | 'travel'; shift: Shift; version: number };
type ShiftData = { shifts: SavedShift[]; rules: Rules };
const initial: Shift = { start: '08:00', end: '17:00', break_start: '12:00', break_end: '13:00' };

export function OrderShiftPanel({orderId, meId, userId, demo, admin = false, workType = 'work'}: {
  orderId: string; meId: string; userId?: string; demo: boolean; admin?: boolean; workType?: 'work' | 'travel';
}) {
  const [loaded, setLoaded] = useState<{key:string;value:ShiftData} | null>(null), [form, setForm] = useState<Shift>(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false), [retry, setRetry] = useState(0);
  const owner = userId || meId;
  const loadKey = `${orderId}:${owner}:${workType}:${retry}`;
  const data = demo ? {shifts:[],rules:defaults} : loaded?.key === loadKey ? loaded.value : null;
  useEffect(() => {
    const abort = new AbortController();
    if (demo) return () => abort.abort();
    void fetch(`/api/shifts?order_id=${encodeURIComponent(orderId)}&user_id=${encodeURIComponent(owner)}`, {signal: abort.signal})
      .then(async response => { const value = await response.json() as ShiftData & {error?: string}; if (!response.ok) throw new Error(value.error || 'Não foi possível carregar o turno.'); return value; })
      .then(value => { if (!abort.signal.aborted) { setLoaded({key:loadKey,value}); setForm(value.shifts.find(s => s.work_type === workType)?.shift || initial); setError(''); setEditing(false); } })
      .catch(e => { if (!abort.signal.aborted) setError((e as Error).message); });
    return () => abort.abort();
  }, [orderId, owner, demo, workType, loadKey]);
  const saved = data?.shifts.find(s => s.work_type === workType);
  if (data?.rules.calculation_version !== 2 && data) return null;
  if (workType === 'travel' && data && data.rules.travel_mode !== 'shift') return <p className="full rounded-lg bg-blue-50 p-3 text-sm">{data.rules.travel_mode === 'all_extra' ? 'A regra atual considera todo deslocamento como extra; os adicionais seguem as faixas do tipo de dia.' : 'Deslocamento: os horários reais serão somados aos serviços do dia, com uma única carga diária. O turno no destino não é aplicado à viagem.'}</p>;
  async function save() {
    if (demo) { setError('A demonstração não salva turnos.'); return; }
    const checked = shiftSchema.safeParse(form);
    if (!checked.success) { setError(checked.error.issues[0].message); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/shifts', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,user_id:owner,work_type:workType,shift:checked.data,version:saved?.version,reason})});
      const value = await response.json() as {error?: string}; if (!response.ok) throw new Error(value.error || 'Não foi possível confirmar o turno.');
      setRetry(v => v + 1); setReason('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const net = minutes(form.end) - minutes(form.start) - (minutes(form.break_end) - minutes(form.break_start));
  return <section className="full rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label="Turno pessoal da OS">
    <h3 className="flex items-center gap-2 font-semibold"><LockKeyhole size={17}/>{owner === meId ? 'Meu turno' : 'Turno do colaborador'} · {workType === 'travel' ? 'deslocamento' : 'serviço'}</h3>
    {!data && !error && <p className="mt-2 text-sm muted">Carregando turno…</p>}
    {data && <>
      <p className="my-2 text-sm muted">{saved ? 'Turno confirmado para esta OS. Cada registro guarda sua referência de cálculo.' : 'Confirme o horário combinado antes de registrar o serviço. Isso não cria pontos. Fora do turno conta como extra; a carga e as faixas de cada dia também são respeitadas.'}</p>
      {saved && !editing ? <>
        <p className="text-sm"><b>{saved.shift.start}–{saved.shift.end}</b> · intervalo {saved.shift.break_start}–{saved.shift.break_end}</p>
        {admin && <Button type="button" variant="outline" className="mt-3" onClick={() => setEditing(true)}>Corrigir turno</Button>}
        {!admin && <p className="mt-2 text-xs muted">Para corrigir o turno confirmado, peça ao coordenador. Os horários reais do ponto continuam editáveis enquanto o mês estiver aberto.</p>}
      </> : <>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {([['start','Início do turno'],['end','Fim do turno'],['break_start','Início do intervalo'],['break_end','Fim do intervalo']] as const).map(([key,label]) => <label key={key}>{label}<input type="time" value={form[key]} disabled={busy} onChange={e => setForm(v => ({...v,[key]:e.target.value}))}/></label>)}
        </div>
        <p className="mt-2 text-xs muted">Carga prevista: {duration(net)}. Para turno sem pausa, informe o mesmo horário no início e no fim do intervalo. Para virada de dia, registre cada data separadamente.</p>
        {saved && <label className="mt-3">Motivo da correção<textarea value={reason} minLength={10} maxLength={1000} onChange={e => setReason(e.target.value)}/></label>}
        <Button type="button" className="mt-3" disabled={busy || (saved && reason.trim().length < 10) || (owner !== meId && !admin)} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <LockKeyhole size={16}/>} {saved ? 'Salvar correção' : 'Confirmar e travar meu turno'}</Button>
      </>}
    </>}
    {error && <div className="mt-3 text-sm text-red-700" role="alert">{error}{!data && <Button type="button" variant="outline" className="ml-2" onClick={() => setRetry(v => v + 1)}>Tentar novamente</Button>}</div>}
  </section>;
}

export function TeamShiftPanel({orderId,meId,demo,people}: {orderId:string;meId:string;demo:boolean;people:{id:string;name:string}[]}) {
  const [open,setOpen] = useState(false), [person,setPerson] = useState(people[0]?.id || ''), [type,setType] = useState<'work'|'travel'>('work');
  if (!people.length) return null;
  return <details className="rounded-xl border p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold text-sm">Consultar ou corrigir turnos da equipe</summary>
    {open && <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3"><label>Colaborador<select value={person} onChange={event => setPerson(event.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Tipo de turno<select value={type} onChange={event => setType(event.target.value as 'work'|'travel')}><option value="work">Serviço</option><option value="travel">Deslocamento</option></select></label></div>
      <OrderShiftPanel key={orderId+person+type} orderId={orderId} meId={meId} userId={person} workType={type} admin demo={demo}/>
    </div>}
  </details>;
}
