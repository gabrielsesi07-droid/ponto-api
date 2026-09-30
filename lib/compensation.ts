import { z } from 'zod';

export const DEFAULT_MONTHLY_HOURS = 220;

// Cents and hundredths of hours keep the preview aligned with PostgreSQL numeric.
export const compensationSchema = z.object({
  monthly_salary: z.number({ required_error: 'Informe seu salário bruto mensal.', invalid_type_error: 'Informe um salário válido.' })
    .finite().min(0, 'O salário não pode ser negativo.').max(1000000, 'O salário deve ser de até 1.000.000.').multipleOf(0.01, 'Use até duas casas decimais no salário.'),
  monthly_hours: z.number({ invalid_type_error: 'Informe as horas mensais do contrato.' })
    .finite().min(1, 'As horas mensais devem ser de pelo menos 1 hora.').max(744, 'As horas mensais devem ser de até 744 horas.').multipleOf(0.01, 'Use até duas casas decimais nas horas.').default(DEFAULT_MONTHLY_HOURS),
});

export function hourlyRateFromSalary(salary: number, hours: number): number {
  const value = compensationSchema.parse({ monthly_salary: salary, monthly_hours: hours });
  const salaryCents = Math.round(value.monthly_salary * 100);
  const hoursHundredths = Math.round(value.monthly_hours * 100);
  return Math.round(salaryCents * 100 / hoursHundredths) / 100;
}
