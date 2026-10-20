// Explicit test database only. Every object and fixture lives in one rolled-back transaction.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isolatedSql } from './isolated-sql-runtime.mjs';
const sql = await isolatedSql();
const schema = 'qa_work_rules_' + randomUUID().replaceAll('-', '');
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8');
const split = source => source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim());
const statements = (await read('001-schema.sql')).split(';').filter(s => s.trim());
statements.push(`CREATE TABLE horacerta.orders(id uuid PRIMARY KEY,members uuid[] NOT NULL,status text NOT NULL)`);
statements.push(`CREATE TABLE horacerta.order_events(order_id uuid,actor_id uuid,action text,detail text)`);
statements.push(`CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id),rate numeric NOT NULL,rules jsonb NOT NULL,started_at timestamptz NOT NULL)`);
statements.push(`CREATE TABLE horacerta.schema_migrations(name text PRIMARY KEY)`);
statements.push(`ALTER TABLE horacerta.entries ADD COLUMN order_id uuid REFERENCES horacerta.orders(id)`);
// Use the real prerequisite break/month guards, without unrelated push/order functions.
const flow = split(await read('019-flow-fixes.sql'));
const guardEnd = flow.findIndex(s => s.includes('CREATE OR REPLACE FUNCTION horacerta.month_action('));
assert.ok(guardEnd > 0 && flow[guardEnd - 1].includes('entries_closed_month'));
statements.push(...flow.slice(0, guardEnd));
statements.push(`CREATE TABLE horacerta.qa_snapshots(name text PRIMARY KEY,value jsonb NOT NULL)`);
statements.push(`DO $$
DECLARE d date:=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')-interval '1 month')::date; legacy jsonb;
BEGIN
 SELECT rules INTO legacy FROM horacerta.settings WHERE id=1;
 INSERT INTO horacerta.users(id,name,email,role,hourly_rate,active) VALUES
 ('10000000-0000-0000-0000-000000000001','Supervisor QA','boss@example.invalid','coordinator',40,true),
 ('10000000-0000-0000-0000-000000000002','Worker QA','worker@example.invalid','employee',22,true),
 ('10000000-0000-0000-0000-000000000003','Other QA','other@example.invalid','employee',25,true),
 ('10000000-0000-0000-0000-000000000004','Inactive QA','inactive@example.invalid','employee',10,false);
 INSERT INTO horacerta.orders VALUES('20000000-0000-0000-0000-000000000001',ARRAY['10000000-0000-0000-0000-000000000002'::uuid],'Em andamento');
 INSERT INTO horacerta.entries(id,user_id,order_id,date,start,"end",break_minutes,service,status,rate,rules) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',d+1,'07:00','18:00',60,'Legado','Pendente',30,legacy),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',NULL,d+2,'08:00','17:00',60,'Sem tarifa','Pendente',0,legacy),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003',NULL,d+3,'08:00','17:00',60,'Excluído','Pendente',0,legacy),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002',NULL,d-1,'08:00','17:00',60,'Outro mês','Aprovado',40,legacy);
 UPDATE horacerta.entries SET deleted_at=now() WHERE id='30000000-0000-0000-0000-000000000003';
 INSERT INTO horacerta.timers VALUES('10000000-0000-0000-0000-000000000002',31,legacy,now()-interval '1 hour');
 INSERT INTO horacerta.qa_snapshots SELECT 'entries',jsonb_object_agg(id::text,to_jsonb(e)) FROM horacerta.entries e;
 INSERT INTO horacerta.qa_snapshots SELECT 'timer',to_jsonb(t) FROM horacerta.timers t;
END $$`);

