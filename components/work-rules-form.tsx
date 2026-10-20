"use client";

import { useState, type FormEvent } from 'react';
import { LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './editors';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { duration, type DayPolicies, type Rules } from '@/lib/domain';
import { createDefaultRules, normalizeRules, rulesSchema } from '@/lib/work-rules';

const dayNames = { weekday: 'Dias úteis', saturday: 'Sábado', sunday: 'Domingo', holiday: 'Feriado' } as const;
type DayKey = keyof typeof dayNames;
type DraftPolicy = { normal: string; tiers: { limit: string; bonus: string }[] };
const asClock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
function asMinutes(value: string) {
  if (!/^\d{1,2}:[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  const total = hours * 60 + minutes;
  return total <= 1440 ? total : null;
}
function policyDrafts(rules: Rules): Record<DayKey, DraftPolicy> {
  const policies = normalizeRules(rules).day_policies || createDefaultRules().day_policies!;
  return Object.fromEntries(Object.entries(policies).map(([key, policy]) => [key, {
    normal: asClock(policy.normal_minutes),
    tiers: policy.tiers.map(tier => ({ limit: tier.up_to_minutes === null ? '' : asClock(tier.up_to_minutes), bonus: String(tier.bonus) })),
  }])) as Record<DayKey, DraftPolicy>;
}

export function SettingsForm({ rules, onSaved, demo }: { rules: Rules; onSaved: () => Promise<void>; demo: boolean }) {
  const [form, setForm] = useState(() => normalizeRules(rules));
  const [drafts, setDrafts] = useState(() => policyDrafts(rules));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revised = form.calculation_version === 2;
  const change = <K extends keyof Rules>(key: K, value: Rules[K]) => setForm(previous => ({ ...previous, [key]: value }));
  function changePolicy(key: DayKey, next: DraftPolicy) {
    setDrafts(previous => ({ ...previous, [key]: next }));
  }
  function prepareRevisedRules() {
    const next = createDefaultRules();
    next.currency = form.currency;
    next.date_format = form.date_format;
    next.time_format = form.time_format;
    next.allow_retro = form.allow_retro;
    next.weekday_bonus = form.weekday_bonus;
    next.holiday_bonus = form.holiday_bonus;
    next.day_policies!.weekday.tiers[0].bonus = form.weekday_bonus;
    next.day_policies!.holiday.tiers[0].bonus = form.holiday_bonus;
    setForm(next);
    setDrafts(policyDrafts(next));
    setError('');
  }
  function addTier(key: DayKey) {
    const policy = drafts[key];
    const previous = policy.tiers.length > 1 ? asMinutes(policy.tiers[policy.tiers.length - 2].limit) : 0;
    if (policy.tiers.length >= 12 || previous === null || previous >= 1440) return;
    const last = policy.tiers[policy.tiers.length - 1];
    changePolicy(key, { ...policy, tiers: [...policy.tiers.slice(0, -1), { limit: asClock(Math.min(previous + 60, 1440)), bonus: last.bonus }, last] });
  }
  function removeTier(key: DayKey, index: number) {
    const policy = drafts[key];
    if (policy.tiers.length <= 1) return;
    const tiers = policy.tiers.filter((_, i) => i !== index);
    tiers[tiers.length - 1] = { ...tiers[tiers.length - 1], limit: '' };
    changePolicy(key, { ...policy, tiers });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (demo) { toast.info('Configurações da demonstração não são salvas.'); return; }
    if (!revised) { setError('Prepare as regras revisadas antes de salvar.'); return; }
    setBusy(true);
    try {
      const policies = {} as DayPolicies;
      for (const key of Object.keys(dayNames) as DayKey[]) {
        const draft = drafts[key];
        const normal = asMinutes(draft.normal);
        if (normal === null) throw new Error(`${dayNames[key]}: informe a carga normal em horas:minutos, entre 0:00 e 24:00.`);
        policies[key] = { normal_minutes: normal, tiers: draft.tiers.map((tier, index) => {
          const limit = index === draft.tiers.length - 1 ? null : asMinutes(tier.limit);
          if (index < draft.tiers.length - 1 && (limit === null || limit < 1)) throw new Error(`${dayNames[key]}: confira os limites das faixas em horas:minutos.`);
          const bonus = Number(tier.bonus);
          if (!tier.bonus.trim() || !Number.isFinite(bonus) || bonus < 0 || bonus > 1000) throw new Error(`${dayNames[key]}: informe adicionais entre 0% e 1000%.`);
          return { up_to_minutes: limit, bonus };
        }) };
      }
      const candidate = { ...form, day_policies: policies, daily_minutes: Math.max(1, policies.weekday.normal_minutes),
        weekday_bonus: policies.weekday.tiers[0].bonus, saturday_bonus: policies.saturday.tiers[0].bonus,
        sunday_bonus: policies.sunday.tiers[0].bonus, holiday_bonus: policies.holiday.tiers[0].bonus };
      const parsed = rulesSchema.safeParse(candidate);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const next = normalizeRules(parsed.data);
      await api('/api/manage', { entity: 'settings', data: next });
      setForm(next);
      await onSaved();
      toast.success('Regras atualizadas para os próximos lançamentos.');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="panel max-w-5xl p-5 sm:p-7">
    <h2>Regras de jornada e horas extras</h2>
    <p className="muted mt-2 text-sm">Configure a carga normal, os adicionais por faixa e o tratamento dos deslocamentos. Cada colaborador confirma seu próprio turno na OS.</p>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">Mudanças valem para os próximos lançamentos. Os registros existentes preservam as regras e o valor da hora usados na época. As correções do histórico são feitas separadamente.</p>
    {!revised && <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h3 className="font-semibold">As configurações salvas ainda usam o cálculo anterior</h3>
      <p className="mt-2">Carga atual em dia útil: {duration(form.daily_minutes)}. Sábado, domingo e feriado são integralmente extras no cálculo anterior.</p>
      <p className="mt-2">Prepare a carga de 8h nos dias úteis e sábados, sábado com as primeiras 3h extras a 60% e o restante a 100%, e domingo integral a 100%. A aprovação manual ficará desativada. Confira e ajuste antes de salvar.</p>
      <Button className="mt-3" type="button" variant="outline" disabled={busy} onClick={prepareRevisedRules}>Preparar regras revisadas</Button>
    </section>}
    <fieldset disabled={busy || !revised} className="mt-6 space-y-5">
      <legend className="sr-only">Regras revisadas de cálculo</legend>
      <div className="grid gap-4 lg:grid-cols-2">
        {(Object.keys(dayNames) as DayKey[]).map(key => {
          const policy = drafts[key];
          const normal = asMinutes(policy.normal);
          const lastLimited = policy.tiers.length > 1 ? asMinutes(policy.tiers[policy.tiers.length - 2].limit) : 0;
          return <fieldset key={key} className="min-w-0 rounded-xl border p-4">
            <legend className="px-1 font-semibold">{dayNames[key]}</legend>
            <div className="ops-form">
              <label className="full">Carga normal diária (h:mm)
                <input type="text" required maxLength={5} pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="8:00" value={policy.normal} onChange={event => changePolicy(key, { ...policy, normal: event.target.value })} aria-describedby={`normal-${key}`} />
              </label>
              <p id={`normal-${key}`} className="full text-xs muted">{normal === 0 ? 'Todas as horas trabalhadas neste tipo de dia são extras.' : normal === null ? 'Ex.: 8:00 para oito horas; 4:30 para quatro horas e meia.' : `${duration(normal)} normais por dia. Com turno confirmado, contam como extras os períodos fora dele; a carga diária também limita as horas normais.`}</p>
            </div>
            <div className="mt-4 space-y-3">
              {policy.tiers.map((tier, index) => <div key={index} className="rounded-lg bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Faixa {index + 1}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={policy.tiers.length === 1} onClick={() => removeTier(key, index)} aria-label={`Remover faixa ${index + 1} de ${dayNames[key]}`}><Trash2 size={15} />Remover</Button>
                </div>
                <div className="ops-form">
                  {index < policy.tiers.length - 1 ? <label>Até quantas horas extras (h:mm)
                    <input type="text" required maxLength={5} pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="3:00" value={tier.limit} onChange={event => changePolicy(key, { ...policy, tiers: policy.tiers.map((item, i) => i === index ? { ...item, limit: event.target.value } : item) })} />
                  </label> : <div className="flex min-w-0 flex-col justify-center gap-1 text-sm"><span>Horas extras restantes</span><b>Sem limite</b></div>}
                  <label>Adicional (%)
                    <input type="number" required min={0} max={1000} step="0.01" value={tier.bonus} onChange={event => changePolicy(key, { ...policy, tiers: policy.tiers.map((item, i) => i === index ? { ...item, bonus: event.target.value } : item) })} />
                  </label>
                </div>
              </div>)}
            </div>
            <Button className="mt-3" type="button" variant="outline" size="sm" disabled={policy.tiers.length >= 12 || lastLimited === null || lastLimited >= 1440} onClick={() => addTier(key)}><Plus size={16} />Adicionar faixa</Button>
          </fieldset>;
        })}
      </div>
      <p className="text-sm muted">Os limites são acumulados desde a primeira hora extra do dia, somando os lançamentos do colaborador. Ex.: até 3:00 a 60%; depois disso, 100%. A última faixa sempre cobre o restante. É possível configurar até 12 faixas por tipo de dia.</p>
      <section className="ops-form rounded-xl border p-4">
        <label className="full">Como calcular os dias de deslocamento
          <select value={form.travel_mode || 'daily'} onChange={event => change('travel_mode', event.target.value as Rules['travel_mode'])}>
            <option value="daily">Pela carga diária, sem exigir turno de deslocamento</option>
            <option value="shift">Pelo turno de deslocamento confirmado na OS</option>
            <option value="all_extra">Todas as horas de deslocamento como extras</option>
          </select>
        </label>
        <p className="full text-xs muted">{form.travel_mode === 'shift' ? 'O colaborador confirma um turno de deslocamento separado do turno de atendimento. Registra depois os horários que realmente realizou.' : form.travel_mode === 'all_extra' ? 'O deslocamento não consome horas normais. Os adicionais seguem as faixas do tipo de dia.' : 'O deslocamento usa a carga normal do tipo de dia, compartilhada com o atendimento realizado na mesma data.'}</p>
        <label>Moeda<select value={form.currency} onChange={event => change('currency', event.target.value)}><option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option></select></label>
        <label>Formato da data<select value={form.date_format} onChange={event => change('date_format', event.target.value)}><option value="dd/MM/yyyy">20/10/2026</option><option value="yyyy-MM-dd">2026-10-20</option></select></label>
        <label>Formato da hora<select value={form.time_format} onChange={event => change('time_format', event.target.value)}><option value="24h">24 horas</option><option value="12h">12 horas</option></select></label>
        <div className="full flex items-center justify-between gap-4 border-t pt-4"><label htmlFor="rules-retro">Permitir lançamentos e edições retroativas</label><Switch id="rules-retro" checked={form.allow_retro} onCheckedChange={value => change('allow_retro', value)} /></div>
        {!form.allow_retro && <p className="full text-xs text-amber-900">O colaborador só poderá registrar horas no próprio dia. Lançamentos posteriores precisarão do coordenador.</p>}
        <div className="full flex items-center justify-between gap-4"><label htmlFor="rules-approval">Exigir aprovação do coordenador</label><Switch id="rules-approval" checked={form.approval_required} onCheckedChange={value => change('approval_required', value)} /></div>
        <p className="full text-xs muted">{form.approval_required ? 'Os novos lançamentos completos ficam pendentes de aprovação. É possível aprovar por colaborador e por mês.' : 'Os novos lançamentos completos são aprovados automaticamente. O coordenador acompanha o resumo e pode corrigir exceções.'}</p>
      </section>
    </fieldset>
    <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">O valor da hora extra inclui a hora base e o adicional. Ex.: 1h com base de R$ 30,00 e adicional de 60% vale R$ 48,00. Um turno das 8h às 17h, com 1h de intervalo, deixa 2h extras ao trabalhar das 7h às 18h.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button type="submit" disabled={busy || !revised} className="action mt-6">{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? 'Salvando…' : 'Salvar configurações'}</Button>
  </form>;
}
