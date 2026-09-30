import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const statements=[];
for (const file of ['019-flow-fixes.sql']) {
 const source=await readFile(new URL('../sql/'+file,import.meta.url),'utf8');
 statements.push(...source.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)));
}
// order_action depende de queue_hours_reminder; reaplicada na mesma transação.
statements.push(sql.query(await readFile(new URL('../sql/004-order-actions.sql',import.meta.url),'utf8')));
await sql.transaction(statements);
console.log('Revisão do fluxo aplicada: intervalo por dia, fechamento mensal e lembrete de horas. Nenhum registro existente foi recalculado.');
