import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isolatedSql } from './isolated-sql-runtime.mjs';
import { installLocalHandlerHooks } from './api-fixtures/local-handler-hooks.mjs';

if (process.env.LOCAL_SQL_TEST !== '1') throw new Error('Execute somente com LOCAL_SQL_TEST=1.');
const local = await isolatedSql();
// Match Neon's nested SQL fragments as well as normal tagged parameters.
const sql = (strings, ...values) => {
  let text = strings[0]; const params = [];
  values.forEach((value, i) => {
    if (value && typeof value.text === 'string' && Array.isArray(value.params)) {
      const offset = params.length;
      text += value.text.replace(/\$(\d+)/g, (_, n) => '$' + (Number(n) + offset)); params.push(...value.params);
    } else { params.push(value); text += '$' + params.length; }
    text += strings[i + 1];
  });
  return local.query(text, params);
};
sql.transaction = local.transaction;
const boss = randomUUID(), employee = randomUUID(), model = randomUUID(), doc = randomUUID(), other = randomUUID(), archived = randomUUID(), obsolete = randomUUID();
const context = { sql, memberId: boss };
const removeHooks = installLocalHandlerHooks(context);
async function call(handler, path, body, expected = 200) {
  const response = await handler(new Request('http://localhost' + path, body ? {method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},body:JSON.stringify(body)} : {}));
  const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
}
try {
  for (const file of ['001-schema.sql','003-orders.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','008-checklist-actions.sql']) {
    const text = await readFile(new URL('../sql/' + file, import.meta.url), 'utf8');
    for (const statement of text.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim())) await local.query(statement);
    if (file === '001-schema.sql') await local.query('CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id), started_at timestamptz NOT NULL)');
  }
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(${boss},'Coordinator','coordinator@example.invalid','coordinator',0),(${employee},'Employee','employee@example.invalid','employee',0)`;
  await sql`INSERT INTO horacerta.equipment_models(id,name) VALUES(${model},'Scanner de teste')`;
  for (const [id,name,status,old] of [[doc,'Checklist scanner','pending',false],[other,'Outra lista','pending',false],[archived,'Arquivado','archived',false],[obsolete,'Obsoleto','archived',true]]) {
    await sql`INSERT INTO horacerta.library_documents(id,name,extension,size,category,ready,status,obsolete,sha256) VALUES(${id},${name},'.docx',100,'checklist',true,${status},${old},${id.replaceAll('-','').repeat(2)})`;
  }
  await sql`INSERT INTO horacerta.library_sections(document_id,position,locator,content) VALUES(${doc},0,'Tabela','ITENS | QTD | Devolução'),(${doc},1,'Tabela','Scanner | 1 |')`;
  const handlers = await import('../app/api/checklists/templates/route.ts');
  const library = await import('../app/api/library/route.ts');
  const initial = await call(handlers.GET, '/api/checklists/templates?model=' + model);
  assert.equal(initial.sources.length, 2); assert.ok(initial.sources.every(d => !d.linked));
  const preview = await call(handlers.GET, `/api/checklists/templates?model=${model}&source=${doc}`);
  assert.equal(preview.suggested[0].label, 'Scanner');
  assert.equal((await sql`SELECT * FROM horacerta.library_model_documents`).length, 0, 'Preview never creates links');
  const payload = {model_id:model,version:0,title:'Checklist scanner',source_document_id:doc,items:preview.suggested,status:'draft'};
  await call(handlers.POST, '/api/checklists/templates', payload);
  assert.equal((await sql`SELECT * FROM horacerta.library_model_documents`).length, 1);
  assert.equal((await sql`SELECT * FROM horacerta.library_reviews`).length, 1);
  assert.equal((await sql`SELECT version FROM horacerta.library_documents WHERE id=${doc}`)[0].version, 2, 'Stale document reviews cannot silently remove the new link');
  assert.equal((await sql`SELECT status FROM horacerta.library_documents WHERE id=${doc}`)[0].status, 'pending', 'Link does not publish original');
  await call(handlers.POST, '/api/checklists/templates', {...payload,source_document_id:other}, 409);
  assert.equal((await sql`SELECT * FROM horacerta.library_model_documents`).length, 1, 'Stale writes leave no extra link');
  await call(handlers.POST, '/api/checklists/templates', {...payload,version:1,source_document_id:archived}, 409);
  await call(handlers.GET, `/api/checklists/templates?model=${model}&source=${obsolete}`, undefined, 404);
  await call(handlers.POST, '/api/checklists/templates', {...payload,version:1,status:'active'});
  const catalog = await call(library.GET, '/api/library');
  assert.equal(catalog.models[0].checklist_ready, true); assert.equal(catalog.models[0].checklist_items, 1);
  assert.equal((await sql`SELECT * FROM horacerta.library_reviews`).length, 1, 'Existing link is not audited again');
  context.memberId = employee;
  await call(handlers.GET, '/api/checklists/templates?model=' + model, undefined, 403);
  await call(handlers.POST, '/api/checklists/templates', {...payload,version:2}, 403);
  const publicCatalog = await call(library.GET, '/api/library');
  assert.equal(publicCatalog.models[0].checklist_source, null, 'Employee catalog does not expose private source names');
  console.log('OK: unlinked source selection, import preview, atomic save/link/audit, stale edit rollback, unavailable sources, catalog summary and employee permissions.');
} finally { removeHooks(); await local.close(); }
