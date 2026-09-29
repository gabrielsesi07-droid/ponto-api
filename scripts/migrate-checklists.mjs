import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
for (const file of ['007-checklists.sql', '009-imported-checklists.sql', '008-checklist-actions.sql']) {
  const source = await readFile(new URL('../sql/' + file, import.meta.url), 'utf8');
  await sql.transaction(source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()).map(s => sql.query(s)));
}
console.log('Modelos de checklist e cópias por OS preparados.');