const migration = split(await read('024-work-rules.sql'));
statements.push(...migration);
statements.push(`DO $$
DECLARE original jsonb; current_rows jsonb; current_rules jsonb;
BEGIN
 SELECT value INTO original FROM horacerta.qa_snapshots WHERE name='entries';
 SELECT jsonb_object_agg(id::text,to_jsonb(e)-'work_type'-'shift'-'break_start') INTO current_rows FROM horacerta.entries e;
 ASSERT original=current_rows,'Migration 024 preserves all existing entry columns/snapshots';
 ASSERT (SELECT value=(SELECT to_jsonb(t) FROM horacerta.timers t) FROM horacerta.qa_snapshots WHERE name='timer'),'Migration preserves active timer rules/rate';
 SELECT rules INTO current_rules FROM horacerta.settings WHERE id=1;
 ASSERT current_rules->>'calculation_version'='2' AND current_rules->>'daily_minutes'='480' AND current_rules->>'approval_required'='false' AND current_rules->>'travel_mode'='daily','Migration enables v2 and automatic approval';
 ASSERT current_rules#>>'{day_policies,saturday,normal_minutes}'='480' AND current_rules#>>'{day_policies,saturday,tiers,0,up_to_minutes}'='180' AND current_rules#>>'{day_policies,saturday,tiers,0,bonus}'='60' AND current_rules#>>'{day_policies,saturday,tiers,1,bonus}'='100','Saturday quota and progressive tiers';
 ASSERT current_rules#>>'{day_policies,sunday,normal_minutes}'='0' AND current_rules#>>'{day_policies,sunday,tiers,0,bonus}'='100','Sunday is entirely extra';
 ASSERT (SELECT count(*)=1 FROM horacerta.schema_migrations WHERE name='024-work-rules'),'Migration marker recorded once';
 UPDATE horacerta.settings SET rules=jsonb_set(rules,'{day_policies,weekday,tiers,0,bonus}','77') WHERE id=1;
 INSERT INTO horacerta.qa_snapshots SELECT 'customized_settings',rules FROM horacerta.settings WHERE id=1;
END $$`);
// Reapplication after a real settings change must not reset it or historical records.
statements.push(...migration);
statements.push(`DO $$ BEGIN
 ASSERT (SELECT rules=(SELECT value FROM horacerta.qa_snapshots WHERE name='customized_settings') FROM horacerta.settings WHERE id=1),'Idempotent migration preserves customized v2 settings';
 ASSERT (SELECT count(*)=1 FROM horacerta.schema_migrations WHERE name='024-work-rules'),'Idempotent migration keeps one marker';
 ASSERT (SELECT value=(SELECT jsonb_object_agg(id::text,to_jsonb(e)-'work_type'-'shift'-'break_start') FROM horacerta.entries e) FROM horacerta.qa_snapshots WHERE name='entries'),'Reapplication preserves old points';
END $$`);

// A missing expected rejection is always a failure, never swallowed by this helper.
statements.push(`CREATE FUNCTION horacerta.expect_error(statement text, pattern text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'QA_EXPECTED_REJECTION_NOT_RAISED: %',statement;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE pattern THEN RAISE; END IF;
 END $$`);
