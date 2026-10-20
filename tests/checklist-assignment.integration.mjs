// Explicit integration command; only a random disposable schema is mutated. No DATABASE_URL fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL test database before running checklist-assignment.integration.mjs.');
if (process.env.DATABASE_URL) {
  const a = new URL(url), b = new URL(process.env.DATABASE_URL);
  assert.notEqual(a.hostname + a.pathname, b.hostname + b.pathname, 'Use a separate integration database');
}

test('specific checklist assignment, history and concurrent authorization', async t => {
  let Driver = Pool;
  if (['localhost', '127.0.0.1'].includes(new URL(url).hostname)) Driver = (await import('pg')).default.Pool;
  else neonConfig.webSocketConstructor = WebSocket;
  const pool = new Driver({ connectionString: url });
  const schema = 'qa_assignment_' + randomUUID().replaceAll('-', '');
  const load = async name => (await readFile(new URL('../sql/' + name, import.meta.url), 'utf8')).replaceAll('horacerta', schema).replaceAll('2849061701', '2849061715');
  const admin = randomUUID(), team = randomUUID(), outsider = randomUUID(), replacement = randomUUID(), inactive = randomUUID();
  const client = randomUUID(), model = randomUUID();
  const reason = 'Substituição necessária para concluir a conferência.';
  const items = [{ id: randomUUID(), label: 'Cabo', planned: 1, outgoing: true, incoming: true, outgoing_qty: 1, incoming_qty: 1, na: false, notes: '' }];
  let first, second;
  try {
    first = await pool.connect(); second = await pool.connect();
    for (const c of [first, second]) await c.query("SET statement_timeout='15s'");
    const secondPid = (await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const waitForLock = async type => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if ((await first.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype=$2 AND NOT granted) waiting', [secondPid, type])).rows[0].waiting) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail(`Second connection did not wait for ${type}`);
    };
    await first.query(await load('001-schema.sql'));
    await first.query(`ALTER TABLE ${schema}.users ADD COLUMN pin_hash text,ADD COLUMN login_attempts integer NOT NULL DEFAULT 0,ADD COLUMN attempt_window timestamptz;
      CREATE TABLE ${schema}.sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES ${schema}.users(id),expires_at timestamptz NOT NULL);
      CREATE TABLE ${schema}.timers(user_id uuid PRIMARY KEY REFERENCES ${schema}.users(id),started_at timestamptz NOT NULL,paused_at timestamptz,pauses jsonb NOT NULL DEFAULT '[]',rate numeric NOT NULL DEFAULT 0,rules jsonb NOT NULL DEFAULT '{}',company text NOT NULL DEFAULT '',service text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '')`);
    for (const file of ['003-orders.sql','005-flexible-client.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','010-client-search.sql','011-order-lifecycle.sql','012-client-lifecycle.sql','017-push-notifications.sql','018-checklist-waiver.sql','019-flow-fixes.sql','020-identity-integrity.sql','021-checklist-assignment.sql','022-push-reliability.sql','008-checklist-actions.sql','004-order-actions.sql','013-points-require-order.sql'])
      await first.query(await load(file));
    await first.query(`INSERT INTO ${schema}.users(id,name,email,role,hourly_rate,active) VALUES
      ($1::uuid,'QA coordinator',$1::text||'@example.invalid','coordinator',0,true),($2::uuid,'QA team',$2::text||'@example.invalid','employee',0,true),
      ($3::uuid,'QA assignee',$3::text||'@example.invalid','employee',0,true),($4::uuid,'QA replacement',$4::text||'@example.invalid','employee',0,true),
      ($5::uuid,'QA inactive',$5::text||'@example.invalid','employee',0,false)`, [admin, team, outsider, replacement, inactive]);
    await first.query(`INSERT INTO ${schema}.clients(id,name) VALUES($1::uuid,'QA client');`, [client]);
    await first.query(`INSERT INTO ${schema}.equipment_models(id,name) VALUES($1::uuid,'QA model')`, [model]);
    const fixture = async (status = 'Em andamento', members = [team], checklistStatus = 'open', body = items) => {
      const order = randomUUID(), checklist = randomUUID();
      await first.query(`INSERT INTO ${schema}.orders(id,title,client_id,client_name,address,starts_at,ends_at,members,model_ids,created_by,status)
        VALUES($1::uuid,'QA assignment',$2,'QA client','',now()-interval '1 hour',now()+interval '1 hour',$3,$4,$5,$6)`, [order, client, members, [model], admin, status]);
      await first.query(`INSERT INTO ${schema}.order_checklists(id,order_id,model_id,model_name,title,items,updated_by,status,notes,identification)
        VALUES($1,$2,$3,'QA model','QA checklist',$4,$5,$6,'Preserve notes','Preserve serial')`, [checklist, order, model, JSON.stringify(body), admin, checklistStatus]);
      return { order, checklist };
    };
    const read = async f => (await first.query(`SELECT to_jsonb(c) data FROM ${schema}.order_checklists c WHERE id=$1`, [f.checklist])).rows[0].data;
    const assign = (f, assignee = outsider, version = 1, actor = admin, why = reason, conn = first) =>
      conn.query(`SELECT ${schema}.assign_order_checklist($1,$2,$3,$4,$5) result`, [actor, f.checklist, version, assignee, why]);
    const save = (f, actor, version, action = 'save', conn = first) => conn.query(`SELECT ${schema}.checklist_action($1,$2,$3::jsonb) result`, [actor, action,
      JSON.stringify({ id: f.checklist, version, title: 'QA checklist', items, notes: 'Preserve notes', identification: 'Preserve serial' })]);
    const editable = async (f, actor) => (await first.query(`SELECT ${schema}.checklist_can_edit($1,$2) allowed`, [actor, f.checklist])).rows[0].allowed;
    const root = await fixture('Em andamento', [admin]);

    await t.test('coordinator-only OS gains a checker without changing team, work or resolved checklists', async () => {
      const completed = await fixture('Em andamento', [team], 'completed'), waived = await fixture('Cancelada', [team], 'waived');
      const beforeCompleted = await read(completed), beforeWaived = await read(waived);
      const entry = randomUUID();
      await first.query(`INSERT INTO ${schema}.entries(id,user_id,order_id,date,start,"end",service,status,rate,rules) VALUES($1,$2,$3,current_date,'08:00','09:00','QA','Aprovado',10,'{}')`, [entry, admin, root.order]);
      const beforeEntry = (await first.query(`SELECT to_jsonb(e) data FROM ${schema}.entries e WHERE id=$1`, [entry])).rows[0].data;
      const before = await read(root);
      const out = (await assign(root)).rows[0].result;
      assert.equal(out.version, 2); assert.equal(out.assignee_id, outsider);
      const after = await read(root);
      for (const key of ['items','notes','identification','status','completed_by','completed_at']) assert.deepEqual(after[key], before[key]);
      assert.deepEqual((await first.query(`SELECT members FROM ${schema}.orders WHERE id=$1`, [root.order])).rows[0].members, [admin]);
      assert.deepEqual((await first.query(`SELECT to_jsonb(e) data FROM ${schema}.entries e WHERE id=$1`, [entry])).rows[0].data, beforeEntry);
      assert.deepEqual(await read(completed), beforeCompleted); assert.deepEqual(await read(waived), beforeWaived);
      const history = (await first.query(`SELECT snapshot FROM ${schema}.checklist_history WHERE checklist_id=$1`, [root.checklist])).rows[0].snapshot;
      assert.equal(history.reason, reason); assert.deepEqual(history.before, before); assert.deepEqual(history.after, after);
      assert.equal(await editable(root, outsider), true); assert.equal(await editable(root, admin), false);
      // A rerun neither creates assignments nor alters their provenance or contents.
      await first.query(await load('021-checklist-assignment.sql')); await first.query(await load('008-checklist-actions.sql'));
      assert.deepEqual(await read(root), after);
    });

    await t.test('denies bad actor, inactive/nonemployee target, missing reason and stale/repeated assignment', async () => {
      const f = await fixture();
      await assert.rejects(assign(f, outsider, 1, team), /Somente o coordenador/);
      for (const who of [inactive, admin, randomUUID()]) await assert.rejects(assign(f, who), /colaborador ativo/);
      for (const why of ['', 'curto', 'a'.repeat(501)]) await assert.rejects(assign(f, outsider, 1, admin, why), /motivo/);
      await assert.rejects(assign(f, outsider, 99), /atualizado/);
      await assign(f); await assert.rejects(assign(f, outsider, 2), /responsável atual/);
      await assert.rejects(assign(f, replacement, 1), /atualizado/);
      assert.equal((await read(f)).version, 2);
    });

    await t.test('only ongoing/open/attached checklists can transfer, including empty legacy lists', async () => {
      for (const status of ['Agendada','Concluída','Cancelada']) await assert.rejects(assign(await fixture(status)), /somente em OS em andamento/);
      for (const status of ['completed','waived']) await assert.rejects(assign(await fixture('Em andamento', [team], status)), /pendentes/);
      const detached = await fixture(); await first.query(`UPDATE ${schema}.orders SET model_ids='{}' WHERE id=$1`, [detached.order]);
      await assert.rejects(assign(detached), /Equipamento removido/);
      const empty = await fixture('Em andamento', [admin], 'open', []); await assign(empty);
      assert.deepEqual((await read(empty)).items, []); assert.equal(await editable(empty, outsider), true);
      await first.query(`UPDATE ${schema}.orders SET status='Cancelada' WHERE id=$1`, [empty.order]);
      assert.equal((await first.query(`SELECT ${schema}.order_can_delete($1) allowed`, [empty.order])).rows[0].allowed, false,
        'Even legacy OS without start events must retain the assignment audit after cancellation');
    });

    await t.test('legacy team access stays until transfer, then only the current assignee can confer', async () => {
      const f = await fixture();
      assert.equal(await editable(f, team), true); assert.equal(await editable(f, outsider), false);
      await save(f, team, 1); await assign(f, outsider, 2);
      assert.equal(await editable(f, team), false); assert.equal(await editable(f, outsider), true);
      await assert.rejects(save(f, team, 3), /responsável/);
      await assert.rejects(save(f, admin, 3, 'complete'), /responsável/);
      await assign(f, replacement, 3); assert.equal(await editable(f, outsider), false);
      await assert.rejects(save(f, outsider, 4), /designado/);
      await save(f, replacement, 4);
    });

    await t.test('transfer grants no point/lifecycle rights and completion stays blocked until resolved', async () => {
      await assert.rejects(first.query(`SELECT ${schema}.order_action($1,'finish',$2::jsonb)`, [admin, JSON.stringify({ id: root.order, notes: 'Resultado conferido' })]), /checklists/);
      await assert.rejects(first.query(`SELECT ${schema}.order_action($1,'begin',$2::jsonb)`, [outsider, JSON.stringify({ id: root.order })]), /designado/);
      await assert.rejects(first.query(`SELECT ${schema}.point_entry_order($1,$2,current_date,'10:00',NULL)`, [outsider, root.order]), /designado/);
      await assert.rejects(first.query(`SELECT ${schema}.waive_order_checklist($1,$2,2,$3)`, [admin, root.checklist, reason]), /canceladas/);
      await save(root, outsider, 2, 'complete');
      assert.equal(await editable(root, outsider), false);
      await assert.rejects(assign(root, replacement, 3), /pendentes/);
      assert.equal((await first.query(`SELECT ${schema}.order_action($1,'finish',$2::jsonb) result`, [admin, JSON.stringify({ id: root.order, notes: 'Resultado conferido' })])).rows[0].result.ok, true);
    });

    await t.test('save before transfer causes a version conflict; transfer before save denies the former checker', async () => {
      const beforeSave = await fixture();
      await first.query('BEGIN'); await save(beforeSave, team, 1);
      const pendingAssign = assign(beforeSave, outsider, 1, admin, reason, second); pendingAssign.catch(() => {});
      await waitForLock('advisory'); await first.query('COMMIT'); await assert.rejects(pendingAssign, /atualizado/);
      const beforeAssign = await fixture();
      await first.query('BEGIN'); await assign(beforeAssign);
      const pendingSave = save(beforeAssign, team, 2, 'save', second); pendingSave.catch(() => {});
      await waitForLock('advisory'); await first.query('COMMIT'); await assert.rejects(pendingSave, /responsável/);
    });

    await t.test('complete before transfer cannot be overwritten; transfer before complete rejects stale proof', async () => {
      const beforeComplete = await fixture();
      await first.query('BEGIN'); await save(beforeComplete, team, 1, 'complete');
      const pendingAssign = assign(beforeComplete, outsider, 1, admin, reason, second); pendingAssign.catch(() => {});
      await waitForLock('advisory'); await first.query('COMMIT'); await assert.rejects(pendingAssign, /atualizado|pendentes/);
      assert.equal((await read(beforeComplete)).status, 'completed');
      const beforeAssign = await fixture();
      await first.query('BEGIN'); await assign(beforeAssign);
      const pendingComplete = save(beforeAssign, team, 1, 'complete', second); pendingComplete.catch(() => {});
      await waitForLock('advisory'); await first.query('COMMIT'); await assert.rejects(pendingComplete, /atualizou/);
      assert.equal((await read(beforeAssign)).status, 'open');
    });

    await t.test('deactivation and assignment synchronize both ways and inactive assignee cannot confer', async () => {
      const f = await fixture();
      await first.query('BEGIN'); await first.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [outsider]);
      const pendingAssign = assign(f, outsider, 1, admin, reason, second); pendingAssign.catch(() => {});
      await waitForLock('transactionid'); await first.query('COMMIT'); await assert.rejects(pendingAssign, /colaborador ativo/);
      await first.query(`UPDATE ${schema}.users SET active=true WHERE id=$1`, [outsider]);
      await first.query('BEGIN'); await assign(f);
      const deactivate = second.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [outsider]); deactivate.catch(() => {});
      await waitForLock('transactionid'); await first.query('COMMIT'); await deactivate;
      assert.equal(await editable(f, outsider), false); await assert.rejects(save(f, outsider, 2), /Conta indisponível/);
      await assign(f, replacement, 2); await save(f, replacement, 3, 'complete');
      assert.equal((await read(f)).status, 'completed');
    });

    await t.test('deactivation before complete rejects it; completion committed first remains historical', async () => {
      const f = await fixture(); await assign(f, replacement);
      await first.query('BEGIN'); await first.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [replacement]);
      const complete = save(f, replacement, 2, 'complete', second); complete.catch(() => {});
      await waitForLock('transactionid'); await first.query('COMMIT'); await assert.rejects(complete, /Conta indisponível/);
      await first.query(`UPDATE ${schema}.users SET active=true WHERE id=$1`, [replacement]);
      await first.query('BEGIN'); await save(f, replacement, 2, 'complete');
      const deactivate = second.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [replacement]); deactivate.catch(() => {});
      await waitForLock('transactionid'); await first.query('COMMIT'); await deactivate;
      assert.equal((await read(f)).status, 'completed');
    });
  } finally {
    if (first) await first.query('ROLLBACK');
    if (second) { await second.query('ROLLBACK'); second.release(); }
    if (first) { await first.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); first.release(); }
    await pool.end();
  }
});
