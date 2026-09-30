/** Explicit times only: never infer worked hours from a planned schedule. */
export function automaticBreakMinutes(start: string, end: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)) return 0;
  const a = Number(start.slice(0,2))*60+Number(start.slice(3,5));
  const b = Number(end.slice(0,2))*60+Number(end.slice(3,5));
  if (b <= a) return 0;
  // One standard window per record; lunch takes precedence over evening break.
  const overlap = (from: number, to: number) => Math.max(0, Math.min(b,to)-Math.max(a,from));
  return overlap(720,780) || overlap(1140,1200);
}

const validStart = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validEnd = (s: string) => /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s);
const toMinutes = (s: string) => Number(s.slice(0,2))*60+Number(s.slice(3,5));

/**
 * One automatic break per person/day, mirrored by horacerta.recompute_auto_breaks.
 * If the day (first start to last end, across every record) spans 12:00–13:00 that is the
 * break window, even when the lunch hour itself was an unrecorded gap; otherwise 19:00–20:00.
 * Each automatic record deducts only the part it worked inside that window, so two records
 * of the same day never deduct lunch and dinner breaks together.
 */
export function automaticBreakForDay(start: string, end: string, sameDay: {start: string; end: string | null}[]): number {
  if (!validStart(start) || !validEnd(end) || toMinutes(end) <= toMinutes(start)) return 0;
  const spans = [{start, end}, ...sameDay.filter((e): e is {start: string; end: string} => !!e.end && validEnd(e.end.slice(0,5)))]
    .map(e => [toMinutes(e.start.slice(0,5)), toMinutes(e.end.slice(0,5))]);
  const first = Math.min(...spans.map(s => s[0])), last = Math.max(...spans.map(s => s[1]));
  const [from, to] = Math.min(last,780) > Math.max(first,720) ? [720,780] : [1140,1200];
  return Math.max(0, Math.min(toMinutes(end),to) - Math.max(toMinutes(start),from));
}

export function workedMinutes(start: string, end: string, pause: number): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)) return null;
  if (!Number.isInteger(pause) || pause < 0 || pause >= 1440) return null;
  const minutes = (s: string) => Number(s.slice(0,2)) * 60 + Number(s.slice(3,5));
  const total = minutes(end) - minutes(start) - pause;
  return total > 0 ? total : null;
}
