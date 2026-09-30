import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticBreakMinutes, automaticBreakForDay, workedMinutes} from '../lib/manual-work.ts';
test('automatic break selects only one intersecting window, including partial shifts', () => {
  for (const [start,end,expected] of [['10:00','22:00',60],['08:00','18:00',60],['14:00','23:00',60],['08:00','12:00',0],['13:00','19:00',0],['12:30','18:00',30],['19:30','22:00',30],['20:00','24:00',0],['12:30','22:00',30],['','',0]]) {
    assert.equal(automaticBreakMinutes(start,end),expected, `${start}–${end}`);
  }
  assert.equal(workedMinutes('10:00','22:00',automaticBreakMinutes('10:00','22:00')),660);
  assert.equal(workedMinutes('10:00','22:00',90),630);
  assert.equal(workedMinutes('10:00','22:00',0),720);
});
test('manual work previews net duration without inventing times', () => {
  assert.equal(workedMinutes('08:00','18:00',60),540);
  assert.equal(workedMinutes('22:00','24:00',0),120);
  assert.equal(workedMinutes('00:00','02:00',15),105);
  for (const [start,end,pause] of [['','18:00',0],['08:00','',0],['18:00','08:00',0],['08:00','09:00',60],['08:00','09:00',-1],['25:00','26:00',0],['08:00','09:00',0.5]]) assert.equal(workedMinutes(start,end,pause),null);
});
test('automatic break is shared by every record of the same person/day', () => {
  // Bug fixed: 10–14 (lunch) + 14–20 (evening) used to deduct 60 + 60.
  const morning = {start:'10:00',end:'14:00'}, afternoon = {start:'14:00',end:'20:00'};
  assert.equal(automaticBreakForDay('10:00','14:00',[afternoon]) + automaticBreakForDay('14:00','20:00',[morning]), 60);
  // Lunch taken as an unrecorded gap: no extra evening deduction.
  assert.equal(automaticBreakForDay('13:00','22:00',[{start:'08:00',end:'12:00'}]), 0);
  // Partial gap: 30 min unrecorded + 30 min deducted inside the record.
  assert.equal(automaticBreakForDay('12:30','22:00',[{start:'08:00',end:'12:00'}]), 30);
  // Day outside lunch keeps the evening window.
  assert.equal(automaticBreakForDay('14:00','23:00',[]), 60);
  assert.equal(automaticBreakForDay('14:00','18:00',[{start:'18:00',end:'23:00'}]), 0);
  assert.equal(automaticBreakForDay('18:00','23:00',[{start:'14:00',end:'18:00'}]), 60);
  // Open records and invalid values are ignored; a lone record matches the per-record rule.
  assert.equal(automaticBreakForDay('14:00','23:00',[{start:'08:00',end:null}]), 60);
  for (const [start,end] of [['10:00','22:00'],['08:00','18:00'],['12:30','18:00'],['19:30','22:00'],['08:00','12:00'],['20:00','24:00']])
    assert.equal(automaticBreakForDay(start,end,[]), automaticBreakMinutes(start,end), `${start}–${end}`);
  assert.equal(automaticBreakForDay('','',[]), 0);
});
