import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { logoutUserLockSql, logoutPushSql } from '../lib/logout-push.ts';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL test database for logout-push.integration.mjs.');
if (process.env.DATABASE_URL) {
  const a = new URL(url), b = new URL(process.env.DATABASE_URL);
  assert.notEqual(a.hostname + a.pathname, b.hostname + b.pathname, 'Use a separate integration database');
}
test('logout removes only the owning device with live proof or exact provenance', async () => {
  let Driver = Pool;
  if (['localhost', '127.0.0.1'].includes(new URL(url).hostname)) Driver = (await import('pg')).default.Pool;
  else neonConfig.webSocketConstructor = WebSocket;
  const pool = new Driver({ connectionString: url }), schema = 'qa_logout_' + randomUUID().replaceAll('-', '');
  const client = await pool.connect(), owner = randomUUID(), other = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.users(id uuid PRIMARY KEY,credential_version int,active bool);
      CREATE TABLE ${schema}.sessions(token_hash text PRIMARY KEY,user_id uuid,credential_version int,expires_at timestamptz);
      CREATE TABLE ${schema}.push_subscriptions(endpoint text PRIMARY KEY,user_id uuid,session_hash text NOT NULL)`);
    await client.query(`INSERT INTO ${schema}.users VALUES($1,2,true),($2,1,true)`, [owner, other]);
    const reset = async () => {
      await client.query(`DELETE FROM ${schema}.sessions; DELETE FROM ${schema}.push_subscriptions`);
      await client.query(`INSERT INTO ${schema}.sessions VALUES('live',$1,2,now()+interval '1 hour'),('expired',$1,2,now()-interval '1 hour'),('stale',$1,1,now()+interval '1 hour')`, [owner]);
      await client.query(`INSERT INTO ${schema}.push_subscriptions VALUES('own-current',$1,'live'),('own-older-device',$1,'older-registration'),('own-other-device',$1,'another-session'),('foreign',$2,'foreign-session'),('own-expired',$1,'expired')`, [owner, other]);
    };
    const logout = async (hash, endpoint) => {
      await client.query(logoutUserLockSql.replaceAll('horacerta', schema), [hash]);
      await client.query(logoutPushSql.replaceAll('horacerta', schema), [hash, endpoint]);
      await client.query(`DELETE FROM ${schema}.sessions WHERE token_hash=$1`, [hash]);
    };
    const endpoints = async () => (await client.query(`SELECT endpoint FROM ${schema}.push_subscriptions ORDER BY endpoint`)).rows.map(r => r.endpoint);
    await reset(); await logout('live', 'own-older-device');
    assert.deepEqual(await endpoints(), ['foreign','own-expired','own-other-device']);
    assert.equal((await client.query(`SELECT count(*)::int n FROM ${schema}.sessions WHERE token_hash='live'`)).rows[0].n, 0);
    await reset(); await logout('live', 'foreign');
    assert.deepEqual(await endpoints(), ['foreign','own-expired','own-older-device','own-other-device']);
    await reset(); await logout('expired', 'own-older-device');
    assert.deepEqual(await endpoints(), ['foreign','own-current','own-older-device','own-other-device']);
    await reset(); await logout('stale', 'own-older-device');
    assert.deepEqual(await endpoints(), ['foreign','own-current','own-expired','own-older-device','own-other-device']);
    await reset(); await logout('missing', 'own-older-device');
    assert.equal((await endpoints()).length, 5);
    await reset(); await client.query(`UPDATE ${schema}.users SET active=false WHERE id=$1`, [owner]); await logout('live', 'own-older-device');
    assert.deepEqual(await endpoints(), ['foreign','own-expired','own-older-device','own-other-device']);
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
