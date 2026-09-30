"use client";
import { useState } from 'react';
import { ptBR } from 'react-day-picker/locale';
import { Calendar } from './ui/calendar';
import { Button } from './ui/button';
import { today } from '@/lib/domain';

// Local calendar days (not UTC timestamps) avoid moving the selected day by timezone.
const calendarDay = (value: string) => new Date(value + 'T12:00:00');
export function PointDatePicker({ value, onChange, initiallyOpen, disabled = false }: {
  value: string; onChange: (value: string) => void; initiallyOpen: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const lastDay = calendarDay(today());
  return (
    <section className="full min-w-0 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="min-w-0 flex-1">Data do ponto
          <input type="date" required value={value} max={today()} disabled={disabled} onChange={e => onChange(e.target.value)} />
        </label>
        <Button type="button" variant="outline" disabled={disabled} aria-expanded={open} aria-controls="point-calendar"
          onClick={() => setOpen(v => !v)}>{open ? 'Ocultar calendário' : 'Abrir calendário'}</Button>
      </div>
      {open && <div id="point-calendar" className="mt-3 flex flex-col items-center">
        <p className="mb-2 text-center text-sm text-blue-900">Escolha o dia em que o trabalho foi realizado.</p>
        <Calendar mode="single" locale={ptBR} captionLayout="dropdown" endMonth={lastDay} today={lastDay}
          defaultMonth={value ? calendarDay(value) : lastDay} selected={value ? calendarDay(value) : undefined}
          disabled={disabled ? true : { after: lastDay }} required
          className="max-w-full rounded-lg border bg-white [--cell-size:2.25rem]"
          onSelect={date => {
            if (!date) return;
            onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
            setOpen(false);
          }} />
      </div>}
    </section>
  );
}
