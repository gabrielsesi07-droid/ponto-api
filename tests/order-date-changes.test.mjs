import test from 'node:test';
import assert from 'node:assert/strict';
import { brasiliaInputToIso, orderScheduleSchema, tripDatesSchema } from '../lib/order-date-changes.ts';

const id = '54007b2a-3c72-46d2-bfe9-8ab86aaf13e7';
const schedule = { id, version: 2, starts_at: '2026-10-06T11:00:00Z', ends_at: '2026-10-10T21:00:00Z', reason: 'Cliente solicitou reagendamento.' };
const trip = { id, trip_id: id, expected_departed_at: '2020-10-06T11:00:00Z', expected_returned_at: '2020-10-10T21:00:00Z', departed_at: '2020-10-06T10:00:00Z', returned_at: '2020-10-10T20:00:00Z', reason: 'Conferido com o motorista da viagem.' };

test('Formulários convertem datas de Brasília sem depender do fuso do computador', () => {
  assert.equal(brasiliaInputToIso('2026-10-08T09:45'), '2026-10-08T12:45:00.000Z');
  assert.equal(brasiliaInputToIso('2026-10-08T23:50'), '2026-10-09T02:50:00.000Z');
  for (const value of ['', '2026-02-30T08:00', '2026-02-29T08:00', '2026-04-31T08:00', '2026-10-08T24:01', '2026-10-08T08:60', '2026-10-08', '08/10/2026T09:45']) {
    assert.throws(() => brasiliaInputToIso(value), /data e um horário válidos/, value);
  }
  assert.equal(brasiliaInputToIso('2024-02-29T08:00'), '2024-02-29T11:00:00.000Z');
});

test('Reprogramação exige versão, motivo e período válido, permitindo mudar ida e volta', () => {
  assert.equal(orderScheduleSchema.safeParse(schedule).success, true);
  for (const patch of [{version: undefined}, {version: 0}, {reason: 'curto'}, {reason: ' '.repeat(20)}, {reason: 'a'.repeat(1001)}, {starts_at: '2026-02-30T11:00:00Z'}, {ends_at: schedule.starts_at}, {ends_at: '2026-10-05T11:00:00Z'}]) {
    assert.equal(orderScheduleSchema.safeParse({...schedule, ...patch}).success, false, JSON.stringify(patch));
  }
});

test('Datas da viagem preservam situação e identificadores usados na concorrência', () => {
  assert.equal(tripDatesSchema.safeParse(trip).success, true);
  assert.equal(tripDatesSchema.safeParse({...trip, expected_returned_at: null, returned_at: null}).success, true);
  for (const patch of [{trip_id: undefined}, {expected_departed_at: undefined}, {expected_returned_at: undefined}, {reason: 'curto'}, {returned_at: null}, {expected_returned_at: null}, {returned_at: '2020-10-05T11:00:00Z'}]) {
    assert.equal(tripDatesSchema.safeParse({...trip, ...patch}).success, false, JSON.stringify(patch));
  }
});

test('Correções de datas reais rejeitam saída ou retorno no futuro', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(tripDatesSchema.safeParse({...trip, departed_at: future, returned_at: future}).success, false);
  assert.equal(tripDatesSchema.safeParse({...trip, returned_at: future}).success, false);
  assert.equal(tripDatesSchema.safeParse({...trip, expected_returned_at: null, returned_at: null, departed_at: future}).success, false);
});
