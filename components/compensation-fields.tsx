"use client";
import { compensationSchema, hourlyRateFromSalary } from '@/lib/compensation';
import { money } from '@/lib/domain';

export function CompensationFields({ salary, hours, onSalary, onHours, currency = 'BRL', legacyRate = 0, required = false }: {
  salary: string; hours: string; onSalary: (value: string) => void; onHours: (value: string) => void;
  currency?: string; legacyRate?: number; required?: boolean;
}) {
  const valid = salary.trim() !== '' && hours.trim() !== '' && compensationSchema.safeParse({ monthly_salary: Number(salary), monthly_hours: Number(hours) }).success;
  return (
    <fieldset className="full min-w-0 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <legend className="px-1 font-semibold">Salário e cálculo da hora</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0">Salário bruto mensal ({currency})
          <input type="number" inputMode="decimal" value={salary} onChange={e => onSalary(e.target.value)}
            min={0} max={1000000} step="0.01" required={required} placeholder="Ex.: 4400,00" />
        </label>
        <label className="min-w-0">Carga horária mensal (horas)
          <input type="number" inputMode="decimal" value={hours} onChange={e => onHours(e.target.value)}
            min={1} max={744} step="0.01" required />
        </label>
      </div>
      <p className="mt-3 text-sm muted">Padrão da empresa: 8h por dia, de segunda a sexta, 40h semanais e divisor de 200h mensais. Informe o salário bruto, antes dos descontos.</p>
      <div className="mt-3 rounded-lg bg-white p-3 text-sm" role="status" aria-live="polite" aria-atomic="true">
        {valid ? <>
          <span className="block">{money(Number(salary), currency)} ÷ {Number(hours).toLocaleString('pt-BR')} horas mensais</span>
          <b className="mt-1 block text-lg text-blue-900">Valor-hora calculado: {money(hourlyRateFromSalary(Number(salary), Number(hours)), currency)}</b>
          <span className="mt-1 block muted">Arredondado para centavos. Os adicionais de horas extras são aplicados depois.</span>
        </> : salary.trim() ? <span>Confira o salário e as horas mensais para calcular.</span> : <span>
          Informe seu salário para calcular automaticamente.{legacyRate > 0 ? ` Até lá, será mantido o valor-hora já cadastrado: ${money(legacyRate, currency)}.` : ' Você também pode configurar depois em Meu acesso.'}
        </span>}
      </div>
    </fieldset>
  );
}
