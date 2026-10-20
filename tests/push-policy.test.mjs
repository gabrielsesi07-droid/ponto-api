import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pushTtl, pushFailure, pushPayload, pushCronAuthorized, createPushCronHandler, runPushDispatch } from '../lib/push-policy.ts';

const now = Date.parse('2026-10-01T12:00:00Z');
const job = { id: 'job-private', order_id: 'order-private', user_id: 'person-private', subscription_id: 'device-private',
  lease_token: 'lease-private', kind: 'assigned', attempts: 1, created_at: new Date(now - 3600000).toISOString() };
const recipient = { endpoint: 'https://fcm.googleapis.com/private-endpoint', p256dh: 'private-key', auth: 'private-auth',
  updated_at: new Date(now).toISOString(), number: 42, status: 'Agendada' };
const emptyReport = { configMissing: false, claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, expired: 0, revokedDevices: 0, leaseLost: 0, durationMs: 0, reasons: {} };
function fixture(patch = {}) {
  let claimed = false;
  const finalizations = [], store = {
    configuration: async () => ({ public_key: 'public-vapid', private_key: 'secret-vapid' }),
    expire: async () => ({ expired: 0, exhausted: 0 }),
    claim: async () => { if (claimed) return []; claimed = true; return [{ ...job }]; },
    recipient: async () => ({ recipient: { ...recipient } }),
    finalize: async (job, result) => { finalizations.push(result); return true; },
    revoke: async () => true, ...patch,
  };
  return { store, finalizations };
}

test('provider TTL stays within the remaining 24h window and rejects malformed/expired dates', () => {
  assert.equal(pushTtl(job.created_at, now), 23 * 3600);
  assert.equal(pushTtl(new Date(now - 86400000).toISOString(), now), 0);
  assert.equal(pushTtl(new Date(now - 86399500).toISOString(), now), 0);
  assert.equal(pushTtl('invalid', now), 0);
  assert.ok(pushTtl(new Date(now + 3600000).toISOString(), now) <= 86400);
});

test('provider failures distinguish unusable devices, permanent rejection and bounded retry', () => {
  for (const code of [404, 410]) assert.equal(pushFailure(code, 1).reason, 'endpoint_expired');
  for (const code of [400, 401, 403]) assert.equal(pushFailure(code, 1).status, 'failed');
  for (const code of [0, 408, 429, 500, 503]) {
    assert.equal(pushFailure(code, 3).status, 'pending');
    assert.equal(pushFailure(code, 4).status, 'failed');
  }
});

test('cron authorization fails closed without a strong secret and does not accept cookies/header variants', () => {
  for (const secret of [undefined, '', 'short']) assert.equal(pushCronAuthorized(secret, 'Bearer undefined'), false);
  const secret = 'a'.repeat(32);
  for (const header of [null, secret, 'bearer ' + secret, 'Bearer wrong', 'Bearer ' + secret + ' ']) assert.equal(pushCronAuthorized(secret, header), false);
  assert.equal(pushCronAuthorized(secret, 'Bearer ' + secret), true);
});

test('cron waits for dispatch, disables caching, and never leaks a failed dispatch error', async () => {
  const secret = 'a'.repeat(32); let release, calls = 0, failures = 0;
  const work = new Promise(resolve => release = resolve);
  const handler = createPushCronHandler({ secret: () => secret, dispatch: async () => { calls++; return work; }, onError: () => failures++ });
  const denied = await handler(new Request('https://qa.invalid/api/cron/push'));
  assert.equal(denied.status, 401); assert.equal(calls, 0); assert.equal(denied.headers.get('Cache-Control'), 'no-store');
  let settled = false;
  const responsePromise = handler(new Request('https://qa.invalid/api/cron/push', { headers: { authorization: 'Bearer ' + secret } }));
  responsePromise.then(() => settled = true); await Promise.resolve();
  assert.equal(settled, false); assert.equal(calls, 1);
  release(emptyReport); const response = await responsePromise;
  assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
  const failing = createPushCronHandler({ secret: () => secret, dispatch: async () => { throw new Error('secret-endpoint-token'); }, onError: () => failures++ });
  const failure = await failing(new Request('https://qa.invalid', { headers: { authorization: 'Bearer ' + secret } }));
  assert.equal(failure.status, 503); assert.equal(failures, 1); assert.doesNotMatch(await failure.text(), /secret-endpoint-token/);
  const unconfigured = createPushCronHandler({ secret: () => secret, dispatch: async () => ({ ...emptyReport, configMissing: true }), onError: () => {} });
  assert.equal((await unconfigured(new Request('https://qa.invalid', { headers: { authorization: 'Bearer ' + secret } }))).status, 503);
});

