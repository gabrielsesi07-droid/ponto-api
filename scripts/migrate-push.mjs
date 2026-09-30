import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
import webpush from 'web-push';
const sql=neon(process.env.DATABASE_URL);
const source=await readFile(new URL('../sql/017-push-notifications.sql',import.meta.url),'utf8');
await sql.transaction(source.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)));
const keys=webpush.generateVAPIDKeys();
await sql`INSERT INTO horacerta.push_config(id,public_key,private_key) VALUES(1,${keys.publicKey},${keys.privateKey}) ON CONFLICT DO NOTHING`;
console.log('Push schema prepared; signing keys retained privately in the database. No notifications sent.');
