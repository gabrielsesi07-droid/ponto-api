// Executa somente em um banco de teste informado explicitamente. Todo o schema é revertido.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isolatedSql } from './isolated-sql-runtime.mjs';
const sql = await isolatedSql();
const schema = 'qa_dates_' + randomUUID().replaceAll('-', '');
const source = await readFile(new URL('../sql/021-order-scheduling.sql', import.meta.url), 'utf8');
const statements = `
CREATE SCHEMA horacerta;
CREATE TABLE horacerta.users(id uuid PRIMARY KEY,active boolean DEFAULT true,role text);
CREATE TABLE horacerta.orders(id uuid PRIMARY KEY,number integer,status text,starts_at timestamptz,ends_at timestamptz,members uuid[],vehicle_id uuid,version integer DEFAULT 1);
CREATE TABLE horacerta.entries(id uuid PRIMARY KEY,order_id uuid,date date,work_type text DEFAULT 'work',deleted_at timestamptz);
CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY,order_id uuid,started_at timestamptz);
CREATE TABLE horacerta.vehicle_trips(id uuid PRIMARY KEY,order_id uuid,vehicle_id uuid,departure_km integer,return_km integer,departed_at timestamptz,returned_at timestamptz,departed_by uuid,returned_by uuid);
CREATE TABLE horacerta.audit(actor_id uuid,action text,before_value jsonb,after_value jsonb);
CREATE TABLE horacerta.order_events(order_id uuid,actor_id uuid,action text,detail text);
`.split(';').filter(statement => statement.trim());
// Reaplicação não altera os dados nem depende de uma nova versão das tabelas.
for (let i = 0; i < 2; i++) statements.push(...source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()));
statements.push(`CREATE FUNCTION horacerta.expect_error(kind text, actor uuid, p jsonb, pattern text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
  IF kind='schedule' THEN PERFORM horacerta.order_reschedule(actor,p); ELSE PERFORM horacerta.trip_update_dates(actor,p); END IF;
  RAISE EXCEPTION 'Expected rejection did not happen';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE pattern THEN RAISE; END IF;
 END $$`);
