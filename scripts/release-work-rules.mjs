// Production cutover: prepare schema, publish the application, then activate with an audit backup.
import { neon } from '@neondatabase/serverless';
import { releaseMode, workRulesReleaseStatements } from './work-rules-release-plan.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--prepare', '--activate'].includes(arg) && !arg.startsWith('--actor=') && !arg.startsWith('--reason=')))
  throw new Error('Use --prepare ou --activate --actor=<UUID do coordenador> --reason="Motivo da ativação".');
const mode = releaseMode(args, 'prepare');
const actor = args.find(arg => arg.startsWith('--actor='))?.slice(8);
const reason = args.find(arg => arg.startsWith('--reason='))?.slice(9).trim();
if (mode === 'activate' && (!actor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor) || !reason || reason.length < 10 || reason.length > 1000))
  throw new Error('A ativação exige --actor=<UUID do coordenador ativo> e --reason com 10 a 1000 caracteres.');
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no ambiente do servidor.');
const sql = neon(process.env.DATABASE_URL);
const statements = await workRulesReleaseStatements(mode, true);

if (mode === 'prepare') {
  await sql.transaction([sql`SELECT pg_advisory_xact_lock(2849061701)`, ...statements.map(s => sql.query(s))]);
  console.log('Estruturas 024/025 preparadas na mesma transação. Regras atuais preservadas. Publique a aplicação antes de ativar.');
} else {
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(2849061701)`,
    sql`CREATE TEMP TABLE release_work_rules_backup(rules jsonb NOT NULL,actor_id uuid NOT NULL) ON COMMIT DROP`,
    sql`INSERT INTO release_work_rules_backup SELECT s.rules,u.id FROM horacerta.settings s CROSS JOIN horacerta.users u
      WHERE s.id=1 AND u.id=${actor}::uuid AND u.active AND u.role='coordinator' FOR UPDATE OF s,u`,
    sql.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM release_work_rules_backup) THEN RAISE EXCEPTION 'Informe o UUID de um coordenador ativo e confira a configuração existente.'; END IF;
      IF to_regclass('horacerta.order_shifts') IS NULL
        OR to_regprocedure('horacerta.point_entry_context(uuid,uuid,uuid,date,time without time zone,time without time zone,integer,text,time without time zone)') IS NULL
        OR to_regprocedure('horacerta.point_entry_order_for_type(uuid,uuid,date,time without time zone,uuid,text)') IS NULL
        OR to_regprocedure('horacerta.order_reschedule(uuid,jsonb)') IS NULL
        OR to_regprocedure('horacerta.trip_update_dates(uuid,jsonb)') IS NULL
      THEN RAISE EXCEPTION 'Prepare as migrações 024/025 antes de ativar as regras.'; END IF;
    END $$`),
    ...statements.map(s => sql.query(s)),
    sql.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM horacerta.settings WHERE id=1 AND rules->>'calculation_version'='2')
      THEN RAISE EXCEPTION 'As regras não foram ativadas; confira se houve reversão anterior da configuração.'; END IF;
    END $$`),
    sql`INSERT INTO horacerta.audit(actor_id,action,before_value,after_value)
      SELECT ${actor}::uuid,'Regras de horas ativadas',b.rules,s.rules||jsonb_build_object('release','024/025','reason',${reason}::text)
      FROM release_work_rules_backup b CROSS JOIN horacerta.settings s
      WHERE s.id=1 AND b.rules IS DISTINCT FROM s.rules`,
  ]);
  console.log('Regras 024 ativadas. Configuração anterior preservada na auditoria; pontos e turnos históricos mantidos.');
}
