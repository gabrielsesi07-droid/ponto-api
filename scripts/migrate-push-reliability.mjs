import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the explicit push reliability migration.');
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../sql/022-push-reliability.sql', import.meta.url), 'utf8');
await sql.transaction([
  sql`SELECT pg_advisory_xact_lock(2849061701)`,
  ...source.split(/\r?\n-- statement-break\r?\n/).filter(statement => statement.trim()).map(statement => sql.query(statement)),
]);
console.log('Push reliability migration applied. Device consent retained; no keys regenerated or notifications sent.');
