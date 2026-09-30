import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const source=await readFile(new URL('../sql/015-company-workweek.sql',import.meta.url),'utf8');
await sql.transaction(source.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)));
console.log('Jornada padrão aplicada: 480 minutos/dia, divisor mensal 200. Pontos e cronômetros históricos preservados.');
