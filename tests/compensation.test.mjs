import test from 'node:test';
import assert from 'node:assert/strict';
import { compensationSchema, DEFAULT_MONTHLY_HOURS, hourlyRateFromSalary } from '../lib/compensation.ts';
import { calculate, defaults } from '../lib/domain.ts';

test('monthly salary defaults to 200 hours and calculates the base rate', () => {
  const pay = compensationSchema.parse({ monthly_salary: 4400 });
  assert.equal(pay.monthly_hours, DEFAULT_MONTHLY_HOURS);
  assert.equal(hourlyRateFromSalary(pay.monthly_salary, pay.monthly_hours), 22);
});
test('contract hours are adjustable; rates round to cents consistently', () => {
  assert.equal(hourlyRateFromSalary(4400, 200), 22);
  assert.equal(hourlyRateFromSalary(3000, 220), 13.64);
  assert.equal(hourlyRateFromSalary(401, 200), 2.01);
  assert.equal(hourlyRateFromSalary(4500, 187.5), 24);
  assert.equal(hourlyRateFromSalary(0, 220), 0);
});
test('invalid salaries and monthly hours are rejected, not coerced into zero', () => {
  for (const monthly_salary of [-1, 1000000.01, 1.001, NaN, Infinity, null, '', '4400'])
    assert.equal(compensationSchema.safeParse({ monthly_salary, monthly_hours: 220 }).success, false);
  for (const monthly_hours of [0, -1, 0.5, 744.01, 220.001, NaN, Infinity, null, '', '220'])
    assert.equal(compensationSchema.safeParse({ monthly_salary: 4400, monthly_hours }).success, false);
});
test('new 8h/200h rules preserve historical 9h point snapshots', () => {
  const old = { id:'old', user_id:'u', date:'2026-09-21', start:'08:00', end:'19:00', break_minutes:60,
    rate:30, rules:{...defaults,daily_minutes:540}, holiday:false };
  const currentRate = hourlyRateFromSalary(4400);
  const [historical] = calculate([old]);
  const [fresh] = calculate([{ ...old, id:'new', rate:currentRate, rules:defaults }]);
  assert.equal(historical.normal, 540);
  assert.equal(historical.extra, 60);
  assert.equal(historical.amount, 45);
  assert.equal(fresh.normal, 480);
  assert.equal(fresh.amount, 66);
  assert.equal(old.rate, 30);
});
