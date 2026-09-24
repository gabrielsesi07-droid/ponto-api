import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const source=await readFile(new URL('../sql/001-schema.sql',import.meta.url),'utf8');
await sql.transaction(source.split(';').map(x=>x.trim()).filter(Boolean).map(query=>sql.query(query)));
console.log('Estrutura HoraCerta aplicada. Nenhum dado de exemplo foi inserido.');
await import('./migrate-quick.mjs');
