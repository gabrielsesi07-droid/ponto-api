// Loopback-only Neon HTTP protocol adapter for disposable local PostgreSQL.
import { createServer } from 'node:http';
import pg from 'pg';

const expectedUrl = process.env.TEST_DATABASE_URL;
if (process.env.HORACERTA_LOCAL_NEON_TEST !== '1' || process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')
  throw new Error('Local Neon proxy requires explicit QA opt-in and cannot run in production.');
const target = new URL(expectedUrl || 'about:blank');
if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/horacerta_qa' || !target.port)
  throw new Error('Local Neon proxy requires TEST_DATABASE_URL for explicit loopback port/database horacerta_qa.');
const pool = new pg.Pool({ connectionString: expectedUrl, max: 10, connectionTimeoutMillis: 3000, statement_timeout: 15000 });
const rawTypes = { getTypeParser: () => value => value };
const levels = { ReadUncommitted: 'READ UNCOMMITTED', ReadCommitted: 'READ COMMITTED', RepeatableRead: 'REPEATABLE READ', Serializable: 'SERIALIZABLE' };
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const invalid = message => Object.assign(new Error(message), { code: '22023' });
async function query(client, item) {
  if (!item || typeof item.query !== 'string' || !Array.isArray(item.params ?? [])) throw invalid('Invalid QA query envelope.');
  const result = await client.query({ text: item.query, values: item.params ?? [], rowMode: 'array', types: rawTypes });
  // Multi-statement migration DDL returns multiple command results; expose its last result.
  const last = Array.isArray(result) ? result.at(-1) : result;
  return { command: last.command, rowCount: last.rowCount, oid: last.oid, rows: last.rows, fields: last.fields };
}
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/sql' || req.headers['neon-connection-string'] !== expectedUrl) {
    send(res, 403, { code: '28000', message: 'QA adapter only accepts its exact local test database.' }); return;
  }
  let client, batch = false;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw invalid('QA query envelope is too large.');
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    batch = Array.isArray(body.queries);
    client = await pool.connect();
    if (batch) {
      const level = req.headers['neon-batch-isolation-level'];
      if (level && !levels[level]) throw invalid('Invalid QA transaction isolation level.');
      const readOnly = req.headers['neon-batch-read-only'], deferrable = req.headers['neon-batch-deferrable'];
      for (const flag of [readOnly, deferrable]) if (flag !== undefined && !['true', 'false'].includes(flag)) throw invalid('Invalid QA transaction flag.');
      await client.query(`BEGIN${level ? ' ISOLATION LEVEL ' + levels[level] : ''}${readOnly === 'true' ? ' READ ONLY' : ' READ WRITE'}${deferrable === 'true' ? ' DEFERRABLE' : ' NOT DEFERRABLE'}`);
      const results = [];
      for (const item of body.queries) results.push(await query(client, item));
      await client.query('COMMIT');
      send(res, 200, { results });
    } else {
      send(res, 200, await query(client, body));
    }
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    const fields = ['severity', 'code', 'message', 'detail', 'hint', 'position', 'where', 'schema', 'table', 'column', 'constraint'];
    send(res, 400, Object.fromEntries(fields.filter(key => error[key] !== undefined).map(key => [key, error[key]])));
  } finally {
    client?.release();
  }
});
server.listen(55433, '127.0.0.1', () => console.log('QA Neon adapter listening on 127.0.0.1:55433; fixed database horacerta_qa.'));
async function stop() { server.close(); await pool.end(); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
