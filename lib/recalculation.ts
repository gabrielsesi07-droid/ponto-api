import { calculate, totals, type Entry, type Rules, type Shift } from './domain.ts';

export function recalculationPreview(entries: Entry[], rules: Rules, rates: Record<string, number>, fillMissingRates: boolean, shifts: Record<string, Shift> = {}) {
  const next = entries.map(e => ({ ...e, rules, shift: shifts[e.id] ?? e.shift, rate: fillMissingRates && Number(e.rate) === 0 && rates[e.user_id] > 0 ? rates[e.user_id] : Number(e.rate) }));
  const before = calculate(entries), after = calculate(next);
  return {
    before: totals(before), after: totals(after), entries: entries.length,
    missing_rates: after.filter(e => e.extra > 0 && e.missing_rate).length,
    recovered_rates: next.filter((e, i) => Number(e.rate) !== Number(entries[i].rate)).length,
    updated_shifts: next.filter((e,i) => JSON.stringify(e.shift ?? null) !== JSON.stringify(entries[i].shift ?? null)).length,
    without_shift: next.filter(e => !e.shift && (e.work_type || 'work') === 'work').length,
    versions: Object.fromEntries(entries.map(e => [e.id, e.version])),
  };
}
