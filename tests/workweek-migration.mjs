import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const schema='qa_week_'+randomUUID().replaceAll('-','');
const read=name=>readFile(new URL('../sql/'+name,import.meta.url),'utf8');
const statements=(await read('001-schema.sql')).split(';').filter(s=>s.trim());
statements.push(...(await read('014-monthly-salary.sql')).split(/\r?\n-- statement-break\r?\n/));
statements.push(`INSERT INTO horacerta.users(name,email,role,hourly_rate,monthly_salary) VALUES('QA','week@example.invalid','employee',0,4000)`);
statements.push(`INSERT INTO horacerta.entries(user_id,date,start,"end",service,status,rate,rules) SELECT id,current_date,'08:00','18:00','QA','Pendente',18.18,'{"daily_minutes":540}' FROM horacerta.users`);
const migration=(await read('015-company-workweek.sql')).split(/\r?\n-- statement-break\r?\n/);
statements.push(...migration,...migration);
const serviceDay=await read('016-service-day.sql');
statements.push(serviceDay,serviceDay);
statements.push(`DO $$ BEGIN
 ASSERT (SELECT monthly_hours=200 AND hourly_rate=20 FROM horacerta.users),'Current salary rate recalculated';
 ASSERT (SELECT (rules->>'daily_minutes')::int=540 FROM horacerta.settings WHERE id=1),'Service quota 9h independent of office divisor';
 ASSERT (SELECT rate=18.18 AND (rules->>'daily_minutes')::int=540 FROM horacerta.entries),'Historical snapshots retained';
 ASSERT (SELECT count(*)=2 FROM horacerta.schema_migrations),'Migrations are idempotent';
 INSERT INTO horacerta.users(name,email,role,hourly_rate,monthly_salary) VALUES('New','new@example.invalid','employee',0,4000);
 ASSERT (SELECT monthly_hours=200 AND hourly_rate=20 FROM horacerta.users WHERE email='new@example.invalid'),'New account default';
 RAISE EXCEPTION 'QA_WEEK_ROLLBACK_OK'; END $$`);
try {await sql.transaction(statements.map(s=>sql.query(s.replaceAll('horacerta',schema).replaceAll('2849061701','2849061703'))));throw new Error('Expected rollback');}
catch(e){if(e.message!=='QA_WEEK_ROLLBACK_OK')throw e;}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length,0);
console.log('9h service / 200h salary migrations verified in isolated schema and fully rolled back.');
