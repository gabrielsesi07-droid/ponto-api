/** Explicit times only: never infer worked hours from a planned schedule. */
export function workedMinutes(start: string, end: string, pause: number): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)) return null;
  if (!Number.isInteger(pause) || pause < 0 || pause >= 1440) return null;
  const minutes = (s: string) => Number(s.slice(0,2)) * 60 + Number(s.slice(3,5));
  const total = minutes(end) - minutes(start) - pause;
  return total > 0 ? total : null;
}
