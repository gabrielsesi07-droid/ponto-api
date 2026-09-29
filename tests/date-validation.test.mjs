import test from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarDate } from '../lib/date-validation.ts';
test('Calendar validation rejects rollover dates instead of letting database fail',()=>{
 for(const value of ['2026-02-30','2026-02-29','2026-04-31','2026-13-01','2026-00-10','2026-09-00','not-a-date','2026-9-1']) assert.equal(isCalendarDate(value),false,value);
 for(const value of ['2024-02-29','2026-09-29','2026-12-31']) assert.equal(isCalendarDate(value),true,value);
});
