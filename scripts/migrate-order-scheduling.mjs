import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../sql/025-order-scheduling.sql', import.meta.url), 'utf8');
await sql.transaction(source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()).map(s => sql.query(s)));
console.log('Edição auditada de previsões da OS e datas de viagem preparada. Nenhum registro existente foi alterado.');
