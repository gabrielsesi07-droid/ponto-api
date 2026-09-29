// All objects live in a random schema, in ONE transaction that is rolled back.
// No production OS, client, user or sequence is read, created or consumed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql=neon(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const schema='qa_os_'+randomUUID().replaceAll('-','');
const read=async name=>readFile(new URL('../sql/'+name,import.meta.url),'utf8');
const statements=(await read('001-schema.sql')).split(';').filter(s=>s.trim());
statements.push(`CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id),started_at timestamptz NOT NULL,paused_at timestamptz,pauses jsonb NOT NULL DEFAULT '[]',rate numeric(12,2) NOT NULL,rules jsonb NOT NULL,company text NOT NULL DEFAULT '',service text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '')`);
for(const name of ['003-orders.sql','005-flexible-client.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','010-client-search.sql','008-checklist-actions.sql','004-order-actions.sql','002-clock-start-function.sql','002-clock-function.sql']) statements.push(...(await read(name)).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
statements.push(`DO $$
DECLARE admin uuid:=gen_random_uuid();worker uuid:=gen_random_uuid();model uuid:=gen_random_uuid();cid uuid;first_id uuid;second_id uuid;fresh_id uuid;result jsonb;p jsonb;first_num bigint;second_num bigint;seq_before bigint;count_before bigint;check_id uuid;item jsonb;
BEGIN
 INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(admin,'QA admin','admin@example.invalid','coordinator',0),(worker,'QA worker','worker@example.invalid','employee',0);
 INSERT INTO horacerta.equipment_models(id,name,family) VALUES(model,'Radian QA','Laser Tracker');
 item:=jsonb_build_object('id',gen_random_uuid(),'label','Cabo','planned',1,'outgoing',false,'incoming',false,'outgoing_qty',NULL,'incoming_qty',NULL,'na',false,'notes','');
 INSERT INTO horacerta.checklist_templates(model_id,title,status,items) VALUES(model,'Lista QA','active',jsonb_build_array(item));
 p:=jsonb_build_object('title','Serviço QA','client_name','Indústria São José','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(worker),'model_ids',jsonb_build_array(model),'starts_at',now(),'ends_at',now()+interval '1 hour');
 result:=horacerta.order_action(admin,'save_order',p); first_id:=(result->>'id')::uuid;first_num:=(result->>'number')::bigint;
 ASSERT first_num=1,'First OS number';
 SELECT client_id INTO cid FROM horacerta.orders WHERE id=first_id;
 ASSERT cid IS NOT NULL AND (SELECT count(*)=1 FROM horacerta.clients),'Client auto-created';
 ASSERT (SELECT model_ids=ARRAY[model] FROM horacerta.orders WHERE id=first_id),'Equipment persists';
 ASSERT (SELECT name='Radian QA' FROM horacerta.equipment_models WHERE id=ANY((SELECT model_ids FROM horacerta.orders WHERE id=first_id)::uuid[])),'Equipment name resolved';
 ASSERT (SELECT count(*)=1 FROM horacerta.order_checklists WHERE order_id=first_id),'Checklist linked';
 SELECT id INTO check_id FROM horacerta.order_checklists WHERE order_id=first_id;
 SELECT last_value INTO seq_before FROM horacerta.orders_number_seq;
 PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('id',first_id,'version',1,'title','Editado','client_name','  INDUSTRIA   SAO JOSE '));
 ASSERT (SELECT last_value=seq_before FROM horacerta.orders_number_seq),'Editing cannot consume sequence';
 ASSERT (SELECT number=first_num AND client_id=cid AND model_ids=ARRAY[model] FROM horacerta.orders WHERE id=first_id),'Edit preserves number/client/equipment';
 ASSERT (SELECT count(*)=1 FROM horacerta.clients),'Normalized name reused';
 ASSERT (SELECT count(*)=1 FROM horacerta.order_checklists WHERE order_id=first_id),'Edit preserves checklist';
 BEGIN
   PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('client_name','Cliente deve reverter'));
   RAISE EXCEPTION 'Expected scheduling conflict';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='Expected scheduling conflict' THEN RAISE; END IF;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM horacerta.clients WHERE name='Cliente deve reverter'),'Failed OS rolls back auto-client';
 result:=horacerta.order_action(admin,'save_order',p||jsonb_build_object('starts_at',now()+interval '2 hours','ends_at',now()+interval '3 hours','client_name','industria sao jose'));
 second_id:=(result->>'id')::uuid;second_num:=(result->>'number')::bigint;
 ASSERT second_num=first_num+1,'New order takes next number after edits';
 ASSERT (SELECT client_id=cid FROM horacerta.orders WHERE id=second_id),'Next order reuses client';
 PERFORM horacerta.order_action(admin,'delete_order',jsonb_build_object('id',second_id,'version',1,'confirmation','OS-'||lpad(second_num::text,6,'0')));
 ASSERT EXISTS(SELECT 1 FROM horacerta.clients WHERE id=cid),'Deletion preserves customer';
 result:=horacerta.order_action(admin,'save_order',p||jsonb_build_object('starts_at',now()+interval '4 hours','ends_at',now()+interval '5 hours','client_name','Outra empresa'));
 fresh_id:=(result->>'id')::uuid;
 ASSERT (result->>'number')::bigint=second_num+1,'Deleted number is not reused';
 ASSERT (SELECT count(*)=2 FROM horacerta.clients),'Distinct name creates distinct client';
 UPDATE horacerta.clients SET active=false WHERE id=cid;
 BEGIN
   PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('starts_at',now()+interval '6 hours','ends_at',now()+interval '7 hours'));
   RAISE EXCEPTION 'Expected inactive block';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Expected inactive block' THEN RAISE; END IF; END;
 ASSERT (SELECT count(*)=2 FROM horacerta.clients),'Inactive client not duplicated or reactivated';
 UPDATE horacerta.clients SET active=true WHERE id=cid;
 INSERT INTO horacerta.clients(name) VALUES('INDUSTRIA SAO JOSE');
 BEGIN
   PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('starts_at',now()+interval '6 hours','ends_at',now()+interval '7 hours'));
   RAISE EXCEPTION 'Expected ambiguity block';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Expected ambiguity block' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('client_id',cid,'starts_at',now()+interval '6 hours','ends_at',now()+interval '7 hours'));
 PERFORM horacerta.checklist_action(worker,'save',jsonb_build_object('id',check_id,'version',1,'title','Conferência','notes','','identification','','items',jsonb_build_array(item||jsonb_build_object('outgoing',true,'outgoing_qty',1))));
 BEGIN
   PERFORM horacerta.order_action(admin,'delete_order',jsonb_build_object('id',first_id,'version',2,'confirmation','OS-000001'));
   RAISE EXCEPTION 'Expected checklist protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Expected checklist protection' THEN RAISE; END IF; END;
 ASSERT EXISTS(SELECT 1 FROM horacerta.orders WHERE id=first_id),'Conferred OS preserved';
 RAISE EXCEPTION 'QA_ORDER_WORKFLOW_OK_ROLLBACK';
END $$`);
try {
 await sql.transaction(statements.map(s=>sql.query(s.replaceAll('horacerta',schema).replaceAll('2849061701','2849061702'))));
 throw new Error('Expected rollback');
} catch(error) {
 if(error.message!=='QA_ORDER_WORKFLOW_OK_ROLLBACK')throw error;
 console.log('Isolated SQL workflow passed: auto-client, normalization, ambiguity/inactive guards, rollback, sequential numbering, edit persistence, equipment/checklists and deletion protection.');
}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length,0);
console.log('Test schema rolled back; no production numbers consumed.');
