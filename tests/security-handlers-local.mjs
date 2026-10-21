// Real handlers, parsers, credentials and SQL. Only runtime bindings/cookies are supplied locally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { isolatedSql } from './isolated-sql-runtime.mjs';
import * as pin from '../lib/pin.ts';
import * as workRules from '../lib/work-rules.ts';
import * as checklistRules from '../lib/checklists.ts';
import * as checklistAccess from '../lib/checklist-access.ts';
import * as pushValidation from '../lib/push-validation.ts';
import * as logoutPush from '../lib/logout-push.ts';

if (process.env.LOCAL_SQL_TEST !== '1') throw new Error('Execute somente com LOCAL_SQL_TEST=1. Nenhuma URL de banco é usada.');
const sql = await isolatedSql();
const require = createRequire(import.meta.url);
let token = '', passed = 0, failed = 0;
function load(file, imports = {}) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name in imports ? imports[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const server = load('lib/server.ts', {
  '@neondatabase/serverless': { neon: () => sql },
  'cloudflare:workers': { env: { DATABASE_URL: 'isolated-pglite-no-network' } },
  '@/app/chatgpt-auth': { getChatGPTUser: async () => null },
  'next/headers': { cookies: async () => ({ get: () => token ? { value: token } : undefined }) },
  './pin': pin, './work-rules': workRules,
});
const checklistServer = load('lib/checklist-server.ts', { './server': server });
const libraryServer = load('lib/library-server.ts', { './server': server });
const login = load('app/api/login/route.ts', { '@/lib/server': server, '@/lib/pin': pin, '@/lib/push-validation': pushValidation, '@/lib/logout-push': logoutPush });
const checklists = load('app/api/checklists/route.ts', {
  '@/lib/server': server, '@/lib/checklists': checklistRules, '@/lib/checklist-server': checklistServer,
  '@/lib/library-server': libraryServer, '@/lib/checklist-access': checklistAccess,
});
const pdf = load('app/api/operations/[id]/pdf/route.ts', { '@/lib/server': server });
const document = load('app/api/library/[id]/route.ts', { '@/lib/server': server, '@/lib/library-server': libraryServer });
const file = load('app/api/library/[id]/file/route.ts', { '@/lib/server': server, '@/lib/library-server': libraryServer });
async function migration(name) {
  for (const statement of readFileSync(new URL('../sql/' + name, import.meta.url), 'utf8').split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()))
    await sql.query(statement);
}
async function scenario(name, run) {
  try { await run(); passed++; console.log(`OK ${passed}: ${name}`); }
  catch (error) { failed++; console.error(`FALHOU: ${name}: ${error.message}`); }
}
function request(path, body, headers = {}, method = 'POST') {
  return new Request('https://qa.invalid' + path, { method, headers: { Origin: 'https://qa.invalid', ...headers }, body });
}
function json(path, body, headers = {}) { return request(path, JSON.stringify(body), { 'Content-Type': 'application/json', ...headers }); }
const responseStatus = async (response, expected) => assert.equal(response.status, expected, JSON.stringify(await response.clone().json()));
const context = id => ({ params: Promise.resolve({ id }) });
async function asUser(id) {
  token = randomUUID() + randomUUID();
  await sql`INSERT INTO horacerta.sessions(token_hash,user_id,credential_version,expires_at)
    SELECT ${await pin.digest(token)},id,credential_version,now()+interval '1 hour' FROM horacerta.users WHERE id=${id}::uuid`;
}
try {
  await migration('001-schema.sql');
  await sql.query(`ALTER TABLE horacerta.users ADD COLUMN username text,ADD COLUMN monthly_salary numeric,
    ADD COLUMN monthly_hours integer NOT NULL DEFAULT 200,ADD COLUMN pin_hash text,
    ADD COLUMN login_attempts integer NOT NULL DEFAULT 0,ADD COLUMN attempt_window timestamptz;
    CREATE TABLE horacerta.sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES horacerta.users(id),expires_at timestamptz NOT NULL);
    CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id),started_at timestamptz NOT NULL)`);
  for (const name of ['003-orders.sql', '006-library.sql', '020-identity-integrity.sql']) await migration(name);
  const admin = randomUUID(), worker = randomUUID(), outsider = randomUUID(), temporary = randomUUID(), client = randomUUID(), order = randomUUID();
  const hash = await pin.hashPin('846291'), tempHash = await pin.hashPin('582941');
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate,pin_hash,pin_change_required) VALUES
    (${admin},'QA coordenador','admin@example.invalid','coordinator',0,${hash},false),
    (${worker},'QA integrante','worker@example.invalid','employee',0,${hash},false),
    (${outsider},'QA outra pessoa','outsider@example.invalid','employee',0,${hash},false),
    (${temporary},'QA acesso inicial','initial@example.invalid','employee',0,${tempHash},true)`;
  await sql`UPDATE horacerta.users SET temporary_pin_expires_at=now()+interval '1 hour' WHERE id=${temporary}`;
  await sql`INSERT INTO horacerta.clients(id,name) VALUES(${client},'Cliente QA')`;
  await sql`INSERT INTO horacerta.orders(id,title,client_id,client_name,address,starts_at,ends_at,members,created_by)
    VALUES(${order},'OS privada',${client},'Cliente QA','Endereço QA',now(),now()+interval '1 day',ARRAY[${worker}::uuid],${admin})`;
  const [{ access_code: workerCode }] = await sql`SELECT access_code FROM horacerta.users WHERE id=${worker}`;
  const [{ access_code: tempCode }] = await sql`SELECT access_code FROM horacerta.users WHERE id=${temporary}`;

  await scenario('descoberta pública não revela colaboradores ou códigos', async () => {
    const response = await login.GET();
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { people: [] });
    token = '';
    await assert.rejects(server.member(), error => error.status === 401);
  });
  await scenario('cinco PINs errados bloqueiam a conta e a janela expirada libera novo acesso', async () => {
    for (let i = 0; i < 5; i++) await responseStatus(await login.POST(json('/api/login', { access_code: workerCode, pin: '000000' })), 401);
    await responseStatus(await login.POST(json('/api/login', { access_code: workerCode, pin: '846291' })), 401);
    await sql`UPDATE horacerta.users SET attempt_window=now()-interval '16 minutes' WHERE id=${worker}`;
    const response = await login.POST(json('/api/login', { access_code: workerCode, pin: '846291' }));
    await responseStatus(response, 200);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(response.headers.get('Set-Cookie').includes(flag));
    token = response.headers.get('Set-Cookie').split(';')[0].slice('hc_session='.length);
    assert.equal((await server.member()).id, worker);
    const body = await response.json();
    for (const field of ['pin_hash', 'credential_version', 'token_hash', 'monthly_salary']) assert.equal(field in body.person, false);
  });
  await scenario('troca de credencial e expiração revogam o acesso operacional', async () => {
    await sql`UPDATE horacerta.users SET pin_hash=${await pin.hashPin('917462')} WHERE id=${worker}`;
    await assert.rejects(server.member(), error => error.status === 403);
    await asUser(worker);
    await sql`UPDATE horacerta.sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=${await pin.digest(token)}`;
    await assert.rejects(server.member(), error => error.status === 403);
  });
  await scenario('PIN temporário só pode entrar uma vez e exige troca antes de operar', async () => {
    const response = await login.POST(json('/api/login', { access_code: tempCode, pin: '582941' }));
    await responseStatus(response, 200);
    token = response.headers.get('Set-Cookie').split(';')[0].slice('hc_session='.length);
    assert.equal((await server.member({ allowPinChange: true })).id, temporary);
    await assert.rejects(server.member(), error => error.code === 'PIN_CHANGE_REQUIRED');
    await responseStatus(await login.POST(json('/api/login', { access_code: tempCode, pin: '582941' })), 401);
  });
  await scenario('stream JSON sem Content-Length respeita limite e origem externa é recusada', async () => {
    await assert.rejects(server.payload(request('/api/example', 'x'.repeat(30001))), error => error.status === 413);
    await assert.rejects(server.payload(json('/api/example', {}, { Origin: 'https://external.invalid' })), error => error.status === 403);
    await asUser(admin);
    await responseStatus(await checklists.POST(request('/api/checklists', 'x'.repeat(150001))), 413);
    await responseStatus(await checklists.POST(json('/api/checklists', {}, { Origin: 'https://external.invalid' })), 403);
  });
  await scenario('JSON null, lista ou escalar no checklist são dados inválidos com resposta 400', async () => {
    for (const value of [null, [], 'texto', 42, true]) await responseStatus(await checklists.POST(json('/api/checklists', value)), 400);
    await responseStatus(await checklists.POST(request('/api/checklists', '{invalid')), 400);
  });
  await scenario('colaborador não pode designar responsáveis nem anexar PDF de OS', async () => {
    await asUser(worker);
    await responseStatus(await checklists.POST(json('/api/checklists', { action: 'assign' })), 403);
    await responseStatus(await pdf.POST(request('/api/operations/' + order + '/pdf', '%PDF-test'), context(order)), 403);
  });
  await scenario('PDF rejeita nome codificado inválido, tamanho excessivo e conteúdo sem assinatura', async () => {
    await asUser(admin);
    await responseStatus(await pdf.POST(request('/api/operations/' + order + '/pdf', '%PDF-test', { 'x-file-name': '%E0%A4%A' }), context(order)), 400);
    await responseStatus(await pdf.POST(request('/api/operations/' + order + '/pdf', '%PDF-' + 'x'.repeat(3 * 1024 * 1024)), context(order)), 413);
    await responseStatus(await pdf.POST(request('/api/operations/' + order + '/pdf', 'arquivo inválido'), context(order)), 400);
    assert.equal((await sql`SELECT 1 FROM horacerta.order_pdfs`).length, 0);
  });
  await scenario('arquivo de OS tem acesso por integrante, sem acesso por outro colaborador', async () => {
    await asUser(admin);
    await responseStatus(await pdf.POST(request('/api/operations/' + order + '/pdf', '%PDF-1.4\nQA', { 'x-file-name': encodeURIComponent('../ordem\r\n.pdf') }), context(order)), 200);
    await asUser(worker);
    const response = await pdf.GET(new Request('https://qa.invalid'), context(order));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.doesNotMatch(response.headers.get('Content-Disposition'), /\r|\n/);
    assert.equal(await response.text(), '%PDF-1.4\nQA');
    await asUser(outsider);
    await responseStatus(await pdf.GET(new Request('https://qa.invalid'), context(order)), 404);
  });
  await scenario('Biblioteca protege texto e arquivo pendentes, arquivados, obsoletos e incompletos', async () => {
    for (const [status, obsolete, ready, allowed] of [
      ['published', false, true, true], ['pending', false, true, false], ['archived', false, true, false],
      ['archived', true, true, false], ['published', false, false, false],
    ]) {
      const id = randomUUID();
      await sql`INSERT INTO horacerta.library_documents(id,name,extension,size,category,sha256,ready,status,obsolete,origins,chunk_count)
        VALUES(${id},'QA arquivo','.txt',4,'manual',${id.replaceAll('-', '').repeat(2)},${ready},${status},${obsolete},'["origem interna"]',1)`;
      await sql`INSERT INTO horacerta.library_sections(document_id,position,locator,content) VALUES(${id},0,'QA','texto privado')`;
      await sql`INSERT INTO horacerta.library_chunks(document_id,position,data) VALUES(${id},0,${Buffer.from('data').toString('base64')})`;
      await asUser(worker);
      const read = await document.GET(new Request('https://qa.invalid'), context(id));
      const download = await file.GET(new Request('https://qa.invalid'), context(id));
      assert.equal(read.status, allowed ? 200 : 404);
      assert.equal(download.status, allowed ? 200 : 404);
      if (allowed) { assert.equal((await read.json()).document.origins, null); assert.equal(await download.text(), 'data'); }
      await asUser(admin);
      const adminRead = await document.GET(new Request('https://qa.invalid'), context(id));
      assert.equal(adminRead.status, ready ? 200 : 404);
      if (ready) assert.deepEqual((await adminRead.json()).document.origins, ['origem interna']);
    }
  });
  console.log(`\n${passed} cenários passaram; ${failed} falharam. SQL em memória; nenhum banco ou provedor remoto foi acessado.`);
  if (failed) process.exitCode = 1;
} finally { await sql.close(); }
