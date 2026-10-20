// Explicit protocol verification. Start the QA proxy and load tests/support/local-neon.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

if (process.env.HORACERTA_LOCAL_NEON_TEST !== '1' || !process.env.TEST_DATABASE_URL)
  throw new Error('Run only with explicit loopback QA environment and --import ./tests/support/local-neon.mjs.');
const sql = neon(process.env.TEST_DATABASE_URL);
test('local Neon adapter preserves wire types, transactions, errors and target guards', async t => {
  const schema = 'qa_transport_' + randomUUID().replaceAll('-', '');
  await sql.query(`CREATE SCHEMA ${schema}`);
  try {
    await t.test('official Neon client decodes raw text using PostgreSQL type OIDs', async () => {
      const [row] = await sql`SELECT ${true}::boolean b,${false}::boolean f,${42}::integer n,${'12.34'}::numeric amount,${JSON.stringify({ safe: true })}::jsonb data,ARRAY[1,2]::integer[] items,NULL::text empty`;
      assert.deepEqual(row, { b: true, f: false, n: 42, amount: '12.34', data: { safe: true }, items: [1, 2], empty: null });
    });
    await sql.query(`CREATE TABLE ${schema}.items(id integer PRIMARY KEY,value text)`);
    await t.test('a batch uses a single transaction and fully rolls back on PG error', async () => {
      await assert.rejects(sql.transaction([
        sql.query(`INSERT INTO ${schema}.items VALUES(1,'first')`),
        sql.query(`INSERT INTO ${schema}.items VALUES(1,'duplicate')`),
      ]), error => error.code === '23505');
      assert.equal((await sql.query(`SELECT count(*)::int n FROM ${schema}.items`))[0].n, 0);
      const results = await sql.transaction([
        sql.query(`INSERT INTO ${schema}.items VALUES(2,'committed') RETURNING id`),
        sql.query(`SELECT value FROM ${schema}.items WHERE id=2`),
      ]);
      assert.equal(results[0][0].id, 2); assert.equal(results[1][0].value, 'committed');
    });
    await t.test('PG domain exceptions retain their original code and message', async () => {
      await assert.rejects(sql.query("DO $$ BEGIN RAISE EXCEPTION 'QA domain failure'; END $$"), error => error.code === 'P0001' && error.message === 'QA domain failure');
    });
    await t.test('preload rejects a different connection instead of falling back remotely', async () => {
      await assert.rejects(fetch('http://127.0.0.1:55433/sql', { method: 'POST', headers: { 'Neon-Connection-String': 'postgresql://invalid@localhost:55432/wrong_database' }, body: '{}' }), /exact loopback test database/);
      const denied = await fetch('http://127.0.0.1:55433/sql', { method: 'POST', body: '{}' });
      assert.equal(denied.status, 403);
    });
  } finally {
    await sql.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});
