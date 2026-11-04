import test from 'node:test';
import assert from 'node:assert/strict';
import { isOvernight, normalizeEnd, splitOvernight, nextDate } from '../lib/overnight-shift.ts';

test('Saída antes da entrada é jornada que vira o dia', () => {
  assert.equal(isOvernight('15:00', '02:00'), true);
  assert.equal(isOvernight('08:00', '17:00'), false);
  assert.equal(isOvernight('15:00', ''), false);
});

test('Saída 00:00 depois de uma entrada no dia significa 24:00', () => {
  assert.equal(normalizeEnd('15:00', '00:00'), '24:00');
  assert.equal(isOvernight('15:00', '00:00'), false);
});

test('A jornada é dividida em dois registros nas datas corretas', () => {
  assert.deepEqual(splitOvernight('2026-10-30', '15:00', '02:00'), [
    { date: '2026-10-30', start: '15:00', end: '24:00' },
    { date: '2026-10-31', start: '00:00', end: '02:00' },
  ]);
  assert.equal(nextDate('2026-12-31'), '2027-01-01');
  assert.equal(nextDate('2028-02-28'), '2028-02-29');
});