statements.push(`DO $$
DECLARE
 boss uuid:='10000000-0000-0000-0000-000000000001'; worker uuid:='10000000-0000-0000-0000-000000000002'; other uuid:='10000000-0000-0000-0000-000000000003'; inactive uuid:='10000000-0000-0000-0000-000000000004';
 ord uuid:='20000000-0000-0000-0000-000000000001'; legacy_id uuid:='30000000-0000-0000-0000-000000000001'; missing_id uuid:='30000000-0000-0000-0000-000000000002';
 new_id uuid:=gen_random_uuid(); new_travel uuid:=gen_random_uuid();
 d date:=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')-interval '1 month')::date;
 local_today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 shift_a jsonb:='{"start":"08:00","end":"17:00","break_start":"12:00","break_end":"13:00"}';
 shift_b jsonb:='{"start":"09:00","end":"18:00","break_start":"12:00","break_end":"13:00"}';
 rules_v2 jsonb; legacy jsonb; ctx jsonb; result jsonb; versions jsonb; rates jsonb; wrong jsonb; saved jsonb; n integer;
 reason text:='Correção conferida com a equipe';
BEGIN
 SELECT rules INTO rules_v2 FROM horacerta.settings WHERE id=1;
 SELECT rules INTO legacy FROM horacerta.entries WHERE id=legacy_id;
 -- No implicit shift for a v2 work entry; daily travel deliberately needs no destination shift.
 ASSERT horacerta.point_entry_shift(worker,ord,'work',legacy,NULL) IS NULL,'Legacy points do not acquire a shift';
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_shift(%L,%L,%L,%L::jsonb,NULL)',worker,ord,'work',rules_v2),'Confirme seu turno%');
 ASSERT horacerta.point_entry_shift(worker,ord,'travel',rules_v2,NULL) IS NULL,'Travel daily needs no work shift';
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_shift(%L,%L,%L,%L::jsonb,NULL)',worker,ord,'travel',rules_v2||'{"travel_mode":"shift"}'),'Confirme seu turno%');
 -- Personal lock: worker cannot configure another person, reset their lock, or use an invalid shift.
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,NULL,NULL)',other,ord,worker,'work',shift_a),'Confirme somente seu próprio turno%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,NULL,NULL)',boss,ord,other,'work',shift_a),'Colaborador não designado%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,NULL,NULL)',inactive,ord,inactive,'work',shift_a),'Conta indisponível%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,NULL,NULL)',worker,ord,worker,'work',shift_a||'{"end":"07:00"}'),'Confira o turno%');
 result:=horacerta.order_shift_save(worker,ord,worker,'work',shift_a,NULL,NULL);
 ASSERT result->>'version'='1','Employee locks own shift once';
 ASSERT horacerta.point_entry_shift(worker,ord,'work',rules_v2,NULL)=shift_a,'Work resolves only confirmed personal shift';
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,1,%L)',worker,ord,worker,'work',shift_b,reason),'Seu turno já está confirmado%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,0,%L)',boss,ord,worker,'work',shift_b,reason),'O turno já foi alterado%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.order_shift_save(%L,%L,%L,%L,%L::jsonb,1,%L)',boss,ord,worker,'work',shift_b,'curto'),'Informe o motivo%');
 -- Actual context decisions used by INSERT/UPDATE: ownership, immutable rate/rules, automatic status.
 ctx:=horacerta.point_entry_context(worker,worker,NULL,d+4,'07:00','18:00',60,'custom','12:00');
 ASSERT ctx->'rules'=rules_v2 AND ctx->>'rate'='22.00' AND ctx->>'status'='Aprovado','New point snapshots v2/current rate and is automatically approved';
 INSERT INTO horacerta.entries(id,user_id,order_id,date,start,"end",break_minutes,break_mode,break_start,work_type,shift,service,status,rate,rules)
 VALUES(new_id,worker,ord,d+4,'07:00','18:00',60,'custom','12:00','work',horacerta.point_entry_shift(worker,ord,'work',ctx->'rules',NULL),'Novo',ctx->>'status',(ctx->>'rate')::numeric,ctx->'rules');
 ctx:=horacerta.point_entry_context(worker,worker,new_id,d+4,'07:00','18:30',60,'custom','12:00');
 UPDATE horacerta.entries SET "end"='18:30',status=ctx->>'status',version=version+1 WHERE id=new_id;
 ASSERT (SELECT status='Aprovado' AND version=2 AND "end"='18:30' FROM horacerta.entries WHERE id=new_id),'Employee edits approved point while month is open';
 ctx:=horacerta.point_entry_context(boss,worker,legacy_id,d+1,'07:00','18:00',60,'custom',NULL);
 ASSERT ctx->'rules'=legacy AND (ctx->>'rate')::numeric=30,'Existing point retains legacy rule/rate snapshots despite new settings';
 ASSERT horacerta.point_entry_context(worker,worker,NULL,d+5,'07:00',NULL,0,'custom',NULL)->>'status'='Pendente','Incomplete point cannot be autoapproved';
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,NULL,%L,%L,%L,0,%L,NULL)',boss,worker,d+5,'07:00','18:00','custom'),'Novas marcações pertencem%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,%L,%L,%L,%L,60,%L,%L)',other,worker,new_id,d+4,'07:00','18:00','custom','12:00'),'Novas marcações pertencem%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,NULL,%L,%L,%L,60,%L,NULL)',worker,worker,d+5,'07:00','18:00','custom'),'Informe o início real do intervalo%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,NULL,%L,%L,%L,60,%L,%L)',worker,worker,d+5,'07:00','18:00','custom','17:30'),'Informe o início real do intervalo%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,NULL,%L,%L,%L,180,%L,%L)',worker,worker,d+5,'21:00','23:00','custom','22:00'),'Informe o início real do intervalo%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,NULL,%L,%L,%L,0,%L,NULL)',worker,worker,local_today+1,'07:00','18:00','custom'),'Informe uma data válida%');
 UPDATE horacerta.users SET can_edit=false WHERE id=worker;
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,%L,%L,%L,%L,60,%L,%L)',worker,worker,new_id,d+4,'07:00','18:00','custom','12:00'),'Este lançamento não pode%');
 UPDATE horacerta.users SET can_edit=true WHERE id=worker;
 UPDATE horacerta.settings SET rules=rules||'{"approval_required":true}' WHERE id=1;
 PERFORM horacerta.expect_error(format('SELECT horacerta.point_entry_context(%L,%L,%L,%L,%L,%L,60,%L,%L)',worker,worker,new_id,d+4,'07:00','18:00','custom','12:00'),'Este lançamento não pode%');
 UPDATE horacerta.settings SET rules=rules_v2 WHERE id=1;
 -- Fixing a confirmed shift requires a version/reason and never rewrites existing point snapshots.
 result:=horacerta.order_shift_save(boss,ord,worker,'work',shift_b,1,reason);
 ASSERT result->>'version'='2','Supervisor correction increments shift version';
 ASSERT horacerta.point_entry_shift(worker,ord,'work',rules_v2,new_id)=shift_a,'Existing entry keeps original shift after correction';
 ASSERT horacerta.point_entry_shift(worker,ord,'work',rules_v2,NULL)=shift_b,'New entries receive corrected shift';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE action='Turno da OS' AND before_value->'shift'=shift_a AND after_value->'shift'=shift_b AND after_value->>'version'='2' AND after_value->>'reason'=reason),'Shift audit has before/after, version and reason';
 ASSERT EXISTS(SELECT 1 FROM horacerta.order_events WHERE order_id=ord AND detail LIKE '%'||reason||'%'),'Shift correction appears in OS history';
 INSERT INTO horacerta.entries(id,user_id,order_id,date,start,"end",break_minutes,service,status,rate,rules,work_type,shift)
 VALUES(new_travel,worker,ord,d+5,'05:00','09:00',0,'Viagem','Aprovado',22,rules_v2,'travel',horacerta.point_entry_shift(worker,ord,'travel',rules_v2,NULL));
 ASSERT (SELECT shift IS NULL FROM horacerta.entries WHERE id=new_travel),'Daily travel persisted without work shift';
 -- Closing guards protect actual writes, even though the context resolver only supplies metadata.
 INSERT INTO horacerta.month_closings(month,closed_by) VALUES(d,boss);
 PERFORM horacerta.expect_error(format('UPDATE horacerta.entries SET notes=%L WHERE id=%L','Bloqueado',new_id),'O mês % está fechado%');
 PERFORM horacerta.expect_error(format('DELETE FROM horacerta.entries WHERE id=%L',new_id),'O mês % está fechado%');
 PERFORM horacerta.expect_error(format('INSERT INTO horacerta.entries(user_id,date,start,"end",service,status,rate,rules) VALUES(%L,%L,%L,%L,%L,%L,22,%L::jsonb)',worker,d+6,'08:00','17:00','Bloqueado','Aprovado',rules_v2),'O mês % está fechado%');
 SELECT jsonb_object_agg(id::text,version) INTO versions FROM horacerta.entries WHERE date>=d AND date<d+interval '1 month' AND deleted_at IS NULL;
 SELECT jsonb_object_agg(id::text,hourly_rate) INTO rates FROM horacerta.users;
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,rules_v2,versions,rates,reason),'Reabra o mês%');
 DELETE FROM horacerta.month_closings WHERE month=d;
 -- Every stale preview rejects atomically, without modifying entries or creating audits.
 SELECT count(*) INTO n FROM horacerta.audit;
 SELECT jsonb_object_agg(id::text,to_jsonb(e)) INTO saved FROM horacerta.entries e;
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',worker,d,rules_v2,versions,rates,reason),'Somente o coordenador%');
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,rules_v2,versions,rates,'curto'),'Informe o motivo%');
 wrong:=rules_v2||'{"daily_minutes":481}';
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,wrong,versions,rates,reason),'As regras mudaram%');
 wrong:=versions||jsonb_build_object(legacy_id::text,999);
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,rules_v2,wrong,rates,reason),'Os registros mudaram%');
 wrong:=rates||jsonb_build_object(worker::text,999);
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,rules_v2,versions,wrong,reason),'Os valores-hora mudaram%');
 ASSERT n=(SELECT count(*) FROM horacerta.audit) AND saved=(SELECT jsonb_object_agg(id::text,to_jsonb(e)) FROM horacerta.entries e),'Rejected recalculations are atomic';
 -- Explicit recalc is the only operation allowed to replace legacy snapshots.
 result:=horacerta.recalculate_entries(boss,d,NULL,rules_v2,versions,rates,true,reason);
 ASSERT result->>'updated'='4','Recalc includes all four active records in target month';
 ASSERT (SELECT rules=rules_v2 AND rate=30 AND status='Aprovado' AND version=2 FROM horacerta.entries WHERE id=legacy_id),'Explicit recalc replaces old rules, preserves nonzero historical rate and increments version';
 ASSERT (SELECT rules=rules_v2 AND rate=25 AND status='Aprovado' AND version=2 FROM horacerta.entries WHERE id=missing_id),'Optional fill uses previewed current rate only for zero historical rate';
 ASSERT (SELECT rules=legacy AND rate=0 AND version=1 FROM horacerta.entries WHERE id='30000000-0000-0000-0000-000000000003'),'Deleted entries are excluded';
 ASSERT (SELECT rules=legacy AND rate=40 AND version=1 FROM horacerta.entries WHERE id='30000000-0000-0000-0000-000000000004'),'Other months are excluded';
 ASSERT (SELECT shift=shift_a AND version=3 FROM horacerta.entries WHERE id=new_id),'Recalculation preserves historical shift snapshot by default';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE entry_id=legacy_id AND action='Recálculo de horas' AND before_value->'rules'=legacy AND after_value->'rules'=rules_v2 AND before_value->>'rate'=after_value->>'rate' AND after_value->>'reason'=reason),'Recalc audit contains exact before/after rules/rate/reason';
 ASSERT (SELECT count(*)=4 FROM horacerta.audit WHERE action='Recálculo de horas'),'Every recalculated entry has an audit';
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,NULL,%L::jsonb,%L::jsonb,%L::jsonb,true,%L)',boss,d,rules_v2,versions,rates,reason),'Os registros mudaram%');
 -- Person-scoped recalc neither requires nor updates other employees; fill=false retains missing rates.
 UPDATE horacerta.entries SET rate=0 WHERE id=missing_id;
 SELECT jsonb_object_agg(id::text,version) INTO versions FROM horacerta.entries WHERE date>=d AND date<d+interval '1 month' AND deleted_at IS NULL AND user_id=other;
 result:=horacerta.recalculate_entries(boss,d,other,rules_v2,versions,'{}',false,reason);
 ASSERT result->>'updated'='1' AND (SELECT rate=0 AND version=3 FROM horacerta.entries WHERE id=missing_id),'Scoped recalc respects fill=false and only selected employee';
 ASSERT (SELECT version=2 FROM horacerta.entries WHERE id=legacy_id),'Scoped recalc leaves other people untouched';
 -- Explicit option replaces confirmed shifts only after checking their previewed values.
 SELECT jsonb_object_agg(id::text,version) INTO versions FROM horacerta.entries WHERE date>=d AND date<d+interval '1 month' AND deleted_at IS NULL AND user_id=worker;
 SELECT jsonb_object_agg(e.id::text,s.shift) INTO saved FROM horacerta.entries e JOIN horacerta.order_shifts s ON s.order_id=e.order_id AND s.user_id=e.user_id AND s.work_type=e.work_type WHERE e.date>=d AND e.date<d+interval '1 month' AND e.deleted_at IS NULL AND e.user_id=worker;
 PERFORM horacerta.expect_error(format('SELECT horacerta.recalculate_entries(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb,false,%L,true,%L::jsonb)',boss,d,worker,rules_v2,versions,rates,reason,'{}'),'Os turnos mudaram%');
 result:=horacerta.recalculate_entries(boss,d,worker,rules_v2,versions,rates,false,reason,true,saved);
 ASSERT (SELECT shift=shift_b FROM horacerta.entries WHERE id=new_id),'Explicit shift option applies previewed corrected shift';
 RAISE EXCEPTION 'QA_WORK_RULES_OK_ROLLBACK';
END $$`);

try {
  await sql.transaction(statements.map(statement => sql.query(statement.replaceAll('horacerta', schema).replaceAll('2849061701', '2849061704'))));
  throw new Error('Expected rollback sentinel');
} catch (error) {
  if (error.message !== 'QA_WORK_RULES_OK_ROLLBACK') throw error;
}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length, 0);
console.log('Regras v2: migração idempotente, snapshots, turnos, permissões, aprovação, mês fechado, recálculo concorrente e auditoria verificados. Schema de teste revertido.');
await sql.close?.();
