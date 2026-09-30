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
for(const name of ['003-orders.sql','005-flexible-client.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','010-client-search.sql','011-order-lifecycle.sql','012-client-lifecycle.sql','008-checklist-actions.sql','004-order-actions.sql','002-clock-start-function.sql','002-clock-function.sql','013-points-require-order.sql']) statements.push(...(await read(name)).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
// Waiver migration is additive and repeatable; no real checklists are changed.
for (let i=0;i<2;i++) statements.push(...(await read('018-checklist-waiver.sql')).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
// Push schema and flow revision (019) are applied; 019 twice to verify it is repeatable.
statements.push(`CREATE TABLE horacerta.sessions (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES horacerta.users(id),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
statements.push(...(await read('017-push-notifications.sql')).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
for (let i=0;i<2;i++) statements.push(...(await read('019-flow-fixes.sql')).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
// Apply twice to verify the additive salary migration can be rerun safely.
for (let i=0; i<2; i++) statements.push(...(await read('014-monthly-salary.sql')).split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()));
statements.push(`DO $$
DECLARE admin uuid:=gen_random_uuid();worker uuid:=gen_random_uuid();model uuid:=gen_random_uuid();vehicle uuid:=gen_random_uuid();unused_client uuid:=gen_random_uuid();legacy_client uuid:=gen_random_uuid();other_order uuid;cid uuid;first_id uuid;second_id uuid;fresh_id uuid;result jsonb;p jsonb;first_num bigint;second_num bigint;seq_before bigint;count_before bigint;check_id uuid;item jsonb;blocked_action text;
BEGIN
 INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(admin,'QA admin','admin@example.invalid','coordinator',0),(worker,'QA worker','worker@example.invalid','employee',0);
 ASSERT (SELECT monthly_salary IS NULL AND hourly_rate=0 AND monthly_hours=220 FROM horacerta.users WHERE id=worker),'Legacy rate retained; salary not invented';
 UPDATE horacerta.users SET monthly_salary=4400 WHERE id=worker;
 ASSERT (SELECT hourly_rate=20 FROM horacerta.users WHERE id=worker),'Monthly salary divided by default 220';
 UPDATE horacerta.users SET monthly_hours=200,hourly_rate=9999 WHERE id=worker;
 ASSERT (SELECT hourly_rate=22 FROM horacerta.users WHERE id=worker),'Server computes rate even if direct rate is tampered';
 UPDATE horacerta.users SET monthly_salary=401 WHERE id=worker;
 ASSERT (SELECT hourly_rate=2.01 FROM horacerta.users WHERE id=worker),'Numeric rate rounds half-cent correctly';
 BEGIN
  UPDATE horacerta.users SET monthly_hours=0 WHERE id=worker;
  RAISE EXCEPTION 'Zero monthly hours unexpectedly allowed';
 EXCEPTION WHEN check_violation OR division_by_zero THEN NULL; END;
 BEGIN
  UPDATE horacerta.users SET monthly_salary=-1 WHERE id=worker;
  RAISE EXCEPTION 'Negative salary unexpectedly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE horacerta.users SET monthly_salary=4400,monthly_hours=220 WHERE id=worker;
 INSERT INTO horacerta.equipment_models(id,name,family) VALUES(model,'Radian QA','Laser Tracker');
 item:=jsonb_build_object('id',gen_random_uuid(),'label','Cabo','planned',1,'outgoing',false,'incoming',false,'outgoing_qty',NULL,'incoming_qty',NULL,'na',false,'notes','');
 INSERT INTO horacerta.checklist_templates(model_id,title,status,items) VALUES(model,'Lista QA','active',jsonb_build_array(item));
 p:=jsonb_build_object('title','Serviço QA','client_name','Indústria São José','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(worker),'model_ids',jsonb_build_array(model),'starts_at',now(),'ends_at',now()+interval '1 hour');
 result:=horacerta.order_action(admin,'save_order',p); first_id:=(result->>'id')::uuid;first_num:=(result->>'number')::bigint;
 ASSERT first_num=1,'First OS number';
 SELECT client_id INTO cid FROM horacerta.orders WHERE id=first_id;
 ASSERT cid IS NOT NULL AND (SELECT count(*)=1 FROM horacerta.clients),'Client auto-created';
 BEGIN
   PERFORM horacerta.clock_start(worker,now(),'Cliente avulso','Serviço avulso','');
   RAISE EXCEPTION 'Unlinked legacy start unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Selecione a OS%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.clock_action(worker,'start');
   RAISE EXCEPTION 'Unlinked action start unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Selecione a OS%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.clock_start_for_order(admin,first_id,now(),'');
   RAISE EXCEPTION 'Unassigned coordinator start unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Você não está designado%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.clock_start_for_order(worker,first_id,now()-interval '1 day','');
   RAISE EXCEPTION 'Start before OS schedule unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O ponto não pode começar%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.point_entry_order(worker,NULL,current_date,'18:00',NULL);
   RAISE EXCEPTION 'Unlinked manual entry unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Selecione a OS%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.point_entry_order(admin,first_id,current_date,'18:00',NULL);
   RAISE EXCEPTION 'Unassigned manual entry unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O colaborador não está designado%' THEN RAISE; END IF; END;
 result:=horacerta.point_entry_order(worker,first_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',NULL);
 ASSERT result->>'company'='Indústria São José' AND result->>'service'='Serviço QA' AND (result->>'order_id')::uuid=first_id,'Manual metadata derived from OS';
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
 result:=horacerta.order_action(admin,'save_order',p||jsonb_build_object('client_id',cid,'starts_at',now()+interval '6 hours','ends_at',now()+interval '7 hours')); other_order:=(result->>'id')::uuid;
 PERFORM horacerta.checklist_action(worker,'save',jsonb_build_object('id',check_id,'version',1,'title','Conferência','notes','','identification','','items',jsonb_build_array(item||jsonb_build_object('outgoing',true,'outgoing_qty',1))));
 BEGIN
   PERFORM horacerta.order_action(admin,'delete_order',jsonb_build_object('id',first_id,'version',2,'confirmation','OS-000001'));
   RAISE EXCEPTION 'Expected checklist protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Expected checklist protection' THEN RAISE; END IF; END;
 ASSERT EXISTS(SELECT 1 FROM horacerta.orders WHERE id=first_id),'Conferred OS preserved';
 INSERT INTO horacerta.vehicles(id,plate,model,odometer) VALUES(vehicle,'QAQ1234','Carro QA',1000);
 UPDATE horacerta.orders SET vehicle_id=vehicle WHERE id=first_id;
 PERFORM horacerta.order_action(worker,'start_clock',jsonb_build_object('id',first_id,'started_at',now()-interval '10 minutes','notes',''));
 ASSERT (SELECT rate=20 FROM horacerta.timers WHERE user_id=worker),'Timer snapshots salary-based rate';
 UPDATE horacerta.users SET monthly_salary=6600 WHERE id=worker;
 ASSERT (SELECT hourly_rate=30 FROM horacerta.users WHERE id=worker),'New salary updates current rate';
 ASSERT (SELECT rate=20 FROM horacerta.timers WHERE user_id=worker),'Running service retains original rate';
 PERFORM horacerta.order_action(worker,'depart',jsonb_build_object('id',first_id,'km',1000));
 BEGIN
   PERFORM horacerta.order_action(worker,'cancel',jsonb_build_object('id',first_id,'notes','Cliente cancelou'));
   RAISE EXCEPTION 'Employee cancellation unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente o coordenador%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.order_action(admin,'cancel',jsonb_build_object('id',first_id,'version',1,'notes','Cliente cancelou'));
   RAISE EXCEPTION 'Stale cancellation unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A OS foi atualizada%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.order_action(admin,'cancel',jsonb_build_object('id',first_id,'version',2,'notes',''));
   RAISE EXCEPTION 'Missing reason unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Descreva o resultado%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'cancel',jsonb_build_object('id',first_id,'version',2,'notes','Cliente cancelou no caminho'));
 ASSERT (SELECT status='Cancelada' AND version=3 AND completion='Cliente cancelou no caminho' FROM horacerta.orders WHERE id=first_id),'Cancellation with optimistic version';
 ASSERT EXISTS(SELECT 1 FROM horacerta.timers WHERE order_id=first_id),'Cancellation preserves live timer';
 ASSERT EXISTS(SELECT 1 FROM horacerta.vehicle_trips WHERE order_id=first_id AND return_km IS NULL),'Cancellation preserves pending return';
 ASSERT NOT horacerta.order_can_delete(first_id),'Execution cannot be deleted';
 ASSERT horacerta.order_pending_checklists(first_id)=1,'Started conference remains pending';
 FOREACH blocked_action IN ARRAY ARRAY['depart','begin','start_clock','finish','cancel'] LOOP
   BEGIN
     PERFORM horacerta.order_action(admin,blocked_action,jsonb_build_object('id',first_id,'notes','Must not execute','km',1000));
     RAISE EXCEPTION 'Closed operation unexpectedly allowed';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Esta OS já está encerrada%' THEN RAISE; END IF; END;
 END LOOP;
 ASSERT (SELECT count(*)=1 FROM horacerta.order_events WHERE order_id=first_id AND action='OS cancelada'),'Cancellation event only once';
 BEGIN
   PERFORM horacerta.order_action(admin,'save_vehicle',jsonb_build_object('id',vehicle,'version',2,'odometer',1000,'active',false));
   RAISE EXCEPTION 'Vehicle deactivation unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Há OS abertas ou viagem%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.order_action(worker,'return',jsonb_build_object('id',first_id,'km',999));
   RAISE EXCEPTION 'Odometer rollback unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O km deve ser igual%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(worker,'return',jsonb_build_object('id',first_id,'km',1020));
 ASSERT (SELECT odometer=1020 FROM horacerta.vehicles WHERE id=vehicle),'Return updates odometer on cancelled order';
 ASSERT (SELECT status='Cancelada' FROM horacerta.orders WHERE id=first_id),'Return does not reopen order';
 BEGIN
   PERFORM horacerta.order_action(worker,'return',jsonb_build_object('id',first_id,'km',1020));
   RAISE EXCEPTION 'Duplicate return unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Não há saída aberta%' THEN RAISE; END IF; END;
 PERFORM horacerta.clock_action(worker,'stop');
 ASSERT NOT EXISTS(SELECT 1 FROM horacerta.timers WHERE order_id=first_id),'Employee can stop cancelled order timer';
 ASSERT (SELECT bool_and(rate=20) FROM horacerta.entries WHERE order_id=first_id),'Closing timer uses original salary rate';
 UPDATE horacerta.users SET monthly_salary=8800 WHERE id=worker;
 ASSERT (SELECT bool_and(rate=20) FROM horacerta.entries WHERE order_id=first_id),'Saved points retain historical rate after another salary change';
 ASSERT EXISTS(SELECT 1 FROM horacerta.entries WHERE order_id=first_id AND user_id=worker),'Time entry retains order link';
 ASSERT EXISTS(SELECT 1 FROM horacerta.entries WHERE order_id=first_id AND client_id=cid),'Timer closure retains client link';
 BEGIN
   PERFORM horacerta.clock_start_for_order(worker,first_id,now(),'');
   RAISE EXCEPTION 'Closed OS live point unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Esta OS já está encerrada%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.point_entry_order(worker,first_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,NULL,NULL);
   RAISE EXCEPTION 'Open manual point on closed OS unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Para uma OS encerrada%' THEN RAISE; END IF; END;
 result:=horacerta.point_entry_order(worker,first_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',NULL);
 ASSERT (result->>'order_id')::uuid=first_id,'Forgotten complete point allowed on closed OS without reopening';
 BEGIN
   PERFORM horacerta.point_entry_order(worker,NULL,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',(SELECT id FROM horacerta.entries WHERE order_id=first_id LIMIT 1));
   RAISE EXCEPTION 'Existing OS point unlink unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O vínculo desta marcação%' THEN RAISE; END IF; END;
 PERFORM horacerta.checklist_action(worker,'complete',jsonb_build_object('id',check_id,'version',2,'title','Conferência','notes','','identification','','items',jsonb_build_array(item||jsonb_build_object('outgoing',true,'outgoing_qty',1,'incoming',true,'incoming_qty',1))));
 ASSERT horacerta.order_pending_checklists(first_id)=0,'Return conference clears pending';
 PERFORM horacerta.checklist_action(admin,'reopen',jsonb_build_object('id',check_id,'version',3,'reason','Corrigir observação'));
 ASSERT horacerta.order_pending_checklists(first_id)=1,'Reopened conference is pending again';
 BEGIN
   PERFORM horacerta.waive_order_checklist(worker,check_id,4,'Cliente cancelou o atendimento');
   RAISE EXCEPTION 'Employee waiver unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente o coordenador%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.waive_order_checklist(admin,check_id,4,'curto');
   RAISE EXCEPTION 'Waiver without reason unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Informe uma justificativa%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.waive_order_checklist(admin,check_id,3,'Cliente cancelou o atendimento');
   RAISE EXCEPTION 'Stale waiver unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Checklist atualizado%' THEN RAISE; END IF; END;
 item:=(SELECT items FROM horacerta.order_checklists WHERE id=check_id);
 PERFORM horacerta.waive_order_checklist(admin,check_id,4,'Cliente cancelou o atendimento');
 ASSERT horacerta.order_pending_checklists(first_id)=0,'Waiver clears cancelled checklist pending';
 ASSERT (SELECT status='waived' AND items=item AND completed_by IS NULL AND waived_by=admin AND waived_reason='Cliente cancelou o atendimento' FROM horacerta.order_checklists WHERE id=check_id),'Waiver preserves items and does not invent completion';
 ASSERT EXISTS(SELECT 1 FROM horacerta.checklist_history WHERE checklist_id=check_id AND action LIKE 'Checklist dispensado:%' AND snapshot->'before'->>'status'='open'),'Waiver audited with original snapshot';
 ASSERT NOT horacerta.order_can_delete(first_id),'Waived history cannot be erased';
 BEGIN
   PERFORM horacerta.waive_order_checklist(admin,check_id,5,'Nova tentativa de dispensa');
   RAISE EXCEPTION 'Duplicate waiver unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente checklists pendentes%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.waive_order_checklist(admin,(SELECT id FROM horacerta.order_checklists WHERE order_id=fresh_id),1,'Atendimento ainda não cancelado');
   RAISE EXCEPTION 'Active order waiver unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente checklists de OS canceladas%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'cancel',jsonb_build_object('id',fresh_id,'version',1,'notes','Cliente cancelou antes da saída'));
 ASSERT horacerta.order_pending_checklists(fresh_id)=0,'Untouched copied checklist is not pending after cancellation';
 ASSERT horacerta.order_can_delete(fresh_id),'Unused cancelled order can be deleted';
 BEGIN
   PERFORM horacerta.checklist_action(admin,'sync',jsonb_build_object('order_id',fresh_id));
   RAISE EXCEPTION 'Checklist attachment to cancelled order unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'OS encerrada%' THEN RAISE; END IF; END;
 INSERT INTO horacerta.clients(id,name) VALUES(unused_client,'Cliente descartável QA'),(legacy_client,' OUTRA  EMPRESA ');
 ASSERT NOT horacerta.client_has_history(unused_client),'Unused client eligible for deletion';
 ASSERT horacerta.client_has_history(cid),'OS and point history protects client';
 BEGIN
   PERFORM horacerta.order_action(worker,'delete_client',jsonb_build_object('id',unused_client,'confirmation','Cliente descartável QA'));
   RAISE EXCEPTION 'Employee client deletion unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente o coordenador%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM horacerta.order_action(admin,'delete_client',jsonb_build_object('id',unused_client,'confirmation','Nome errado'));
   RAISE EXCEPTION 'Wrong name deletion unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Confirme o nome atual%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'delete_client',jsonb_build_object('id',unused_client,'confirmation','Cliente descartável QA'));
 ASSERT NOT EXISTS(SELECT 1 FROM horacerta.clients WHERE id=unused_client),'Unused client deleted';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE action='Cliente excluído' AND before_value->>'id'=unused_client::text),'Client deletion audited';
 BEGIN
   PERFORM horacerta.order_action(admin,'delete_client',jsonb_build_object('id',cid,'confirmation','Indústria São José'));
   RAISE EXCEPTION 'Historical client deletion unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Este cliente tem OS%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'archive_client',jsonb_build_object('id',cid,'confirmation','Indústria São José'));
 ASSERT (SELECT NOT active FROM horacerta.clients WHERE id=cid),'Archive client';
 PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('id',other_order,'version',1,'client_id',cid,'starts_at',now()+interval '6 hours','ends_at',now()+interval '7 hours'));
 ASSERT (SELECT client_id=cid FROM horacerta.orders WHERE id=other_order),'Existing archived link may be retained when editing';
 BEGIN
   PERFORM horacerta.order_action(admin,'save_order',p||jsonb_build_object('client_id',cid,'starts_at',now()+interval '8 hours','ends_at',now()+interval '9 hours'));
   RAISE EXCEPTION 'New order with archived client unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Cliente indisponível%' THEN RAISE; END IF; END;
 PERFORM horacerta.order_action(admin,'restore_client',jsonb_build_object('id',cid,'confirmation','Indústria São José'));
 ASSERT (SELECT active FROM horacerta.clients WHERE id=cid),'Restore client';
 UPDATE horacerta.orders SET client_id=NULL WHERE id=fresh_id;
 ASSERT horacerta.client_has_history(legacy_client),'Legacy free-text OS protects same-name client';
 INSERT INTO horacerta.timers(user_id,started_at,company,service,rate,rules) SELECT admin,now()-interval '10 minutes','Cliente histórico','Serviço antigo',0,rules FROM horacerta.settings WHERE id=1;
 PERFORM horacerta.clock_action(admin,'stop');
 ASSERT EXISTS(SELECT 1 FROM horacerta.entries WHERE user_id=admin AND order_id IS NULL AND company='Cliente histórico'),'Legacy timer still closes without inventing an OS';
 result:=horacerta.point_entry_order(admin,NULL,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',(SELECT id FROM horacerta.entries WHERE user_id=admin LIMIT 1));
 ASSERT result->>'company'='Cliente histórico','Legacy entry adjustment preserves history';
 -- A manual entry with no exit must block closeout just like a live timer.
 UPDATE horacerta.orders SET status='Em andamento',model_ids='{}' WHERE id=other_order;
 INSERT INTO horacerta.entries(user_id,order_id,date,start,"end",service,status,rate,rules)
 SELECT worker,other_order,current_date,'00:01',NULL,'QA manual','Pendente',20,rules FROM horacerta.settings WHERE id=1;
 BEGIN
   PERFORM horacerta.order_action(admin,'finish',jsonb_build_object('id',other_order,'notes','Serviço finalizado'));
   RAISE EXCEPTION 'Manual open entry unexpectedly allowed closeout';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Há registros manuais sem saída%' THEN RAISE; END IF; END;
 ASSERT (SELECT status='Em andamento' FROM horacerta.orders WHERE id=other_order),'Failed closeout preserves status';
 UPDATE horacerta.entries SET deleted_at=now() WHERE order_id=other_order AND "end" IS NULL;
 PERFORM horacerta.order_action(admin,'finish',jsonb_build_object('id',other_order,'notes','Serviço finalizado'));
 ASSERT (SELECT status='Concluída' FROM horacerta.orders WHERE id=other_order),'Deleted manual entries do not block closeout';
END $$`);
// Flow revision: one automatic break per person/day, month closing, closeout without "begin", hours reminder.
statements.push(`DO $$
DECLARE boss uuid;tech uuid:=gen_random_uuid();sub uuid:=gen_random_uuid();ord uuid;future_ord uuid;e1 uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();e3 uuid:=gen_random_uuid();e4 uuid:=gen_random_uuid();r jsonb;day date:='2020-01-15';
BEGIN
 INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(tech,'QA tech','tech@example.invalid','employee',20);
 SELECT id INTO boss FROM horacerta.users WHERE role='coordinator';
 -- 10-14 + 14-20 used to deduct lunch AND dinner (60+60).
 INSERT INTO horacerta.entries(id,user_id,date,start,"end",break_minutes,break_mode,service,status,rate,rules)
 SELECT e1,tech,day,'10:00','14:00',60,'automatic','QA','Pendente',20,rules FROM horacerta.settings WHERE id=1;
 INSERT INTO horacerta.entries(id,user_id,date,start,"end",break_minutes,break_mode,service,status,rate,rules)
 SELECT e2,tech,day,'14:00','20:00',60,'automatic','QA','Aprovado',20,rules FROM horacerta.settings WHERE id=1;
 ASSERT horacerta.recompute_auto_breaks(tech,day,boss)=1,'Only the double-counted record changes';
 ASSERT (SELECT sum(break_minutes)=60 FROM horacerta.entries WHERE user_id=tech AND date=day),'One break per person/day';
 ASSERT (SELECT status='Pendente' AND version=2 FROM horacerta.entries WHERE id=e2),'Changed approved value returns to review';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE entry_id=e2 AND action='auto_break'),'Automatic change is audited';
 ASSERT horacerta.recompute_auto_breaks(tech,day,boss)=0,'Recompute is idempotent';
 -- Lunch as an unrecorded gap: the afternoon record deducts nothing; custom records are never touched.
 INSERT INTO horacerta.entries(id,user_id,date,start,"end",break_minutes,break_mode,service,status,rate,rules)
 SELECT e3,tech,day+1,'08:00','12:00',15,'custom','QA','Pendente',20,rules FROM horacerta.settings WHERE id=1;
 INSERT INTO horacerta.entries(id,user_id,date,start,"end",break_minutes,break_mode,service,status,rate,rules)
 SELECT e4,tech,day+1,'13:00','22:00',60,'automatic','QA','Pendente',20,rules FROM horacerta.settings WHERE id=1;
 PERFORM horacerta.recompute_auto_breaks(tech,day+1,boss);
 ASSERT (SELECT break_minutes FROM horacerta.entries WHERE id=e4)=0 AND (SELECT break_minutes FROM horacerta.entries WHERE id=e3)=15,'Gap covers lunch; custom preserved';
 -- Month closing.
 BEGIN PERFORM horacerta.month_action(tech,'approve',day,NULL,''); RAISE EXCEPTION 'Employee approved month';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Somente o coordenador%' THEN RAISE; END IF; END;
 BEGIN PERFORM horacerta.month_action(boss,'close',day,NULL,''); RAISE EXCEPTION 'Closed with pending entries';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%ainda não aprovados%' THEN RAISE; END IF; END;
 r:=horacerta.month_action(boss,'approve',day,tech,'');
 ASSERT (r->>'approved')::int=4,'Batch approval of the selected person';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE entry_id=e1 AND action='status'),'Batch approval audited';
 BEGIN PERFORM horacerta.month_action(boss,'close',date_trunc('month',now())::date,NULL,''); RAISE EXCEPTION 'Current month closed early';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Feche o mês somente depois%' THEN RAISE; END IF; END;
 PERFORM horacerta.month_action(boss,'close',day,NULL,'');
 ASSERT EXISTS(SELECT 1 FROM horacerta.month_closings WHERE month='2020-01-01'),'Month closed';
 BEGIN UPDATE horacerta.entries SET notes='x' WHERE id=e1; RAISE EXCEPTION 'Closed month edited';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O mês 01/2020 está fechado%' THEN RAISE; END IF; END;
 BEGIN INSERT INTO horacerta.entries(user_id,date,start,"end",service,status,rate,rules) SELECT tech,day+2,'08:00','09:00','QA','Pendente',20,rules FROM horacerta.settings WHERE id=1; RAISE EXCEPTION 'Closed month insert';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O mês 01/2020 está fechado%' THEN RAISE; END IF; END;
 BEGIN UPDATE horacerta.entries SET date='2020-02-03' WHERE id=e1; RAISE EXCEPTION 'Moved out of closed month';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O mês 01/2020 está fechado%' THEN RAISE; END IF; END;
 BEGIN PERFORM horacerta.month_action(boss,'reopen',day,NULL,'curto'); RAISE EXCEPTION 'Reopen without reason';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Informe o motivo%' THEN RAISE; END IF; END;
 PERFORM horacerta.month_action(boss,'reopen',day,NULL,'Correção solicitada pelo RH');
 UPDATE horacerta.entries SET notes='corrigido' WHERE id=e1;
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE action='Mês reaberto' AND after_value->>'reason'='Correção solicitada pelo RH'),'Reopen audited';
 -- Closeout straight from Agendada (no "begin" step), blocked before the scheduled day.
 r:=horacerta.order_action(boss,'save_order',jsonb_build_object('title','QA fluxo','client_name','Cliente fluxo QA','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(tech),'model_ids','[]'::jsonb,'starts_at',now()+interval '3 days','ends_at',now()+interval '4 days'));
 future_ord:=(r->>'id')::uuid;
 BEGIN PERFORM horacerta.order_action(boss,'finish',jsonb_build_object('id',future_ord,'notes','Feito')); RAISE EXCEPTION 'Finished before schedule';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A OS só pode ser concluída a partir do dia agendado%' THEN RAISE; END IF; END;
 r:=horacerta.order_action(boss,'save_order',jsonb_build_object('title','QA fluxo hoje','client_name','Cliente fluxo QA','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(tech),'model_ids','[]'::jsonb,'starts_at',now(),'ends_at',now()+interval '1 hour'));
 ord:=(r->>'id')::uuid;
 -- Hours reminder: tech has an active subscription and no hours in this OS.
 INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES('qa-session',tech,now()+interval '1 day');
 INSERT INTO horacerta.push_subscriptions(id,user_id,session_hash,endpoint,p256dh,auth) VALUES(sub,tech,'qa-session','https://push.example.invalid/qa','k','a');
 DELETE FROM horacerta.push_jobs;
 PERFORM horacerta.order_action(boss,'finish',jsonb_build_object('id',ord,'notes','Concluída sem etapa de início'));
 ASSERT (SELECT status='Concluída' FROM horacerta.orders WHERE id=ord),'Scheduled OS concluded without begin';
 ASSERT (SELECT count(*)=1 FROM horacerta.push_jobs WHERE order_id=ord AND user_id=tech AND kind='hours'),'Hours reminder queued';
 ASSERT horacerta.queue_hours_reminder(ord)=0,'Reminder not duplicated';
 DELETE FROM horacerta.push_jobs;
 INSERT INTO horacerta.entries(user_id,order_id,date,start,"end",service,status,rate,rules)
 SELECT tech,ord,current_date,'00:00','00:30','QA','Pendente',20,rules FROM horacerta.settings WHERE id=1;
 ASSERT horacerta.queue_hours_reminder(ord)=0,'No reminder once hours exist';
 -- Cancelled after the team left: travel counts, so a reminder is due. Cancelled before starting: none.
 DELETE FROM horacerta.push_jobs;
 r:=horacerta.order_action(boss,'save_order',jsonb_build_object('title','QA cancelada em campo','client_name','Cliente fluxo QA','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(tech),'model_ids','[]'::jsonb,'starts_at',now(),'ends_at',now()+interval '1 hour'));
 ord:=(r->>'id')::uuid;
 DELETE FROM horacerta.push_jobs;
 PERFORM horacerta.order_action(boss,'cancel',jsonb_build_object('id',ord,'notes','Cliente ausente'));
 ASSERT NOT EXISTS(SELECT 1 FROM horacerta.push_jobs WHERE order_id=ord AND kind='hours'),'No reminder when nobody started';
 r:=horacerta.order_action(boss,'save_order',jsonb_build_object('title','QA cancelada em campo 2','client_name','Cliente fluxo QA','client_id',NULL,'address','','contact','','phone','','place_id','','vehicle_id',NULL,'equipment','','instructions','','priority','Normal','members',jsonb_build_array(tech),'model_ids','[]'::jsonb,'starts_at',now(),'ends_at',now()+interval '1 hour'));
 ord:=(r->>'id')::uuid;
 DELETE FROM horacerta.push_jobs;
 UPDATE horacerta.orders SET status='Em andamento' WHERE id=ord;
 PERFORM horacerta.order_action(boss,'cancel',jsonb_build_object('id',ord,'notes','Cliente cancelou no caminho'));
 ASSERT (SELECT count(*)=1 FROM horacerta.push_jobs WHERE order_id=ord AND kind='hours'),'Reminder when cancelled in the field';
 RAISE EXCEPTION 'QA_ORDER_WORKFLOW_OK_ROLLBACK';
END $$`);
try {
 await sql.transaction(statements.map(s=>sql.query(s.replaceAll('horacerta',schema).replaceAll('2849061701','2849061702'))));
 throw new Error('Expected rollback');
} catch(error) {
 if(error.message!=='QA_ORDER_WORKFLOW_OK_ROLLBACK')throw error;
 console.log('Isolated SQL workflow passed: clients, sequence, equipment, deletion protection, cancellation in transit, permissions, stale version, reason, duplicate actions, return odometer, timer closure, checklist completion/reopen, pending cleanup, client delete/archive/restore, legacy history protection, retention of archived links, one automatic break per day, month approval/closing/reopening, closeout without a begin step and hours reminders.');
}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length,0);
console.log('Test schema rolled back; no production numbers consumed.');
