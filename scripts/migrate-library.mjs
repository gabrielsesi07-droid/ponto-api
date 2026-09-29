import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../sql/006-library.sql', import.meta.url), 'utf8');
await sql.transaction(source.split(/\r?\n-- statement-break\r?\n/).filter(x => x.trim()).map(q => sql.query(q)));
console.log('Biblioteca técnica privada preparada.');
