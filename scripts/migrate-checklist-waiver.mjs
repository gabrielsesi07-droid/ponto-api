import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const statements=[];
for(const file of ['018-checklist-waiver.sql','011-order-lifecycle.sql']) {
 const source=await readFile(new URL('../sql/'+file,import.meta.url),'utf8');
 statements.push(...source.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)));
}
await sql.transaction(statements);
console.log('Dispensa auditada de checklists preparada. Nenhum checklist foi dispensado.');
