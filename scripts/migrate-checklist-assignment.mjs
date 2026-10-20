import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the explicit checklist assignment migration.');
const sql = neon(process.env.DATABASE_URL);
const ddl = await readFile(new URL('../sql/021-checklist-assignment.sql', import.meta.url), 'utf8');
const actions = await readFile(new URL('../sql/008-checklist-actions.sql', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../sql/011-order-lifecycle.sql', import.meta.url), 'utf8');
await sql.transaction([
  sql`SELECT pg_advisory_xact_lock(2849061701)`,
  ...ddl.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()).map(s => sql.query(s)),
  sql.query(actions),
  ...lifecycle.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()).map(s => sql.query(s)),
]);
console.log('Checklist assignment migration applied. Existing teams, work records and checklist contents preserved; no assignments created.');
