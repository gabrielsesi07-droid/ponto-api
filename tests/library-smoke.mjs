import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
const base = process.env.TEST_BASE_URL || 'http://localhost:5174';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local server.');
const sql = neon(process.env.DATABASE_URL);
const [admin] = await sql`SELECT id FROM horacerta.users WHERE role='coordinator' AND active LIMIT 1`;
assert.ok(admin);
const worker = randomUUID(), other = randomUUID(), doc = randomUUID(), obsolete = randomUUID(), model = randomUUID();
const query = 'qa-library-' + randomUUID();
const data = Buffer.from('Documento fictício para verificação. Sem dados reais. ' + query);
const hash = createHash('sha256').update(data).digest('hex');
const tokens = [], cookies = new Map(), orders = [];
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; console.log('OK ' + label); };
async function call(path, body, who = admin.id) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { ...(who ? { cookie: cookies.get(who) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const out = res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data: out, cache: res.headers.get('cache-control') };
}
const review = (id, version, status, who, extra = {}) => call('/api/library', { kind: 'document', id, version, status, ...extra }, who);
try {
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(${worker},'QA biblioteca',${worker + '@example.invalid'},'employee',0),(${other},'QA biblioteca outro',${other + '@example.invalid'},'employee',0)`;
  for (const id of [admin.id, worker, other]) {
    const token = randomBytes(32).toString('hex'), digest = createHash('sha256').update(token).digest('hex');
    tokens.push(digest); cookies.set(id, 'hc_session=' + token);
    await sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${digest},${id},now()+interval '20 minutes')`;
  }
  await sql`INSERT INTO horacerta.library_documents(id,sha256,name,extension,size,category,ready,search_text,section_count,chunk_count,origins)
    VALUES(${doc},${hash},${query + '.txt'},'.txt',${data.length},'manual',true,${query + ' acentuacao calibracao'},1,1,'[{"path":"PRIVATE-ORIGIN"}]')`;
  await sql`INSERT INTO horacerta.library_documents(id,sha256,name,extension,size,category,obsolete,ready,status,search_text)
    VALUES(${obsolete},${createHash('sha256').update(query).digest('hex')},${query + '-obsolete.txt'},'.txt',5,'checklist',true,true,'archived',${query})`;
  await sql`INSERT INTO horacerta.library_chunks VALUES(${doc},0,${data.toString('base64')})`;
  await sql`INSERT INTO horacerta.library_sections VALUES(${doc},0,'Bloco 1',${data.toString()})`;
  await sql`INSERT INTO horacerta.equipment_models(id,name,family) VALUES(${model},${query},'QA')`;
  check((await call('/api/library', null, null)).status, 401, 'Anonymous list blocked');
  check((await call('/api/library/' + doc, null, null)).status, 401, 'Anonymous detail blocked');
  check((await call(`/api/library/${doc}/file`, null, null)).status, 401, 'Anonymous file blocked');
  const listing = await call('/api/library?q=' + query);
  check(listing.data.total, 2, 'Coordinator can review private and obsolete documents');
  check(listing.cache, 'private, no-store', 'Private cache policy');
  check(listing.data.models.some(m => m.id === model && m.status === 'pending'), true, 'Coordinator catalogue contains pending equipment');
  const pendingOrder = await call('/api/operations', { action: 'save_order', data: {
    title: query, client_name: 'QA pending model', starts_at: new Date(Date.now() + 172800000).toISOString(),
    ends_at: new Date(Date.now() + 176400000).toISOString(), members: [worker], vehicle_id: null, model_ids: [model],
  } });
  check(pendingOrder.status, 200, 'Pending catalogue equipment can be selected without leaving OS');
  orders.push(pendingOrder.data.id);
  check((await sql`SELECT status FROM horacerta.equipment_models WHERE id=${model}`)[0].status, 'pending', 'OS selection does not automatically approve model');
  check((await call('/api/checklists?order=' + pendingOrder.data.id)).data.checklists.length, 0, 'No unapproved checklist copied into OS');
  check((await call('/api/library?q=' + query, null, worker)).data.total, 0, 'Pending and obsolete hidden from employees');
  check((await call('/api/library/' + doc, null, worker)).status, 404, 'Pending detail protected by ID');
  check((await call(`/api/library/${doc}/file`, null, worker)).status, 404, 'Pending original protected by ID');
  check((await review(doc, 1, 'published', worker)).status, 403, 'Employee cannot publish');
  check((await review(obsolete, 1, 'published')).status, 409, 'Obsolete material cannot be published');
  check((await review(doc, 1, 'published', admin.id, { model_ids: [model] })).status, 200, 'Coordinator publishes and links reviewed document');
  check((await review(doc, 1, 'archived')).status, 409, 'Stale review cannot overwrite publication');
  check((await call('/api/library?q=' + query, null, worker)).data.total, 1, 'Only reviewed document available to employees');
  const detail = await call('/api/library/' + doc, null, worker);
  check(detail.data.sections[0].content, data.toString(), 'Extracted section preserved');
  check(detail.data.document.origins, null, 'Internal network paths hidden from employee');
  check((await call('/api/library/' + doc)).data.document.origins[0].path, 'PRIVATE-ORIGIN', 'Coordinator can trace source');
  check((await call(`/api/library/${doc}/file`, null, worker)).data, data, 'Original download byte-for-byte');
  check((await call(`/api/library/${doc}/file?part=1`, null, worker)).status, 404, 'Invalid part denied');
  check((await call(`/api/library/${doc}?offset=-1`, null, worker)).status, 400, 'Invalid pagination denied');
  check((await call('/api/library?q=' + encodeURIComponent('acentuação'), null, worker)).data.documents.some(d => d.id === doc), true, 'Accent-insensitive content search');
  check((await call('/api/library', { kind: 'model', id: model, version: 1, status: 'published' }, worker)).status, 403, 'Employee cannot validate models');
  check((await call('/api/library', { kind: 'model', id: model, version: 1, status: 'published' })).status, 200, 'Coordinator validates equipment model');
  const orderData = { title: query, client_name: 'QA', starts_at: new Date(Date.now() + 3600000).toISOString(),
    ends_at: new Date(Date.now() + 7200000).toISOString(), members: [worker], vehicle_id: null, model_ids: [model] };
  const saved = await call('/api/operations', { action: 'save_order', data: orderData });
  check(saved.status, 200, 'Reviewed equipment model can be linked to OS');
  orders.push(saved.data.id);
  const linked = await call('/api/library?order=' + saved.data.id, null, worker);
  check(linked.data.documents.some(d => d.id === doc), true, 'Assigned employee sees OS documents');
  check((await call('/api/library?order=' + saved.data.id, null, other)).status, 404, 'Unassigned employee cannot inspect OS');
  check((await call('/api/operations', { action: 'save_order', data: { ...orderData, id: saved.data.id, version: 1, model_ids: [randomUUID()] } })).status, 409, 'Unknown model cannot be linked');
  check((await review(doc, 2, 'archived')).status, 200, 'Coordinator can revoke document');
  check((await call(`/api/library/${doc}/file`, null, worker)).status, 404, 'Revocation immediately blocks download');
  check((await sql`SELECT count(*)::int n FROM horacerta.library_reviews WHERE document_id=${doc}`)[0].n, 2, 'Only successful reviews are audited');
  console.log(`Passed ${checks} library checks.`);
} finally {
  for (const id of orders) {
    await sql`DELETE FROM horacerta.order_events WHERE order_id=${id}`;
    await sql`DELETE FROM horacerta.orders WHERE id=${id}`;
  }
  await sql`DELETE FROM horacerta.library_documents WHERE id=ANY(${[doc, obsolete]}::uuid[])`;
  await sql`DELETE FROM horacerta.equipment_models WHERE id=${model}`;
  await sql`DELETE FROM horacerta.sessions WHERE token_hash=ANY(${tokens}::text[])`;
  await sql`DELETE FROM horacerta.users WHERE id=ANY(${[worker, other]}::uuid[])`;
  console.log('Disposable fixtures and sessions removed.');
}
