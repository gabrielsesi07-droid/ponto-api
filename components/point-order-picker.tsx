"use client";
import { useEffect, useState } from 'react';
import { availablePointOrders, pointOrderNumber, type PointOrder } from '@/lib/point-orders';
import { demoOperations, demoState } from '@/lib/demo';
import { localDateTime } from '@/lib/orders';
import { Button } from './ui/button';

export function PointOrderPicker({ value, onChange, date, live = false, enabled = true, demo = false, entryId, existingOrderId, disabled = false }: {
  value: string; onChange: (order: PointOrder | null) => void; date: string; live?: boolean; enabled?: boolean; demo?: boolean;
  entryId?: string; existingOrderId?: string | null; disabled?: boolean;
}) {
  const [orders, setOrders] = useState<PointOrder[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function load() {
      try {
        if (demo) {
          const me = demoState().me;
          setOrders(demoOperations(me).orders.map(order => ({
            id: order.id, number: order.number, title: order.title, client_name: order.client_name,
            status: order.status, start_date: localDateTime(order.starts_at).slice(0, 10), assigned: order.members.includes(me.id),
          })));
          return;
        }
        const response = await fetch('/api/clock' + (entryId ? `?entry_id=${encodeURIComponent(entryId)}` : ''), { signal: controller.signal });
        const out = await response.json() as {orders:PointOrder[];error?:string};
        if (!response.ok) throw new Error(out.error || 'Não foi possível carregar suas OS.');
        if (active) setOrders(out.orders);
      } catch (e) {
        if (active) setError(controller.signal.aborted ? 'O carregamento demorou. Tente novamente.' : (e as Error).message);
      } finally { clearTimeout(timeout); if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [enabled, demo, entryId, attempt]);
  const options = availablePointOrders(orders, date, live, existingOrderId);
  const locked = !!existingOrderId;
  return <div className="full space-y-2">
    <label className="block">Ordem de serviço (OS)
      <select className="mt-1 w-full" required={!entryId} aria-label="Ordem de serviço (OS)" value={value} disabled={disabled || loading || !!error || locked}
        onChange={e => onChange(orders.find(o => o.id === e.target.value) || null)}>
        <option value="">{loading ? 'Carregando suas OS…' : entryId && !existingOrderId ? 'Registro antigo sem OS · manter histórico' : 'Selecione a OS deste trabalho'}</option>
        {options.map(o => <option key={o.id} value={o.id}>{pointOrderNumber(o.number, o.official_number)} · {o.client_name} · {o.title} · {o.status}</option>)}
      </select>
    </label>
    {error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error} <Button type="button" variant="outline" onClick={() => { setLoading(true); setError(''); setAttempt(n => n + 1); }}>Tentar novamente</Button></div>
      : !loading && !options.length ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nenhuma OS disponível para esta data. Peça ao coordenador para criar a OS ou incluir você na equipe. Não é possível abrir um ponto avulso.</p>
      : <p className="text-xs muted">{locked ? 'O vínculo desta marcação com a OS é preservado.' : live ? 'Selecione uma OS aberta atribuída a você. Cliente e serviço vêm da OS.' : 'Escolha a OS do trabalho. Mesmo encerrada, ela aceita suas horas realizadas, com entrada e saída.'}</p>}
    {!loading && value && !options.some(o => o.id === value) && <p role="alert" className="text-sm text-red-800">Esta OS não está disponível para a data informada. Selecione outra OS ou ajuste a data.</p>}
  </div>;
}
