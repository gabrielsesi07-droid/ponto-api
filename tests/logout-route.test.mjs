// Execute the real handler/parser in memory; database calls are captured, never executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequestAdapter } = require('next/dist/server/web/spec-extension/adapters/next-request.js');
function load(file, imports = {}) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name in imports ? imports[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
function harness() {
  let dbCalls = 0;
  const transactions = [];
  const sql = (strings, ...values) => ({ text: strings.join('?'), values });
  sql.query = (text, values) => ({ text, values });
  sql.transaction = async queries => { transactions.push(queries); return []; };
  const pin = { digest: async token => 'hash:' + token, sessionCookie: (_token, _req, days) => `hc_session=; Max-Age=${days}`, pinAccessAllowed: () => true };
  const server = load('lib/server.ts', { '@neondatabase/serverless': { neon: () => { dbCalls++; return sql; } },
    'cloudflare:workers': { env: { DATABASE_URL: 'disabled-unit-stub' } }, '@/app/chatgpt-auth': { getChatGPTUser: async () => null },
    'next/headers': { cookies: async () => ({ get: () => undefined }) }, './pin': pin });
  const route = load('app/api/login/route.ts', { '@/lib/server': server, '@/lib/pin': pin,
    '@/lib/push-validation': load('lib/push-validation.ts'), '@/lib/logout-push': load('lib/logout-push.ts') });
  return { route, server, transactions, get dbCalls() { return dbCalls; } };
}
function nodeRequest(body = '', headers = {}) {
  return NextRequestAdapter.fromNodeNextRequest({ method: 'DELETE', url: 'http://localhost/api/login',
    headers: { host: 'localhost', origin: 'http://localhost', ...headers },
    body: Readable.from(body ? [Buffer.from(body)] : []) }, new AbortController().signal);
}

test('logout accepts an absent web body and the empty stream produced by the real Next Node adapter', async () => {
  const h = harness();
  const node = nodeRequest(); assert.notEqual(node.body, null, 'Regression requires a non-null empty stream');
  for (const req of [new Request('http://localhost/api/login', { method: 'DELETE' }), node]) {
    const response = await h.route.DELETE(req);
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), 'hc_session=; Max-Age=0');
  }
  assert.equal(h.dbCalls, 0, 'No cookie must never call the database');
});

test('empty logout stream with a cookie locks the user before subscription/session revocation atomically', async () => {
  const h = harness();
  assert.equal((await h.route.DELETE(nodeRequest('', { cookie: 'hc_session=unit-token' }))).status, 200);
  assert.equal(h.dbCalls, 1); assert.equal(h.transactions.length, 1); assert.equal(h.transactions[0].length, 3);
  assert.match(h.transactions[0][0].text, /FOR UPDATE OF u/);
  assert.deepEqual(h.transactions[0][0].values, ['hash:unit-token']);
  assert.match(h.transactions[0][1].text, /DELETE FROM horacerta.push_subscriptions/);
  assert.deepEqual(h.transactions[0][1].values, ['hash:unit-token', null]);
  assert.match(h.transactions[0][2].text, /DELETE FROM horacerta.sessions/);
});

test('logout preserves origin, payload-size, nonempty JSON and endpoint validation', async () => {
  const h = harness();
  for (const [body, headers, status] of [
    ['', { origin: 'https://foreign.invalid' }, 403], ['x'.repeat(30001), {}, 413],
    ['{invalid', {}, 400], ['   ', {}, 400], [JSON.stringify({ push_endpoint: 'http://127.0.0.1/device' }), {}, 400],
    [JSON.stringify({ push_endpoint: 'https://fcm.googleapis.com/' + 'x'.repeat(2048) }), {}, 400],
  ]) assert.equal((await h.route.DELETE(nodeRequest(body, headers))).status, status);
  assert.equal(h.dbCalls, 0);
});

test('valid explicit device endpoint is passed as data to the owner-checked SQL', async () => {
  const h = harness(), endpoint = 'https://fcm.googleapis.com/fcm/send/unit-device';
  const response = await h.route.DELETE(nodeRequest(JSON.stringify({ push_endpoint: endpoint }), { cookie: 'hc_session=unit-token' }));
  assert.equal(response.status, 200); assert.deepEqual(h.transactions[0][1].values, ['hash:unit-token', endpoint]);
});

test('empty-payload tolerance stays opt-in and does not weaken ordinary mutation parsing', async () => {
  const h = harness();
  await assert.rejects(h.server.payload(nodeRequest()), SyntaxError);
  await assert.rejects(h.server.payload(new Request('http://localhost/api/example', { method: 'POST' })), /Informe os dados/);
});