statements.push(`DO $$
DECLARE
 boss uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); vehicle uuid:=gen_random_uuid(); ord uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 trip_id uuid:=gen_random_uuid(); trip_after uuid:=gen_random_uuid(); day timestamptz:=date_trunc('day',now())-interval '10 days';
 p jsonb; r jsonb; trip_payload jsonb;
BEGIN
 INSERT INTO horacerta.users(id,role) VALUES(boss,'coordinator'),(worker,'employee');
 INSERT INTO horacerta.orders(id,number,status,starts_at,ends_at,members,vehicle_id) VALUES
  (ord,1,'Em andamento',day+interval '8 hours',day+interval '18 hours',ARRAY[worker],vehicle),
  (other,2,'Agendada',day+interval '3 days',day+interval '4 days',ARRAY[worker],vehicle);
 p:=jsonb_build_object('id',ord,'version',1,'starts_at',day+interval '7 hours','ends_at',day+interval '19 hours','reason','Cliente alterou a data da visita');
 PERFORM horacerta.expect_error('schedule',worker,p,'Somente o coordenador%');
 PERFORM horacerta.expect_error('schedule',boss,p||jsonb_build_object('reason','curto'),'Explique a alteração%');
 PERFORM horacerta.expect_error('schedule',boss,p||jsonb_build_object('ends_at',day),'A previsão de término%');
 PERFORM horacerta.expect_error('schedule',boss,p||jsonb_build_object('starts_at',day+interval '3 days','ends_at',day+interval '5 days'),'Um colaborador ou veículo%');
 r:=horacerta.order_reschedule(boss,p);
 ASSERT r->>'version'='2','Reprogramação incrementa versão';
 ASSERT (SELECT status='Em andamento' AND starts_at=day+interval '7 hours' AND ends_at=day+interval '19 hours' FROM horacerta.orders WHERE id=ord),'Reprogramação em andamento preserva situação';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE action='Previsão da OS alterada' AND before_value->>'version'='1' AND after_value->>'version'='2' AND after_value->>'reason'=p->>'reason'),'Reprogramação auditada antes/depois/motivo';
 PERFORM horacerta.expect_error('schedule',boss,p,'A OS foi atualizada%');
 p:=p||jsonb_build_object('version',2);
 PERFORM horacerta.expect_error('schedule',boss,p,'Altere o início%');
 INSERT INTO horacerta.entries(id,order_id,date) VALUES(gen_random_uuid(),ord,(day AT TIME ZONE 'America/Sao_Paulo')::date);
 PERFORM horacerta.expect_error('schedule',boss,p||jsonb_build_object('starts_at',day+interval '1 day','ends_at',day+interval '2 days'),'O início previsto não pode%');
 UPDATE horacerta.orders SET status='Concluída' WHERE id=ord;
 PERFORM horacerta.expect_error('schedule',boss,p,'Somente OS abertas%');
 -- Correções permanecem disponíveis no histórico, mantendo situação e quilometragem da viagem.
 INSERT INTO horacerta.vehicle_trips VALUES(trip_id,ord,vehicle,100,150,day+interval '8 hours',day+interval '18 hours',worker,worker);
 INSERT INTO horacerta.vehicle_trips VALUES(trip_after,other,vehicle,150,NULL,day+interval '3 days',NULL,worker,NULL);
 trip_payload:=jsonb_build_object('id',ord,'trip_id',trip_id,'expected_departed_at',day+interval '8 hours','expected_returned_at',day+interval '18 hours','departed_at',day+interval '7 hours','returned_at',day+interval '19 hours','reason','Motorista confirmou as datas corretas');
 PERFORM horacerta.expect_error('trip',worker,trip_payload,'Somente o coordenador%');
 PERFORM horacerta.expect_error('trip',boss,trip_payload||jsonb_build_object('id',other),'Viagem não encontrada%');
 PERFORM horacerta.expect_error('trip',boss,trip_payload||jsonb_build_object('departed_at',now()+interval '1 hour'),'Informe quando a viagem%');
 PERFORM horacerta.expect_error('trip',boss,trip_payload||jsonb_build_object('returned_at',NULL),'A correção de data deve%');
 PERFORM horacerta.expect_error('trip',boss,trip_payload||jsonb_build_object('returned_at',day),'O retorno não pode%');
 PERFORM horacerta.expect_error('trip',boss,trip_payload||jsonb_build_object('returned_at',day+interval '4 days'),'Essas datas conflitam%');
 PERFORM horacerta.trip_update_dates(boss,trip_payload);
 ASSERT (SELECT departure_km=100 AND return_km=150 AND departed_by=worker AND returned_by=worker AND departed_at=day+interval '7 hours' AND returned_at=day+interval '19 hours' FROM horacerta.vehicle_trips WHERE id=trip_id),'Correção preserva painel e responsáveis';
 ASSERT EXISTS(SELECT 1 FROM horacerta.audit WHERE action='Datas de viagem corrigidas' AND before_value->>'departed_at' IS DISTINCT FROM after_value->>'departed_at' AND after_value->>'reason'=trip_payload->>'reason'),'Viagem tem auditoria antes/depois/motivo';
 ASSERT EXISTS(SELECT 1 FROM horacerta.order_events WHERE order_id=ord AND action='Datas de viagem corrigidas' AND detail LIKE '%Motorista confirmou%'),'Correção aparece no histórico da OS';
 PERFORM horacerta.expect_error('trip',boss,trip_payload,'A viagem foi atualizada%');
 trip_payload:=jsonb_build_object('id',other,'trip_id',trip_after,'expected_departed_at',day+interval '3 days','expected_returned_at',NULL,'departed_at',day+interval '2 days','returned_at',NULL,'reason','Saída foi registrada no dia seguinte');
 PERFORM horacerta.trip_update_dates(boss,trip_payload);
 ASSERT (SELECT return_km IS NULL AND returned_at IS NULL FROM horacerta.vehicle_trips WHERE id=trip_after),'Viagem aberta continua aberta';
 trip_payload:=trip_payload||jsonb_build_object('expected_departed_at',day+interval '2 days','departed_at',day+interval '2 hours');
 PERFORM horacerta.expect_error('trip',boss,trip_payload,'Essas datas conflitam%');
 RAISE EXCEPTION 'QA_DATE_CHANGES_OK_ROLLBACK';
END $$`);
try {
  await sql.transaction(statements.map(statement => sql.query(statement.replaceAll('horacerta', schema).replaceAll('2849061701', '2849061703'))));
  throw new Error('Expected rollback');
} catch (error) {
  if (error.message !== 'QA_DATE_CHANGES_OK_ROLLBACK') throw error;
}
assert.equal((await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`).length, 0);
console.log('Datas da OS/viagem: permissões, período, concorrência, conflitos de reserva/viagem, auditoria e preservação do histórico verificados. Schema de teste revertido.');
await sql.close?.();
