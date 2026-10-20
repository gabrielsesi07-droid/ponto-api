// Explicit QA command: node --env-file=.env.qa --import ./tests/support/local-neon.mjs --test tests/push-reliability.integration.mjs
// Every mutation is confined to this run's random schema. The provider is always fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { neon } from '@neondatabase/serverless';
import ts from 'typescript';
import { runPushDispatch } from '../lib/push-policy.ts';
import { allowedPushEndpoint } from '../lib/push-validation.ts';

const url = process.env.TEST_DATABASE_URL;
if (process.env.HORACERTA_LOCAL_NEON_TEST !== '1' || !url || process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')
  throw new Error('Push integration requires explicit local QA opt-in; production is forbidden.');
const target = new URL(url);
if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['localhost', '127.0.0.1'].includes(target.hostname) || !target.port || target.pathname !== '/horacerta_qa')
  throw new Error('Push integration accepts only an explicit loopback port and database horacerta_qa.');
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== url)
  throw new Error('QA DATABASE_URL must exactly match TEST_DATABASE_URL; no fallback is permitted.');

// Run the actual adapter, erasing types and resolving its sole runtime relative import.
// No application SQL is copied into the test and no production import paths are changed.
const adapterSource = await readFile(new URL('../lib/push-store.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(adapterSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("'./push-policy'", JSON.stringify(new URL('../lib/push-policy.ts', import.meta.url).href)) + '\n//# sourceURL=push-store.integration.js';
const { createPushStore, registerPushDevice } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('push reliability with real SQL and a fake provider', { timeout: 90000 }, async t => {
  const schema = 'qa_push_' + randomUUID().replaceAll('-', '');
  assert.match(schema, /^qa_push_[a-f0-9]{32}$/);
  const pool = new Pool({ connectionString: url, statement_timeout: 15000 });
  const connection = await pool.connect(), rawSql = neon(url);
  const replace = text => text.replaceAll('horacerta.', schema + '.');
  const sql = (strings, ...values) => {
    const mapped = strings.map(replace);
    mapped.raw = strings.raw.map(replace);
    return rawSql(mapped, ...values);
  };
  sql.transaction = rawSql.transaction.bind(rawSql);
  sql.query = (text, params) => rawSql.query(replace(text), params);
  const store = createPushStore(sql), owner = randomUUID(), other = randomUUID(), admin = randomUUID(), client = randomUUID();
  const load = async file => (await readFile(new URL('../sql/' + file, import.meta.url), 'utf8'))
    .replaceAll('horacerta', schema).replaceAll('2849061701', '2849061716');
  const q = (text, params) => connection.query(replace(text), params);
  const subscription = suffix => ({ endpoint: 'https://fcm.googleapis.com/qa-' + suffix, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } });
  const device = async (who = owner, suffix = randomUUID(), hash = 'live') => {
    const p = subscription(suffix);
    assert.equal(await registerPushDevice(sql, who, hash, p), true);
    return (await q('SELECT * FROM horacerta.push_subscriptions WHERE endpoint=$1', [p.endpoint])).rows[0];
  };
  const order = async (members = [owner], status = 'Agendada') => {
    const id = randomUUID();
    await q(`INSERT INTO horacerta.orders(id,title,client_id,client_name,address,starts_at,ends_at,members,created_by,status)
      VALUES($1,'QA push',$2,'QA client','',now(),now()+interval '1 hour',$3,$4,$5)`, [id, client, members, admin, status]);
    return id;
  };
  const job = async id => (await q('SELECT * FROM horacerta.push_jobs WHERE order_id=$1', [id])).rows[0];
  const clearOrders = () => q('TRUNCATE horacerta.orders CASCADE');
  const clearDevices = () => q('DELETE FROM horacerta.push_subscriptions');
  const dispatch = send => runPushDispatch({ store, send: send || (async () => {}), endpointAllowed: allowedPushEndpoint });
  const waitForBlocked = async fragment => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = (await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.pid<>pg_backend_pid()
        AND a.wait_event_type='Lock' AND position($1 in a.query)>0
        AND EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted)) waiting`, [fragment])).rows[0].waiting;
      if (waiting) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Expected SQL operation to wait on its lock: ' + fragment);
  };
  // This test-only barrier pauses the real Neon transaction after its actual lock statements.
  const withBarrier = afterLocks => Object.assign((strings, ...values) => sql(strings, ...values), {
    query: sql.query,
    transaction: async queries => {
      const results = await sql.transaction([...queries.slice(0, afterLocks),
        sql.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0)) /* ${schema}_gate */`, [schema]), ...queries.slice(afterLocks)]);
      results.splice(afterLocks, 1); // The adapter sees its original result shape, without the test barrier.
      return results;
    },
  });
  const lockBarrier = () => connection.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [schema]);
  const unlockBarrier = () => connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [schema]);
  const restoreSession = () => q(`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at,credential_version)
    SELECT 'live',id,now()+interval '1 hour',credential_version FROM horacerta.users WHERE id=$1 ON CONFLICT(token_hash) DO NOTHING`, [owner]);
  try {
    await connection.query(await load('001-schema.sql'));
    await q(`ALTER TABLE horacerta.users ADD COLUMN pin_hash text,ADD COLUMN login_attempts integer NOT NULL DEFAULT 0,ADD COLUMN attempt_window timestamptz;
      CREATE TABLE horacerta.sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES horacerta.users(id),expires_at timestamptz NOT NULL);
      CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id),started_at timestamptz NOT NULL,paused_at timestamptz,pauses jsonb NOT NULL DEFAULT '[]',rate numeric NOT NULL DEFAULT 0,rules jsonb NOT NULL DEFAULT '{}',company text NOT NULL DEFAULT '',service text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '')`);
    for (const file of ['003-orders.sql','005-flexible-client.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','010-client-search.sql','011-order-lifecycle.sql','012-client-lifecycle.sql','017-push-notifications.sql','018-checklist-waiver.sql','019-flow-fixes.sql','020-identity-integrity.sql','021-checklist-assignment.sql','008-checklist-actions.sql','004-order-actions.sql','013-points-require-order.sql'])
      await connection.query(await load(file));
    await q(`INSERT INTO horacerta.users(id,name,email,role,hourly_rate,active,pin_change_required,pin_hash) VALUES
      ($1,'QA owner','owner@example.invalid','employee',0,true,false,'initial'),($2,'QA other','other@example.invalid','employee',0,true,false,'initial'),
      ($3,'QA coordinator','admin@example.invalid','coordinator',0,true,false,'initial')`, [owner, other, admin]);
    await q("INSERT INTO horacerta.clients(id,name) VALUES($1,'QA client')", [client]);
    await q("INSERT INTO horacerta.push_config VALUES(1,'qa-public','qa-private')");
    await q(`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at,credential_version) VALUES
      ('live',$1,now()+interval '1 hour',1),('other',$2,now()+interval '1 hour',1),('expired',$1,now()-interval '1 hour',1),('stale',$1,now()+interval '1 hour',0)`, [owner, other]);
    const prior = subscription('prior');
    await q('INSERT INTO horacerta.push_subscriptions(user_id,session_hash,endpoint,p256dh,auth) VALUES($1,$2,$3,$4,$5)', [owner, 'live', prior.endpoint, prior.keys.p256dh, prior.keys.auth]);
    const priorOrder = await order(), priorJob = await job(priorOrder);
    await connection.query(await load('022-push-reliability.sql'));

    await t.test('migration is repeatable and retains existing keys, devices and pending jobs', async () => {
      await connection.query(await load('022-push-reliability.sql'));
      assert.equal((await job(priorOrder)).id, priorJob.id);
      assert.equal((await q('SELECT count(*)::int n FROM horacerta.push_subscriptions')).rows[0].n, 1);
      assert.deepEqual((await store.configuration()), { public_key: 'qa-public', private_key: 'qa-private' });
      assert.equal((await job(priorOrder)).status, 'pending');
      assert.equal((await q("SELECT count(*)::int n FROM horacerta.schema_migrations WHERE name='022-push-reliability'")).rows[0].n, 1);
      await clearOrders(); await clearDevices();
    });

    await t.test('session expiry/deletion retains device consent and jobs can be enqueued and sent', async () => {
      await device();
      await q("UPDATE horacerta.sessions SET expires_at=now()-interval '1 hour' WHERE token_hash='live'");
      await q("DELETE FROM horacerta.sessions WHERE token_hash='live'");
      const id = await order();
      assert.ok(await job(id));
      let calls = 0;
      const report = await dispatch(async () => { calls++; });
      assert.equal(calls, 1); assert.equal(report.sent, 1);
      assert.equal((await job(id)).last_reason, 'provider_accepted');
      await q("INSERT INTO horacerta.sessions(token_hash,user_id,expires_at,credential_version) VALUES('live',$1,now()+interval '1 hour',1)", [owner]);
      await clearOrders(); await clearDevices();
    });

    await t.test('enrollment requires current authenticated credentials and cannot steal another device on stale proof', async () => {
      const foreign = await device(other, 'foreign', 'other'), id = await order([other]);
      for (const hash of ['expired','stale','missing','other'])
        assert.equal(await registerPushDevice(sql, owner, hash, subscription('foreign')), false);
      assert.equal((await job(id)).subscription_id, foreign.id);
      assert.equal((await q('SELECT user_id FROM horacerta.push_subscriptions WHERE id=$1', [foreign.id])).rows[0].user_id, other);
      assert.equal(await registerPushDevice(sql, owner, 'live', subscription('foreign')), true);
      assert.equal(await job(id), undefined);
      assert.equal((await q('SELECT user_id FROM horacerta.push_subscriptions WHERE id=$1', [foreign.id])).rows[0].user_id, owner);
      await q('UPDATE horacerta.users SET pin_change_required=true WHERE id=$1', [owner]);
      assert.equal(await registerPushDevice(sql, owner, 'live', subscription('pin-gate')), false);
      await q('UPDATE horacerta.users SET pin_change_required=false WHERE id=$1', [owner]);
      await clearOrders(); await clearDevices();
    });

    await t.test('transient failure is retried by a later dispatch without creating another order; provider TTL uses remaining age', async () => {
      await device(); const id = await order();
      await q("UPDATE horacerta.push_jobs SET created_at=now()-interval '23 hours' WHERE order_id=$1", [id]);
      const first = await dispatch(async (_, __, options) => { assert.ok(options.TTL > 3500 && options.TTL <= 3600); throw { statusCode: 503 }; });
      assert.equal(first.retried, 1); assert.equal((await job(id)).status, 'pending');
      assert.equal((await job(id)).last_reason, 'provider_retry');
      assert.equal((await dispatch()).claimed, 0);
      await q('UPDATE horacerta.push_jobs SET available_at=now() WHERE order_id=$1', [id]);
      const second = await dispatch();
      assert.equal(second.sent, 1); assert.equal((await job(id)).attempts, 2);
      await clearOrders(); await clearDevices();
    });

    await t.test('parallel dispatchers claim one job once while its lease is active', async () => {
      await device(); const id = await order();
      let release, entered;
      const waiting = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      const first = dispatch(async () => { entered(); await waiting; });
      try { await started; assert.equal((await dispatch()).claimed, 0); }
      finally { release(); }
      assert.equal((await first).sent, 1); assert.equal((await job(id)).attempts, 1);
      await clearOrders(); await clearDevices();
    });

    await t.test('a reclaimed lease rejects stale finalization', async () => {
      await device(); const id = await order();
      const [old] = await store.claim(1);
      await q('UPDATE horacerta.push_jobs SET available_at=now() WHERE order_id=$1', [id]);
      const [current] = await store.claim(1);
      assert.notEqual(current.lease_token, old.lease_token);
      const result = { status: 'sent', reason: 'provider_accepted', code: 201 };
      assert.equal(await store.finalize(old, result), false);
      assert.equal((await job(id)).lease_token, current.lease_token);
      assert.equal(await store.finalize(current, result), true);
      await clearOrders(); await clearDevices();
    });

    await t.test('expired and exhausted jobs stop without a provider call', async () => {
      await device(); const expired = await order(), exhausted = await order();
      await q("UPDATE horacerta.push_jobs SET created_at=now()-interval '24 hours' WHERE order_id=$1", [expired]);
      await q("UPDATE horacerta.push_jobs SET status='sending',attempts=4,available_at=now() WHERE order_id=$1", [exhausted]);
      const report = await dispatch(async () => assert.fail('provider must not be called'));
      assert.equal(report.expired, 1); assert.equal(report.failed, 1); assert.equal(report.claimed, 0);
      assert.equal((await job(expired)).last_reason, 'expired'); assert.equal((await job(exhausted)).last_reason, 'attempt_limit');
      await clearOrders(); await clearDevices();
    });

    await t.test('terminal rejection and fourth transient attempt are retained as explicit failures', async () => {
      await device(); let id = await order();
      assert.equal((await dispatch(async () => { throw { statusCode: 403 }; })).failed, 1);
      assert.equal((await job(id)).last_reason, 'provider_rejected');
      await clearOrders(); id = await order();
      await q('UPDATE horacerta.push_jobs SET attempts=3 WHERE order_id=$1', [id]);
      assert.equal((await dispatch(async () => { throw { statusCode: 429 }; })).failed, 1);
      assert.equal((await job(id)).last_reason, 'attempt_limit');
      await clearOrders(); await clearDevices();
    });

    await t.test('410 revokes only the failing unchanged device; a concurrent renewal survives', async () => {
      const failed = await device(owner, 'gone'), kept = await device(owner, 'kept');
      await order();
      const report = await dispatch(async p => { if (p.endpoint === failed.endpoint) throw { statusCode: 410 }; });
      assert.equal(report.revokedDevices, 1); assert.equal(report.sent, 1);
      assert.deepEqual((await q('SELECT id FROM horacerta.push_subscriptions')).rows.map(r => r.id), [kept.id]);
      await clearOrders(); await clearDevices();
      const renewed = await device(owner, 'renewed'); await order();
      const next = await dispatch(async () => {
        assert.equal(await registerPushDevice(sql, owner, 'live', subscription('renewed')), true);
        throw { statusCode: 410 };
      });
      assert.equal(next.revokedDevices, 0);
      assert.equal((await q('SELECT id FROM horacerta.push_subscriptions')).rows[0].id, renewed.id);
      await clearOrders(); await clearDevices();
    });

    await t.test('assignment and hours are revalidated against current members, status and nondeleted entries', async () => {
      await device(); let id = await order();
      await q('UPDATE horacerta.orders SET members=$1 WHERE id=$2', [[other], id]);
      assert.equal((await dispatch(async () => assert.fail('removed member'))).reasons.unassigned, 1);
      await clearOrders(); id = await order();
      await q("UPDATE horacerta.orders SET status='Cancelada' WHERE id=$1", [id]);
      assert.equal((await dispatch(async () => assert.fail('closed assignment'))).reasons.order_closed, 1);
      await clearOrders(); id = await order([owner], 'Concluída');
      await q('DELETE FROM horacerta.push_jobs WHERE order_id=$1', [id]); await q('SELECT horacerta.queue_hours_reminder($1)', [id]);
      await q(`INSERT INTO horacerta.entries(user_id,order_id,date,start,"end",service,status,rate,rules) VALUES($1,$2,current_date,'08:00','09:00','QA','Pendente',0,'{}')`, [owner, id]);
      assert.equal((await dispatch(async () => assert.fail('hours already recorded'))).reasons.hours_recorded, 1);
      await clearOrders(); id = await order([owner], 'Concluída');
      await q('DELETE FROM horacerta.push_jobs WHERE order_id=$1', [id]); await q('SELECT horacerta.queue_hours_reminder($1)', [id]);
      await q("UPDATE horacerta.orders SET status='Em andamento' WHERE id=$1", [id]);
      assert.equal((await dispatch(async () => assert.fail('reopened order'))).reasons.order_open, 1);
      await clearOrders(); id = await order([owner], 'Concluída');
      await q('DELETE FROM horacerta.push_jobs WHERE order_id=$1', [id]); await q('SELECT horacerta.queue_hours_reminder($1)', [id]);
      assert.equal((await dispatch()).sent, 1);
      await clearOrders(); await clearDevices();
    });

    await t.test('missing VAPID is observable and leaves eligible jobs untouched', async () => {
      await device(); const id = await order();
      await q('DELETE FROM horacerta.push_config');
      const report = await dispatch(async () => assert.fail('missing configuration'));
      assert.equal(report.configMissing, true); assert.equal(report.claimed, 0); assert.equal((await job(id)).attempts, 0);
      await q("INSERT INTO horacerta.push_config VALUES(1,'qa-public','qa-private')");
      await clearOrders(); await clearDevices();
    });

    await t.test('session deletion waits on the enrollment session lock', async () => {
      await lockBarrier();
      const enrollment = registerPushDevice(withBarrier(2), owner, 'live', subscription('session-lock'));
      let deletion;
      try {
        await waitForBlocked(schema + '_gate');
        deletion = pool.query(replace("DELETE FROM horacerta.sessions WHERE token_hash='live'"));
        await waitForBlocked(schema + '.sessions');
      } finally { await unlockBarrier(); }
      assert.equal(await enrollment, true); await deletion;
      await clearDevices(); await restoreSession();
    });

    for (const first of ['logout', 'enrollment']) {
      await t.test(first + ' first: concurrent logout and enrollment leave no active device', async () => {
        const { logoutUserLockSql, logoutPushSql } = await import('../lib/logout-push.ts');
        assert.equal(typeof logoutUserLockSql, 'string', 'Use the final backend lock contract');
        const existing = await device(owner, 'logout-race'), foreign = await device(other, 'logout-foreign', 'other');
        const logout = adapter => adapter.transaction([
          adapter.query(logoutUserLockSql, ['live']),
          adapter.query(logoutPushSql, ['live', existing.endpoint]),
          adapter`DELETE FROM horacerta.sessions WHERE token_hash=${'live'}`,
        ]);
        await lockBarrier();
        let enrollment, exiting;
        try {
          if (first === 'logout') {
            exiting = logout(withBarrier(1));
            await waitForBlocked(schema + '_gate');
            enrollment = registerPushDevice(sql, owner, 'live', subscription('logout-race'));
            await waitForBlocked(schema + '.users');
            assert.equal((await q('SELECT count(*)::int n FROM horacerta.push_subscriptions WHERE user_id=$1', [owner])).rows[0].n, 1);
          } else {
            enrollment = registerPushDevice(withBarrier(2), owner, 'live', subscription('logout-race'));
            await waitForBlocked(schema + '_gate');
            exiting = logout(sql);
            await waitForBlocked(schema + '.users');
          }
        } finally { await unlockBarrier(); }
        await exiting; assert.equal(await enrollment, first === 'enrollment');
        assert.deepEqual((await q('SELECT id FROM horacerta.push_subscriptions')).rows.map(r => r.id), [foreign.id]);
        assert.equal((await q("SELECT count(*)::int n FROM horacerta.sessions WHERE token_hash='live'")).rows[0].n, 0);
        await clearDevices(); await restoreSession();
      });
    }

    await t.test('enrollment waits for credential mutation and rejects the previous session after the mutation commits', async () => {
      await connection.query('BEGIN');
      await q("UPDATE horacerta.users SET pin_hash='racing-change' WHERE id=$1", [owner]);
      const enrollment = registerPushDevice(sql, owner, 'live', subscription('racing'));
      try {
        await waitForBlocked(schema + '.users');
      } finally { await connection.query('COMMIT'); }
      assert.equal(await enrollment, false);
      assert.equal((await q('SELECT count(*)::int n FROM horacerta.push_subscriptions')).rows[0].n, 0);
      await q("INSERT INTO horacerta.sessions(token_hash,user_id,expires_at,credential_version) SELECT 'live',id,now()+interval '1 hour',credential_version FROM horacerta.users WHERE id=$1", [owner]);
    });

    await t.test('every PIN change and account deactivation revoke all owner devices while preserving others', async () => {
      await device(owner, 'a'); await device(owner, 'b'); const foreign = await device(other, 'c', 'other'); await order([owner, other]);
      await q("UPDATE horacerta.users SET pin_hash='changed' WHERE id=$1", [owner]);
      assert.deepEqual((await q('SELECT id FROM horacerta.push_subscriptions')).rows.map(r => r.id), [foreign.id]);
      assert.equal((await q('SELECT count(*)::int n FROM horacerta.sessions WHERE user_id=$1', [owner])).rows[0].n, 0);
      assert.equal((await q('SELECT count(*)::int n FROM horacerta.push_jobs WHERE user_id=$1', [owner])).rows[0].n, 0);
      assert.equal(await registerPushDevice(sql, owner, 'live', subscription('a')), false);
      await q("INSERT INTO horacerta.sessions(token_hash,user_id,expires_at,credential_version) SELECT 'new',id,now()+interval '1 hour',credential_version FROM horacerta.users WHERE id=$1", [owner]);
      await device(owner, 'reactivated', 'new');
      await q('UPDATE horacerta.users SET active=false WHERE id=$1', [owner]);
      assert.deepEqual((await q('SELECT id FROM horacerta.push_subscriptions')).rows.map(r => r.id), [foreign.id]);
      assert.equal(await registerPushDevice(sql, owner, 'new', subscription('reactivated')), false);
    });
  } finally {
    // Only the validated generated schema can reach this destructive operation.
    await connection.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    connection.release(); await pool.end();
  }
});
