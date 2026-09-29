import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin, sessionCookie } from '../lib/pin.ts';
test('PIN hashes are salted and only the matching PIN verifies',async()=>{
 const a=await hashPin('846291'),b=await hashPin('846291');
 assert.notEqual(a,b); assert.equal(await verifyPin('846291',a),true); assert.equal(await verifyPin('000000',a),false);
 assert.equal(await verifyPin('846291','malformed'),false);
});
test('Session cookie has production flags and logout expires it',()=>{
 const req=new Request('https://example.invalid');
 const cookie=sessionCookie('test-token',req);
 for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=2592000']) assert.ok(cookie.includes(flag));
 assert.ok(sessionCookie('',req,0).includes('Max-Age=0'));
 assert.ok(!sessionCookie('test-token',req,0.5).includes('Max-Age='));
});
