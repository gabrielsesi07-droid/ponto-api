import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, legacyDefaults } from '../lib/domain.ts';
import { recalculationPreview } from '../lib/recalculation.ts';
import { validateBreakPosition } from '../lib/entry-validation.ts';
const entry = (patch={}) => ({id:'a',user_id:'u',date:'2026-10-07',start:'07:00',end:'18:00',break_minutes:60,rate:10,rules:legacyDefaults,holiday:false,version:1,...patch});

test('preview corrects historical 07–18 from 1h to 2h without mutating the saved snapshot', () => {
 const rows=[entry()]; const result=recalculationPreview(rows, defaults, {u:20}, false);
 assert.equal(result.before.extra,60);assert.equal(result.after.extra,120);
 assert.equal(result.before.amount,15);assert.equal(result.after.amount,30);
 assert.equal(result.without_shift,1);assert.deepEqual(result.versions,{a:1});
 assert.equal(rows[0].rules,legacyDefaults);assert.equal(rows[0].rate,10);
});
test('zero historical rate is recovered only when explicitly selected; existing positive rates stay frozen', () => {
 const rows=[entry({rate:0}),entry({id:'b',user_id:'v',rate:15})];
 const keep=recalculationPreview(rows,defaults,{u:20,v:30},false);
 const recover=recalculationPreview(rows,defaults,{u:20,v:30},true);
 assert.equal(keep.missing_rates,1);assert.equal(recover.missing_rates,0);
 assert.equal(recover.recovered_rates,1);assert.equal(recover.after.amount,105);
 assert.equal(rows[0].rate,0);assert.equal(rows[1].rate,15);
});
test('historical Saturday preview counts the normal quota before applying the progressive bands', () => {
 const result=recalculationPreview([entry({date:'2026-10-10',end:'20:00'})],defaults,{u:20},false);
 assert.equal(result.before.extra,720);assert.equal(result.after.extra,240);assert.equal(result.after.amount,68);
});
test('custom break must be positioned wholly within the actual record', () => {
 assert.equal(validateBreakPosition('07:00','18:00',60,'12:00'),true);
 assert.equal(validateBreakPosition('07:00','18:00',60,'17:30'),false);
 assert.equal(validateBreakPosition('07:00','18:00',60,null),false);
 assert.equal(validateBreakPosition('07:00','18:00',0,null),true);
 assert.equal(validateBreakPosition('07:00','18:00',0,'12:00'),false);
 assert.equal(validateBreakPosition('21:00','23:00',180,'22:00'),false);
});
test('confirmed shift replaces historical reference only when explicitly supplied to the preview', () => {
 const oldShift={start:'09:00',end:'18:00',break_start:'12:00',break_end:'13:00'};
 const corrected={...oldShift,start:'08:00',end:'17:00'};
 const rows=[entry({start:'09:00',end:'18:00',break_mode:'custom',break_start:'12:00',shift:oldShift,rules:defaults})];
 const keep=recalculationPreview(rows,defaults,{u:20},false);
 const change=recalculationPreview(rows,defaults,{u:20},false,{a:corrected});
 assert.equal(keep.after.extra,0);assert.equal(change.after.extra,60);assert.equal(change.updated_shifts,1);
 assert.equal(rows[0].shift,oldShift);
});
