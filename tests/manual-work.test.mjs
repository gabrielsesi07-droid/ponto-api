import test from 'node:test';
import assert from 'node:assert/strict';
import {workedMinutes} from '../lib/manual-work.ts';
test('manual work previews net duration without inventing times', () => {
  assert.equal(workedMinutes('08:00','18:00',60),540);
  assert.equal(workedMinutes('22:00','24:00',0),120);
  assert.equal(workedMinutes('00:00','02:00',15),105);
  for (const [start,end,pause] of [['','18:00',0],['08:00','',0],['18:00','08:00',0],['08:00','09:00',60],['08:00','09:00',-1],['25:00','26:00',0],['08:00','09:00',0.5]]) assert.equal(workedMinutes(start,end,pause),null);
});
