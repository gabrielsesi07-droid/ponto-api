import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapConfigured, validBootstrapToken, randomTemporaryPin, pinAccessAllowed, pinPattern } from '../lib/pin.ts';

test('bootstrap requires a configured deployment secret and exact proof', async () => {
  const secret = 'qa-deployment-secret-with-at-least-32-characters';
  assert.equal(bootstrapConfigured(undefined), false);
  assert.equal(bootstrapConfigured('short'), false);
  assert.equal(await validBootstrapToken(secret, secret), true);
  for (const input of [undefined, null, {}, secret + 'x', 'x'.repeat(1025)])
    assert.equal(await validBootstrapToken(input, secret), false);
  assert.equal(await validBootstrapToken('short', 'short'), false);
});

test('temporary PINs are six digits and exclude the old shared credential', () => {
  const generated = new Set();
  for (let i = 0; i < 500; i++) {
    const pin = randomTemporaryPin();
    assert.match(pin, pinPattern);
    assert.notEqual(pin, '123456');
    generated.add(pin);
  }
  assert.ok(generated.size > 450);
});

test('mandatory PIN changes deny operational access but allow the recovery path', () => {
  assert.equal(pinAccessAllowed(true), false);
  assert.equal(pinAccessAllowed(true, true), true);
  assert.equal(pinAccessAllowed(false), true);
});