test('missing VAPID is diagnosed and expirations recorded without claiming/sending jobs', async () => {
  const { store } = fixture({ configuration: async () => null, expire: async () => ({ expired: 2, exhausted: 0 }), claim: async () => assert.fail('No claim without VAPID') });
  const report = await runPushDispatch({ store, send: async () => assert.fail('No send without VAPID'), endpointAllowed: () => true, now: () => now });
  assert.equal(report.configMissing, true); assert.equal(report.expired, 2); assert.equal(report.skipped, 2);
});

test('dispatcher passes only remaining TTL and summarizes without identifiers or secrets', async () => {
  const { store } = fixture(); let options;
  const report = await runPushDispatch({ store, send: async (subscription, payload, received) => { options = received; assert.equal(JSON.parse(payload).tag, 'os-' + job.order_id); }, endpointAllowed: () => true, now: () => now });
  assert.equal(options.TTL, 23 * 3600); assert.equal(report.sent, 1);
  for (const value of [...Object.values(job).filter(value => typeof value === 'string'), recipient.endpoint, recipient.p256dh, recipient.auth, 'secret-vapid'])
    assert.ok(!JSON.stringify(report).includes(value), `Summary must not contain fixture value ${value}`);
});

test('rejected provider promises, including undefined, never count as accepted', async () => {
  for (const error of [undefined, null, { statusCode: 429 }, { statusCode: 403 }]) {
    const { store } = fixture();
    const report = await runPushDispatch({ store, send: async () => { throw error; }, endpointAllowed: () => true, now: () => now });
    assert.equal(report.sent, 0); assert.equal(report.retried + report.failed, 1);
  }
});

test('store failures propagate rather than consuming another provider retry', async () => {
  const { store } = fixture({ finalize: async () => { throw new Error('QA database unavailable'); } });
  await assert.rejects(runPushDispatch({ store, send: async () => {}, endpointAllowed: () => true, now: () => now }), /QA database unavailable/);
});

test('stale lease cannot revoke a re-registered device or report a successful write', async () => {
  const { store } = fixture({ finalize: async () => false, revoke: async () => assert.fail('Stale worker cannot revoke') });
  const report = await runPushDispatch({ store, send: async () => { throw { statusCode: 410 }; }, endpointAllowed: () => true, now: () => now });
  assert.equal(report.leaseLost, 1); assert.equal(report.failed, 0); assert.equal(report.revokedDevices, 0);
});

test('notification text keeps assignment and hours events distinct without claiming a read receipt', () => {
  assert.match(JSON.parse(pushPayload(job, recipient)).body, /OS-000042/);
  const hours = JSON.parse(pushPayload({ ...job, kind: 'hours' }, { ...recipient, status: 'Cancelada' }));
  assert.match(hours.body, /cancelada/); assert.match(hours.body, /ainda não há horas/);
  assert.equal(hours.tag, 'horas-' + job.order_id);
});

test('SQL push tests refuse DATABASE_URL-only or production environments before opening a connection', () => {
  for (const env of [{ DATABASE_URL: 'postgresql://invalid@production.invalid/production' },
    { HORACERTA_LOCAL_NEON_TEST: '1', TEST_DATABASE_URL: 'postgresql://invalid@127.0.0.1:55432/horacerta_qa', NODE_ENV: 'production' }]) {
    for (const file of ['tests/push-migration.mjs', 'tests/push-reliability.integration.mjs']) {
      const result = spawnSync(process.execPath, [file], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8', timeout: 10000 });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /explicit local QA/);
      assert.doesNotMatch(result.stderr, /getaddrinfo|ECONNREFUSED/);
    }
  }
});
