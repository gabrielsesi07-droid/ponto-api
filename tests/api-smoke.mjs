import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { randomTemporaryPin, verifyPin } from '../lib/pin.ts';

// Current contract: manual completed hours; temporary invitations; controlled bootstrap.
if (!process.env.TEST_DATABASE_URL || !process.env.HORACERTA_BOOTSTRAP_TOKEN)
  throw new Error('Use TEST_DATABASE_URL for an empty isolated database and HORACERTA_BOOTSTRAP_TOKEN; start the local server with DATABASE_URL=TEST_DATABASE_URL.');
if (process.env.DATABASE_URL) {
  const a = new URL(process.env.TEST_DATABASE_URL), b = new URL(process.env.DATABASE_URL);
  if (a.hostname + a.pathname === b.hostname + b.pathname) throw new Error('The test database must differ from DATABASE_URL.');
}
const base = process.env.TEST_BASE_URL || 'http://localhost:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Only a local isolated test server is allowed.');
const sql = neon(process.env.TEST_DATABASE_URL), tag = crypto.randomUUID().slice(0, 8);
const username = 'qa_security_' + tag, adminPin = randomTemporaryPin(), finalPin = '846291';
let admin, worker, orderId, clientId;
const cookies = new Map();
async function call(path, body, who, method = 'POST') {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : method,
    headers: { ...(cookies.has(who) ? { cookie: cookies.get(who) } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json', origin: base }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
let checks = 0;
function expect(result, status, label) { assert.equal(result.status, status, label + ': ' + JSON.stringify(result.data)); checks++; console.log('PASS ' + label); return result; }
assert.equal((await sql`SELECT count(*)::int n FROM horacerta.users`)[0].n, 0, 'Requires an empty isolated migrated database');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
try {
  const deniedBootstrap = expect(await call('/api/session', { name: 'QA Admin', username, pin: adminPin }, null), 403, 'bootstrap rejects missing deployment proof');
  assert.match(deniedBootstrap.data.error, /Configuração inicial não autorizada/);
  const bootstrap = expect(await call('/api/session', { name: 'QA Admin', username, pin: adminPin, bootstrap_token: process.env.HORACERTA_BOOTSTRAP_TOKEN }, null), 200, 'authorized bootstrap uses a personal PIN');
  [admin] = await sql`SELECT * FROM horacerta.users WHERE username=${username}`;
  assert.ok(admin, 'The local server must be connected to TEST_DATABASE_URL');
  assert.equal(await verifyPin(adminPin, admin.pin_hash), true);
  assert.equal(admin.pin_change_required, false);
  cookies.set(admin.id, bootstrap.cookie);
  expect(await call('/api/session', { name: 'Other Admin', pin: adminPin, bootstrap_token: process.env.HORACERTA_BOOTSTRAP_TOKEN }, null), 409, 'bootstrap cannot run twice');
  const discovered = expect(await call('/api/login?name=QA', undefined, null), 200, 'public discovery returns no people');
  assert.deepEqual(discovered.data.people, []);
  const created = expect(await call('/api/manage', { entity: 'user', data: { name: 'QA Worker', username: username + '_worker' } }, admin.id), 200, 'coordinator receives a random invitation');
  worker = created.data.person;
  assert.match(created.data.temporary_pin, /^\d{6}$/); assert.notEqual(created.data.temporary_pin, '123456');
  const login = expect(await call('/api/login', { access_code: worker.access_code, pin: created.data.temporary_pin }, null), 200, 'invitation grants restricted session');
  cookies.set(worker.id, login.cookie);
  const self = expect(await call('/api/session', undefined, worker.id), 200, 'mandatory change still allows session recovery');
  assert.equal(self.data.me.pin_change_required, true); assert.equal(self.data.me.email, undefined);
  const blocked = expect(await call(`/api/state?from=${today}&to=${today}`, undefined, worker.id), 403, 'temporary session cannot read operational state');
  assert.equal(blocked.data.code, 'PIN_CHANGE_REQUIRED');
  expect(await call('/api/manage', { entity: 'pin_prompt', data: {} }, worker.id), 403, 'dismissal cannot bypass mandatory change');
  expect(await call('/api/login', { access_code: worker.access_code, pin: created.data.temporary_pin }, null), 401, 'temporary PIN is consumed once');
  expect(await call('/api/manage', { entity: 'profile', data: { name: worker.name, pin: created.data.temporary_pin } }, worker.id), 400, 'must choose a different PIN');
  const personalPin = created.data.temporary_pin === finalPin ? '731905' : finalPin;
  expect(await call('/api/manage', { entity: 'profile', data: { name: worker.name, pin: personalPin, monthly_salary: 4000, monthly_hours: 200 } }, worker.id), 200, 'mandatory change remains usable');
  expect(await call(`/api/state?from=${today}&to=${today}`, undefined, worker.id), 403, 'PIN change revokes the old session');
  const permanent = expect(await call('/api/login', { access_code: worker.access_code, pin: personalPin }, null), 200, 'personal PIN authenticates');
  cookies.set(worker.id, permanent.cookie);
  expect(await call(`/api/state?from=${today}&to=${today}`, undefined, worker.id), 200, 'personal PIN unlocks operational state');
  const order = expect(await call('/api/operations', { action: 'save_order', data: { title: 'QA manual work ' + tag, client_name: 'QA client ' + tag, members: [worker.id], vehicle_id: null, starts_at: today + 'T00:00:00-03:00', ends_at: today + 'T23:59:00-03:00' } }, admin.id), 200, 'coordinator schedules an assigned OS');
  orderId = order.data.id;
  [{ client_id: clientId }] = await sql`SELECT client_id FROM horacerta.orders WHERE id=${orderId}`;
  const hours = { user_id: worker.id, order_id: orderId, date: today, start: '08:00', end: '09:00', break_minutes: 0 };
  expect(await call('/api/entries', { ...hours, end: null }, worker.id), 400, 'incomplete manual hours are rejected');
  expect(await call('/api/clock', { action: 'start', order_id: orderId }, worker.id), 409, 'new legacy timers remain disabled');
  const point = expect(await call('/api/entries', hours, worker.id), 200, 'manual completed hours are recorded');
  const [entry] = await sql`SELECT version,rate FROM horacerta.entries WHERE id=${point.data.id}`;
  assert.equal(Number(entry.rate), 20);
  expect(await call('/api/entries', { ...hours, start: '08:30', end: '09:30' }, worker.id), 409, 'overlapping hours are rejected');
  expect(await call('/api/entries', { id: point.data.id, version: entry.version, status: 'Aprovado' }, worker.id, 'PATCH'), 403, 'worker cannot approve hours');
  expect(await call('/api/entries', { id: point.data.id, version: entry.version, status: 'Aprovado' }, admin.id, 'PATCH'), 200, 'coordinator approves with serialized status change');
  expect(await call('/api/entries', { id: point.data.id, version: entry.version, status: 'Pendente' }, admin.id, 'PATCH'), 409, 'stale status version cannot overwrite approval');
  const reset = expect(await call('/api/manage', { entity: 'user', data: { id: worker.id, name: worker.name, username: username + '_worker', reset_pin: true } }, admin.id), 200, 'reset returns a fresh temporary credential');
  expect(await call('/api/login', { access_code: worker.access_code, pin: personalPin }, null), 401, 'reset revokes old PIN');
  expect(await call('/api/session', undefined, worker.id), 200, 'session endpoint remains available after reset');
  const resetSession = expect(await call('/api/login', { access_code: worker.access_code, pin: reset.data.temporary_pin }, null), 200, 'reset invitation works once');
  cookies.set(worker.id, resetSession.cookie);
  expect(await call('/api/login', {}, worker.id, 'DELETE'), 200, 'logout works even before mandatory change');
  const logoutState = expect(await call('/api/session', undefined, worker.id), 200, 'logged-out session asks for login');
  assert.equal(logoutState.data.login, true);
  console.log(`${checks} current-contract API smoke checks passed.`);
} finally {
  // All IDs came from this run; the preflight requires no existing users.
  const ids = [admin?.id, worker?.id].filter(Boolean);
  if (ids.length) await sql.transaction([
    sql`DELETE FROM horacerta.audit WHERE actor_id=ANY(${ids}::uuid[])`,
    sql`DELETE FROM horacerta.entries WHERE user_id=ANY(${ids}::uuid[])`,
    sql`DELETE FROM horacerta.order_events WHERE order_id=${orderId || null}::uuid`,
    sql`DELETE FROM horacerta.order_acknowledgements WHERE order_id=${orderId || null}::uuid`,
    sql`DELETE FROM horacerta.orders WHERE id=${orderId || null}::uuid`,
    sql`DELETE FROM horacerta.clients WHERE id=${clientId || null}::uuid`,
    sql`DELETE FROM horacerta.sessions WHERE user_id=ANY(${ids}::uuid[])`,
    sql`DELETE FROM horacerta.users WHERE id=ANY(${ids}::uuid[])`,
  ]);
}
