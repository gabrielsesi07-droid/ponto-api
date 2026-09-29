import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../sql/003-orders.sql', import.meta.url), 'utf8');
const actions = await readFile(new URL('../sql/004-order-actions.sql', import.meta.url), 'utf8');
const flexibleClient = await readFile(new URL('../sql/005-flexible-client.sql', import.meta.url), 'utf8');
await sql.transaction([...source.split(/\r?\n-- statement-break\r?\n/).filter(x => x.trim()).map(q => sql.query(q)), sql.query(flexibleClient)]);
await import('./migrate-library.mjs');
await import('./migrate-checklists.mjs');
await sql.query(await readFile(new URL('../sql/010-client-search.sql',import.meta.url),'utf8'));
const lifecycle = await readFile(new URL('../sql/011-order-lifecycle.sql',import.meta.url),'utf8');
await sql.transaction(lifecycle.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)));
await sql.query(await readFile(new URL('../sql/012-client-lifecycle.sql',import.meta.url),'utf8'));
const pointRules = await readFile(new URL('../sql/013-points-require-order.sql',import.meta.url),'utf8');
await sql.transaction([
 ...pointRules.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)),
 sql.query(actions),
 sql.query(await readFile(new URL('../sql/002-clock-function.sql',import.meta.url),'utf8'))
]);
console.log('Ordens de serviço, clientes e frota preparados.');
