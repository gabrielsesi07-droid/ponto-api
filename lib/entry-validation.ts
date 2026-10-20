import { z } from 'zod';

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export const workTypeSchema = z.enum(['work', 'travel']);
export function validateBreakPosition(start: string, end: string, pause: number, breakStart?: string | null): boolean {
  if (pause === 0) return !breakStart;
  return !!breakStart && clock.test(breakStart) && minute(breakStart) >= minute(start)
    && minute(breakStart) + pause <= minute(end);
}
