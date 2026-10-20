// Mutates only a unique disposable schema. Never falls back to DATABASE_URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated isolated PostgreSQL test database. This integration suite never uses DATABASE_URL as a fallback.');
test('identity migration and concurrent monthly integrity (isolated PostgreSQL)', async t => {
  if (process.env.DATABASE_URL) {
    const a = new URL(testUrl), b = new URL(process.env.DATABASE_URL);
    assert.notEqual(a.hostname + a.pathname, b.hostname + b.pathname, 'TEST_DATABASE_URL must address a separate database');
  }
  let PoolDriver = Pool;
  if (['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)) {
    // Embedded/local PostgreSQL speaks native TCP; remote Neon keeps its WebSocket path.
    const pg = await import('pg');
    PoolDriver = pg.default.Pool;
  } else {
    neonConfig.webSocketConstructor = WebSocket;
  }
  const pool = new PoolDriver({ connectionString: testUrl });
  const schema = 'qa_security_' + randomUUID().replaceAll('-', '');
  const rewrite = source => source.replaceAll('horacerta', schema).replaceAll('2849061701', '2849061799');
  const load = async name => rewrite(await readFile(new URL('../sql/' + name, import.meta.url), 'utf8'));
  const admin = randomUUID(), worker = randomUUID(), entry = randomUUID();
  const month = '2020-01-01';
  let first, second;
  try {
    first = await pool.connect(); second = await pool.connect();
    await first.query("SET statement_timeout='15s'");
    await second.query("SET statement_timeout='15s'");
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const waitForLock = async type => {
      const deadline = Date.now() + 10000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        waiting = (await first.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype=$2 AND NOT granted) AS waiting', [secondPid, type])).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true, `Second connection must actually wait for ${type}`);
    };
    await first.query(await load('001-schema.sql'));
    await first.query(`ALTER TABLE ${schema}.users ADD COLUMN pin_hash text, ADD COLUMN login_attempts integer NOT NULL DEFAULT 0, ADD COLUMN attempt_window timestamptz;
      CREATE TABLE ${schema}.sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES ${schema}.users(id),expires_at timestamptz NOT NULL);
      ALTER TABLE ${schema}.entries ADD COLUMN order_id uuid;
      CREATE TABLE ${schema}.orders(id uuid PRIMARY KEY,client_id uuid);
      CREATE TABLE ${schema}.timers(user_id uuid PRIMARY KEY,started_at timestamptz NOT NULL,paused_at timestamptz,pauses jsonb NOT NULL DEFAULT '[]',rate numeric NOT NULL DEFAULT 0,rules jsonb NOT NULL DEFAULT '{}',company text NOT NULL DEFAULT '',service text NOT NULL DEFAULT 'QA',notes text NOT NULL DEFAULT '',order_id uuid)`);
    const flow = (await load('019-flow-fixes.sql')).split(/\r?\n-- statement-break\r?\n/);
    for (const statement of flow) {
      if (statement.includes(`ALTER TABLE ${schema}.push_jobs`)) break;
      await first.query(statement);
    }
    const migration = await load('020-identity-integrity.sql');
    await first.query(migration); await first.query(migration);
    await first.query(await load('002-clock-function.sql'));
    await first.query(`INSERT INTO ${schema}.users(id,name,email,role,hourly_rate,pin_hash,pin_change_required) VALUES ($1,'Admin','admin@example.invalid','coordinator',0,'admin-hash',false),($2,'Worker','worker@example.invalid','employee',0,'old-hash',true)`, [admin, worker]);
    const login = (client, hash, version, token) => client.query(`SELECT ${schema}.complete_pin_login($1,$2,$3,$4,30) AS person`, [worker, hash, version, token.repeat(64)]);
    await t.test('temporary credential expires, is consumed once, and revoked sessions never revive', async () => {
      assert.equal((await login(first, 'old-hash', 1, 'a')).rows[0].person, null);
      await first.query(`UPDATE ${schema}.users SET temporary_pin_expires_at=now()+interval '24 hours' WHERE id=$1`, [worker]);
      assert.ok((await login(first, 'old-hash', 1, 'a')).rows[0].person);
      assert.equal((await login(first, 'old-hash', 1, 'b')).rows[0].person, null);
      const row = (await first.query(`SELECT expires_at<now()+interval '13 hours' AS short FROM ${schema}.sessions WHERE user_id=$1`, [worker])).rows[0];
      assert.equal(row.short, true);
      await first.query(`UPDATE ${schema}.users SET pin_hash='new-hash',pin_change_required=false WHERE id=$1`, [worker]);
      assert.equal((await login(first, 'old-hash', 1, 'c')).rows[0].person, null);
      assert.equal((await first.query(`SELECT count(*)::int n FROM ${schema}.sessions WHERE user_id=$1`, [worker])).rows[0].n, 0);
    });
    await t.test('reset wins against an in-flight proof of the previous PIN', async () => {
      await first.query('BEGIN');
      await first.query(`UPDATE ${schema}.users SET pin_hash='reset-hash' WHERE id=$1`, [worker]);
      const pending = login(second, 'new-hash', 2, 'd');
      pending.catch(() => {});
      await waitForLock('transactionid');
      await first.query('COMMIT');
      assert.equal((await pending).rows[0].person, null);
    });
    await t.test('reset revokes a login that committed first', async () => {
      await first.query('BEGIN');
      assert.ok((await login(first, 'reset-hash', 3, 'e')).rows[0].person);
      const pending = second.query(`UPDATE ${schema}.users SET pin_hash='final-hash' WHERE id=$1`, [worker]);
      pending.catch(() => {});
      await waitForLock('transactionid');
      await first.query('COMMIT'); await pending;
      assert.equal((await first.query(`SELECT count(*)::int n FROM ${schema}.sessions WHERE user_id=$1`, [worker])).rows[0].n, 0);
      await first.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [worker]);
      assert.equal((await login(first, 'final-hash', 4, 'f')).rows[0].person, null);
    });
    await first.query(`INSERT INTO ${schema}.entries(id,user_id,date,start,"end",service,status,rate,rules) VALUES($1,$2,'2020-01-02','08:00','09:00','QA','Aprovado',0,'{}')`, [entry, worker]);
    await t.test('a close that wins the lock prevents concurrent direct status edits', async () => {
      await first.query('BEGIN');
      await first.query(`SELECT ${schema}.month_action($1,'close',$2,NULL,NULL)`, [admin, month]);
      const pending = second.query(`UPDATE ${schema}.entries SET status='Pendente' WHERE id=$1`, [entry]);
      // Attach rejection handling before releasing the lock to avoid unhandled rejections.
      const rejected = assert.rejects(pending, /fechado/);
      await waitForLock('advisory');
      await first.query('COMMIT'); await rejected;
      assert.equal((await first.query(`SELECT status FROM ${schema}.entries WHERE id=$1`, [entry])).rows[0].status, 'Aprovado');
      await first.query(`SELECT ${schema}.month_action($1,'reopen',$2,NULL,'Reabertura para teste isolado')`, [admin, month]);
    });
    await t.test('a status edit that wins the lock prevents closing unapproved work', async () => {
      await first.query('BEGIN');
      await first.query(`UPDATE ${schema}.entries SET status='Pendente' WHERE id=$1`, [entry]);
      const pending = second.query(`SELECT ${schema}.month_action($1,'close',$2,NULL,NULL)`, [admin, month]);
      const rejected = assert.rejects(pending, /aprovados/);
      await waitForLock('advisory');
      await first.query('COMMIT'); await rejected;
      assert.equal((await first.query(`SELECT count(*)::int n FROM ${schema}.month_closings`)).rows[0].n, 0);
    });
    await t.test('legacy stop takes the advisory lock before its user row lock', async () => {
      await first.query(`UPDATE ${schema}.users SET active=true WHERE id=$1`, [worker]);
      await first.query(`INSERT INTO ${schema}.timers(user_id,started_at) VALUES($1,now()-interval '10 minutes')`, [worker]);
      await first.query('BEGIN');
      await first.query('SELECT pg_advisory_xact_lock(2849061799)');
      const stop = second.query(`SELECT ${schema}.clock_action($1,'stop')`, [worker]);
      stop.catch(() => {});
      // Observe the actual advisory-lock wait before probing the row; no timing assumption.
      await waitForLock('advisory');
      // The old order held this row already and caused a manual entry/stop deadlock.
      await first.query(`SELECT id FROM ${schema}.users WHERE id=$1 FOR UPDATE NOWAIT`, [worker]);
      await first.query('COMMIT');
      assert.equal((await stop).rows[0].clock_action.ok, true);
    });
  } finally {
    // Release a held advisory lock before draining another connection's queued work.
    if (first) await first.query('ROLLBACK');
    if (second) { await second.query('ROLLBACK'); second.release(); }
    if (first) {
      await first.query('ROLLBACK');
      await first.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      first.release();
    }
    await pool.end();
  }
});
