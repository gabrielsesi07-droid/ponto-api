import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const reason = z.string().trim().min(10, 'Explique a alteração em pelo menos 10 caracteres.').max(1000);

export const orderScheduleSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  starts_at: timestamp,
  ends_at: timestamp,
  reason,
}).refine(p => new Date(p.ends_at) > new Date(p.starts_at), {
  path: ['ends_at'], message: 'A previsão de término deve ser após o início.',
});

export const tripDatesSchema = z.object({
  id: z.string().uuid(),
  trip_id: z.string().uuid(),
  expected_departed_at: timestamp,
  expected_returned_at: timestamp.nullable(),
  departed_at: timestamp,
  returned_at: timestamp.nullable(),
  reason,
}).superRefine((p, context) => {
  if ((p.expected_returned_at === null) !== (p.returned_at === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['returned_at'], message: 'A correção de data deve manter a situação atual da viagem.' });
  }
  if (p.returned_at && new Date(p.returned_at) < new Date(p.departed_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['returned_at'], message: 'O retorno não pode ser anterior à saída.' });
  }
  if (new Date(p.departed_at).getTime() > Date.now() || (p.returned_at && new Date(p.returned_at).getTime() > Date.now())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['departed_at'], message: 'Informe a data e a hora em que a viagem realmente aconteceu, sem datas futuras.' });
  }
});

/** Os formulários operacionais usam o horário de Brasília, independentemente do computador. */
export function brasiliaInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !timestamp.safeParse(value + ':00-03:00').success) {
    throw new Error('Informe uma data e um horário válidos.');
  }
  return new Date(value + ':00-03:00').toISOString();
}
