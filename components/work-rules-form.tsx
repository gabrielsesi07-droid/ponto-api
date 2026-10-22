"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { Calculator, ClipboardCheck, History, LoaderCircle, Plus, RotateCcw, Route, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './editors';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { duration, money, type Rules } from '@/lib/domain';
import { createDefaultRules, normalizeRules } from '@/lib/work-rules';
import { asClock, asMinutes, dayKeys, dayNames, draftToRules, policyDrafts, simulate, type DayKey, type DraftPolicies, type DraftPolicy, type SimulationInput } from '@/lib/rules-draft';
import './settings-center.css';

const factor = (bonus: string) => {
  const value = Number(bonus);
  return bonus.trim() && Number.isFinite(value) ? `×${(1 + value / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : '—';
};
const daySummary = (policy: DraftPolicy) => `${policy.normal || '—'} normais · ${policy.tiers.map(tier => `${Number(tier.bonus) || 0}%`).join(' / ')}`;

export function SettingsForm({ rules, onSaved, demo, onOpenHistory }: { rules: Rules; onSaved: () => Promise<void>; demo: boolean; onOpenHistory?: () => void }) {
  const [form, setForm] = useState(() => normalizeRules(rules));
  const [drafts, setDrafts] = useState<DraftPolicies>(() => policyDrafts(rules));
  const [tab, setTab] = useState('overtime');
  const [day, setDay] = useState<DayKey>('weekday');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revised = form.calculation_version === 2;
  const built = useMemo(() => draftToRules(form, drafts), [form, drafts]);
  const saved = useMemo(() => JSON.stringify(normalizeRules(rules)), [rules]);
  const dirty = !built.ok || JSON.stringify(built.rules) !== saved;
  const change = <K extends keyof Rules>(key: K, value: Rules[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const changePolicy = (key: DayKey, next: DraftPolicy) => setDrafts(previous => ({ ...previous, [key]: next }));
  function load(next: Rules) {
    setForm(next);
    setDrafts(policyDrafts(next));
    setError('');
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
    load(next);
  }
  function restoreStandard() {
    const next = createDefaultRules();
    next.currency = form.currency;
    next.date_format = form.date_format;
    next.time_format = form.time_format;
    next.allow_retro = form.allow_retro;
    load(next);
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
    if (!built.ok) { setError(built.error); return; }
    setBusy(true);
    try {
      await api('/api/manage', { entity: 'settings', data: built.rules });
      setForm(built.rules);
      await onSaved();
      toast.success('Regras atualizadas para os próximos lançamentos.');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  const policy = drafts[day];
  const normal = asMinutes(policy.normal);
  const lastLimited = policy.tiers.length > 1 ? asMinutes(policy.tiers[policy.tiers.length - 2].limit) : 0;

  return <form onSubmit={save} className="settings-center">
    <header className="settings-head">
      <p className="muted">Regras de horas extras, deslocamento, aprovação e formatos usados em todos os pontos.</p>
      <span className={`settings-state${dirty ? ' is-dirty' : ''}`} role="status">{!revised ? 'Cálculo anterior' : dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
    </header>

    {!revised && <section className="settings-notice is-warning">
      <h3>As configurações salvas ainda usam o cálculo anterior</h3>
      <p>Carga atual em dia útil: {duration(form.daily_minutes)}. Sábado, domingo e feriado são integralmente extras no cálculo anterior.</p>
      <p>Prepare a carga de 8h nos dias úteis e sábados, sábado com as primeiras 3h extras a 60% e o restante a 100%, e domingo integral a 100%. A aprovação manual ficará desativada. Confira e ajuste antes de salvar.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={prepareRevisedRules}>Preparar regras revisadas</Button>
    </section>}

    <Tabs value={tab} onValueChange={setTab} className="settings-tabs-root">
      <TabsList variant="line" className="settings-tabs" aria-label="Seções de configuração">
        <TabsTrigger value="overtime"><Calculator size={16} />Horas extras</TabsTrigger>
        <TabsTrigger value="travel"><Route size={16} />Deslocamento</TabsTrigger>
        <TabsTrigger value="entries"><ClipboardCheck size={16} />Lançamentos</TabsTrigger>
        <TabsTrigger value="formats"><SlidersHorizontal size={16} />Formatos</TabsTrigger>
        <TabsTrigger value="history"><History size={16} />Histórico</TabsTrigger>
      </TabsList>

      <fieldset disabled={busy || !revised} className="settings-fieldset">
        <legend className="sr-only">Regras de cálculo</legend>

        <TabsContent value="overtime" className="settings-pane">
          <div className="settings-split">
            <div className="settings-editor">
              <div className="settings-days" role="radiogroup" aria-label="Tipo de dia">
                {dayKeys.map(key => <button key={key} type="button" role="radio" aria-checked={day === key} className={`settings-day${day === key ? ' is-active' : ''}`} onClick={() => setDay(key)}>
                  <b>{dayNames[key]}</b><small>{daySummary(drafts[key])}</small>
                </button>)}
              </div>

              <section className="settings-card">
                <h3>{dayNames[day]}: carga normal</h3>
                <label className="settings-field">Horas normais por dia (h:mm)
                  <input type="text" required maxLength={5} pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="8:00" value={policy.normal} onChange={event => changePolicy(day, { ...policy, normal: event.target.value })} aria-describedby="settings-normal-help" />
                </label>
                <p id="settings-normal-help" className="settings-help">{normal === 0 ? 'Todas as horas trabalhadas neste tipo de dia são extras.' : normal === null ? 'Ex.: 8:00 para oito horas; 4:30 para quatro horas e meia.' : `${duration(normal)} normais por dia, somando todos os lançamentos da pessoa. O que passar disso, ou ficar fora do turno combinado, vira hora extra.`}</p>
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <h3>{dayNames[day]}: faixas de horas extras</h3>
                  <Button type="button" variant="outline" size="sm" disabled={policy.tiers.length >= 12 || lastLimited === null || lastLimited >= 1440} onClick={() => addTier(day)}><Plus size={16} />Adicionar faixa</Button>
                </div>
                <ol className="settings-tiers">
                  {policy.tiers.map((tier, index) => {
                    const from = index === 0 ? '0:00' : policy.tiers[index - 1].limit || '…';
                    const last = index === policy.tiers.length - 1;
                    return <li key={index} className="settings-tier">
                      <span className="settings-tier-index">{index + 1}</span>
                      <span className="settings-tier-range">Das {from} {last ? 'em diante' : <>até <input aria-label={`Limite da faixa ${index + 1} de ${dayNames[day]} (h:mm)`} type="text" required maxLength={5} pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="3:00" value={tier.limit} onChange={event => changePolicy(day, { ...policy, tiers: policy.tiers.map((item, i) => i === index ? { ...item, limit: event.target.value } : item) })} /></>} de extras</span>
                      <label className="settings-tier-bonus">Adicional
                        <span><input type="number" required min={0} max={1000} step="0.01" value={tier.bonus} onChange={event => changePolicy(day, { ...policy, tiers: policy.tiers.map((item, i) => i === index ? { ...item, bonus: event.target.value } : item) })} />%</span>
                      </label>
                      <span className="settings-tier-factor" title="Multiplicador sobre o valor-hora">{factor(tier.bonus)}</span>
                      <Button type="button" variant="ghost" size="sm" disabled={policy.tiers.length === 1} onClick={() => removeTier(day, index)} aria-label={`Remover faixa ${index + 1} de ${dayNames[day]}`}><Trash2 size={15} /></Button>
                    </li>;
                  })}
                </ol>
                <p className="settings-help">Os limites contam desde a primeira hora extra do dia. A última faixa sempre cobre o restante. Até 12 faixas por tipo de dia. O valor inclui a hora base: 1h a 60% com base de R$ 30,00 vale R$ 48,00.</p>
              </section>
              <Button type="button" variant="ghost" size="sm" onClick={restoreStandard} className="settings-restore"><RotateCcw size={15} />Restaurar o padrão de horas extras</Button>
            </div>
            <Simulator rules={built.ok ? built.rules : null} error={built.ok ? '' : built.error} initialDay={day} />
          </div>
        </TabsContent>

        <TabsContent value="travel" className="settings-pane">
          <div className="settings-split">
            <section className="settings-card settings-editor">
              <h3>Como contar o deslocamento</h3>
              <p className="settings-help">Define o que acontece com as horas registradas como viagem. Vale para os próximos lançamentos.</p>
              <div className="settings-options" role="radiogroup" aria-label="Modo de deslocamento">
                {([
                  ['daily', 'Pela carga diária', 'A viagem usa a carga normal do tipo de dia, compartilhada com o atendimento da mesma data. Não exige turno de viagem.'],
                  ['shift', 'Pelo turno de deslocamento', 'O colaborador confirma na OS um turno de viagem. Só o que passar dele conta como hora extra.'],
                  ['all_extra', 'Tudo como hora extra', 'O deslocamento não consome horas normais. Os adicionais seguem as faixas do tipo de dia.'],
                ] as const).map(([value, title, text]) => <button key={value} type="button" role="radio" aria-checked={(form.travel_mode || 'daily') === value} className={`settings-option${(form.travel_mode || 'daily') === value ? ' is-active' : ''}`} onClick={() => change('travel_mode', value)}>
                  <b>{title}</b><small>{text}</small>
                </button>)}
              </div>
            </section>
            <Simulator rules={built.ok ? built.rules : null} error={built.ok ? '' : built.error} initialDay="weekday" initialType="travel" />
          </div>
        </TabsContent>

        <TabsContent value="entries" className="settings-pane">
          <section className="settings-card settings-narrow">
            <h3>Lançamentos e aprovação</h3>
            <div className="settings-switch"><div><label htmlFor="rules-retro">Permitir lançamentos e edições retroativas</label>
              <p className="settings-help">{form.allow_retro ? 'O colaborador pode registrar e corrigir horas de dias anteriores.' : 'O colaborador só poderá registrar horas no próprio dia. Lançamentos posteriores precisarão do coordenador.'}</p></div>
              <Switch id="rules-retro" checked={form.allow_retro} onCheckedChange={value => change('allow_retro', value)} /></div>
            <div className="settings-switch"><div><label htmlFor="rules-approval">Exigir aprovação do coordenador</label>
              <p className="settings-help">{form.approval_required ? 'Os novos lançamentos completos ficam pendentes de aprovação. É possível aprovar por colaborador e por mês.' : 'Os novos lançamentos completos são aprovados automaticamente. O coordenador acompanha o resumo e pode corrigir exceções.'}</p></div>
              <Switch id="rules-approval" checked={form.approval_required} onCheckedChange={value => change('approval_required', value)} /></div>
          </section>
        </TabsContent>

        <TabsContent value="formats" className="settings-pane">
          <section className="settings-card settings-narrow">
            <h3>Formatos</h3>
            <label className="settings-field">Moeda<select value={form.currency} onChange={event => change('currency', event.target.value)}><option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option></select></label>
            <p className="settings-help">A moeda não pode mudar depois do primeiro registro.</p>
            <label className="settings-field">Formato da data<select value={form.date_format} onChange={event => change('date_format', event.target.value)}><option value="dd/MM/yyyy">20/10/2026</option><option value="yyyy-MM-dd">2026-10-20</option></select></label>
            <label className="settings-field">Formato da hora<select value={form.time_format} onChange={event => change('time_format', event.target.value)}><option value="24h">24 horas</option><option value="12h">12 horas</option></select></label>
          </section>
        </TabsContent>

        <TabsContent value="history" className="settings-pane">
          <section className="settings-card settings-narrow">
            <h3>Como as mudanças chegam aos pontos</h3>
            <ul className="settings-list">
              <li><b>Novos lançamentos</b> usam as regras salvas aqui, no momento em que são registrados.</li>
              <li><b>Pontos já registrados</b> guardam as regras e o valor-hora da época. Salvar não reprecifica o histórico.</li>
              <li><b>Para aplicar as regras novas ao passado</b>, use o recálculo do mês no Histórico de pontos. Ele mostra uma prévia, exige motivo e fica na auditoria.</li>
              <li><b>Meses fechados</b> não são alterados.</li>
            </ul>
            {onOpenHistory && <Button type="button" variant="outline" onClick={onOpenHistory}>Abrir o histórico de pontos</Button>}
          </section>
        </TabsContent>
      </fieldset>
    </Tabs>

    {error && <p role="alert" className="settings-error">{error}</p>}
    <div className="settings-savebar">
      <span className="muted">{dirty ? (built.ok ? 'Há alterações que ainda não foram salvas.' : built.error) : 'As regras salvas já estão valendo para novos lançamentos.'}</span>
      <div>
        <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={() => load(normalizeRules(rules))}>Descartar</Button>
        <Button type="submit" disabled={busy || !revised || !dirty || !built.ok} className="action">{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? 'Salvando…' : 'Salvar configurações'}</Button>
      </div>
    </div>
  </form>;
}

/** Runs the production calculator on a sample point using the rules currently being edited. */
function Simulator({ rules, error, initialDay, initialType = 'work' }: { rules: Rules | null; error: string; initialDay: DayKey; initialType?: 'work' | 'travel' }) {
  const [input, setInput] = useState({ day: initialDay, work_type: initialType, rate: '30', ...(initialType === 'travel' ? { start: '05:00', end: '09:00', pause: '0', pauseStart: '' } : { start: '07:00', end: '18:00', pause: '60', pauseStart: '12:00' }), shiftOn: false, shiftStart: '08:00', shiftEnd: '17:00' });
  const set = (patch: Partial<typeof input>) => setInput(previous => ({ ...previous, ...patch }));
  const result = useMemo(() => {
    if (!rules) return null;
    const rate = Number(input.rate), pause = Number(input.pause) || 0;
    if (!Number.isFinite(rate) || rate < 0) return { problem: 'Informe um valor-hora válido.' };
    if (!input.start || !input.end || input.end <= input.start) return { problem: 'A saída deve ser depois da entrada.' };
    const span = asMinutes(input.end) !== null ? (asMinutes(input.end)! - asMinutes(input.start)!) : 0;
    if (pause < 0 || pause >= span) return { problem: 'O intervalo precisa ser menor que a jornada.' };
    const sample: SimulationInput = { day: input.day, work_type: input.work_type, rate, start: input.start, end: input.end, break_minutes: pause, break_start: input.pauseStart || null, shift: input.shiftOn ? { start: input.shiftStart, end: input.shiftEnd } : null };
    return { value: simulate(rules, sample) };
  }, [rules, input]);
  const value = result && 'value' in result ? result.value : null;
  return <aside className="settings-sim" aria-label="Simulador de horas extras" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}>
    <h3><Calculator size={18} />Simulador</h3>
    <p className="settings-help">Teste as regras antes de salvar. O cálculo é o mesmo usado nos pontos.</p>
    <div className="settings-sim-grid">
      <label>Tipo de dia<select value={input.day} onChange={event => set({ day: event.target.value as DayKey })}>{dayKeys.map(key => <option key={key} value={key}>{dayNames[key]}</option>)}</select></label>
      <label>Tipo de trabalho<select value={input.work_type} onChange={event => set({ work_type: event.target.value as 'work' | 'travel' })}><option value="work">Serviço</option><option value="travel">Deslocamento</option></select></label>
      <label>Entrada<input type="time" value={input.start} onChange={event => set({ start: event.target.value })} /></label>
      <label>Saída<input type="time" value={input.end} onChange={event => set({ end: event.target.value })} /></label>
      <label>Intervalo (min)<input type="number" min={0} max={1439} value={input.pause} onChange={event => set({ pause: event.target.value })} /></label>
      <label>Início do intervalo<input type="time" value={input.pauseStart} onChange={event => set({ pauseStart: event.target.value })} /></label>
      <label>Valor-hora<input type="number" min={0} step="0.01" value={input.rate} onChange={event => set({ rate: event.target.value })} /></label>
      <label className="settings-sim-check"><input type="checkbox" checked={input.shiftOn} onChange={event => set({ shiftOn: event.target.checked })} />Com turno combinado</label>
      {input.shiftOn && <>
        <label>Turno: início<input type="time" value={input.shiftStart} onChange={event => set({ shiftStart: event.target.value })} /></label>
        <label>Turno: fim<input type="time" value={input.shiftEnd} onChange={event => set({ shiftEnd: event.target.value })} /></label>
      </>}
    </div>
    <div className="settings-sim-result" aria-live="polite">
      {error ? <p className="settings-sim-problem">Corrija os campos das regras para simular: {error}</p> : result && 'problem' in result ? <p className="settings-sim-problem">{result.problem}</p> : value && rules ? <>
        <dl>
          <div><dt>Trabalhadas</dt><dd>{duration(value.worked)}</dd></div>
          <div><dt>Normais</dt><dd>{duration(value.normal)}</dd></div>
          <div><dt>Extras</dt><dd>{duration(value.extra)}</dd></div>
          <div className="is-total"><dt>Valor das extras</dt><dd>{money(value.amount, rules.currency)}</dd></div>
        </dl>
        {!!value.breakdown?.length && <ul className="settings-sim-breakdown">{value.breakdown.map((item, index) => <li key={index}><span>{duration(item.minutes)} a {item.bonus}%</span><b>{money(item.amount, rules.currency)}</b></li>)}</ul>}
        {value.calculation_warning && <p className="settings-sim-problem">{value.calculation_warning}</p>}
      </> : null}
    </div>
  </aside>;
}
