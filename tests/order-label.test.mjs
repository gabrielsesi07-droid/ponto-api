import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLabel } from '../lib/order-label.mjs';
import { pointOrderNumber } from '../lib/point-orders.ts';
import { osLabel } from '../lib/coordinator-center.ts';
import { pushPayload } from '../lib/push-policy.ts';
test('official reference takes precedence and preserves document formatting', () => {
  for (const f of [orderLabel,pointOrderNumber,osLabel]) {
    assert.equal(f(108,'4831'),'OS 4831');
    assert.equal(f(108,' OS 004831/26 '),'OS 004831/26');
    assert.equal(f(108,'OS-4831'),'OS-4831');
    assert.equal(f(108,'AB-004831'),'OS AB-004831');
    for (const empty of [null,undefined,'','  ']) assert.equal(f(108,empty),'OS-000108');
    assert.equal(f(1234567),'OS-1234567');
  }
});
test('push shows official reference and keeps UUID deep link',()=>{
 const payload=JSON.parse(pushPayload({kind:'assigned',order_id:'stable-id'},{number:108,official_number:'4831',status:'Agendada'}));
 assert.match(payload.body,/OS 4831/); assert.doesNotMatch(payload.body,/000108/); assert.equal(payload.url,'/?view=orders&order=stable-id');
});
