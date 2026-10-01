import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
const target=process.env.TEST_DATABASE_URL;
if (process.env.HORACERTA_LOCAL_NEON_TEST!=='1' || !target || process.env.NODE_ENV==='production' || process.env.VERCEL_ENV==='production')
  throw new Error('Push migration tests require explicit local QA configuration; DATABASE_URL is never a fallback.');
const address=new URL(target);
if (!['postgres:', 'postgresql:'].includes(address.protocol) || !['127.0.0.1','localhost'].includes(address.hostname) || address.pathname!=='/horacerta_qa' || !address.port)
  throw new Error('Push migration tests only accept the dedicated loopback horacerta_qa database.');
if (process.env.DATABASE_URL && process.env.DATABASE_URL!==target) throw new Error('QA DATABASE_URL must match TEST_DATABASE_URL when present.');
const sql=neon(target),schema='qa_push_'+randomUUID().replaceAll('-','');
const read=name=>readFile(new URL('../sql/'+name,import.meta.url),'utf8');
const statements=(await read('001-schema.sql')).split(';').filter(s=>s.trim());
statements.push('CREATE TABLE horacerta.timers(user_id uuid)', 'CREATE TABLE horacerta.sessions(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz)');
for(const name of ['003-orders.sql','005-flexible-client.sql','017-push-notifications.sql','017-push-notifications.sql']) statements.push(...(await read(name)).split(/\r?\n-- statement-break\r?\n/));
statements.push(`DO $$ DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();o uuid; BEGIN
 INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(a,'A','a@qa.invalid','employee',0),(b,'B','b@qa.invalid','employee',0);
 INSERT INTO horacerta.sessions VALUES('a',a,now()+interval '1 hour'),('b',b,now()+interval '1 hour'),('expired',a,now()-interval '1 hour');
 INSERT INTO horacerta.push_subscriptions(user_id,session_hash,endpoint,p256dh,auth) VALUES(a,'a','https://fcm.googleapis.com/a','key','auth'),(b,'b','https://fcm.googleapis.com/b','key','auth'),(a,'expired','https://fcm.googleapis.com/expired','key','auth');
 INSERT INTO horacerta.orders(title,client_name,address,starts_at,ends_at,members,created_by) VALUES('QA','QA','',now(),now()+interval '1 hour',ARRAY[a],a) RETURNING id INTO o;
 ASSERT (SELECT count(*)=1 FROM horacerta.push_jobs),'Only designated and unexpired device queued';
 ASSERT (SELECT user_id=a FROM horacerta.push_jobs),'Recipient is assigned';
 UPDATE horacerta.orders SET title='QA edit' WHERE id=o;
 ASSERT (SELECT count(*)=1 FROM horacerta.push_jobs),'Editing does not duplicate creation event';
 DELETE FROM horacerta.sessions WHERE token_hash='a';
 ASSERT (SELECT count(*)=0 FROM horacerta.push_jobs),'Logout removes queued jobs and subscription';
 ASSERT (SELECT count(*)=0 FROM horacerta.push_subscriptions WHERE session_hash='a'),'Session device revoked';
 RAISE EXCEPTION 'QA_PUSH_ROLLBACK'; END $$`);
try{await sql.transaction(statements.map(s=>sql.query(s.replaceAll('horacerta',schema))));throw new Error('Expected rollback');}
catch(e){if(e.message!=='QA_PUSH_ROLLBACK')throw e;}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length,0);
console.log('Push recipient, deduplication and logout tests passed; transaction fully rolled back. No pushes sent.');
