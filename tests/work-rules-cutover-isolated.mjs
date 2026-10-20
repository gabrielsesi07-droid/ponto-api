// Execute the real release CLI, replacing only its Neon connection with ephemeral PostgreSQL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isolatedSql } from './isolated-sql-runtime.mjs';
import { releaseMode, workRulesReleaseStatements } from '../scripts/work-rules-release-plan.mjs';

if (process.env.LOCAL_SQL_TEST !== '1') throw new Error('Este teste exige LOCAL_SQL_TEST=1. Não aceita banco externo.');
const sql = await isolatedSql();
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8');
const split = source => source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim());
const source = await readFile(new URL('../scripts/release-work-rules.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('neon', 'releaseMode', 'workRulesReleaseStatements', source.replace(/^import .*;\r?$/gm, ''));
const originalArgs = process.argv, originalUrl = process.env.DATABASE_URL;
// Satisfy only the CLI's required-setting check; injected Neon never reads or connects to this URL.
process.env.DATABASE_URL = 'postgresql://qa@localhost/unused_release_test';
async function release(...args) {
  process.argv = [process.execPath, 'scripts/release-work-rules.mjs', ...args];
  await run(() => sql, releaseMode, workRulesReleaseStatements);
}

try {
  const base = (await read('001-schema.sql')).split(';').filter(s => s.trim());
  base.push('CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id),started_at timestamptz NOT NULL)');
  base.push(...split(await read('003-orders.sql')));
  base.push('CREATE TABLE horacerta.schema_migrations(name text PRIMARY KEY)');
  const flow = split(await read('019-flow-fixes.sql'));
  base.push(...flow.slice(0, flow.findIndex(s => s.includes('CREATE OR REPLACE FUNCTION horacerta.month_action('))));
  await sql.transaction(base.map(s => sql.query(s)));
  const boss = '10000000-0000-0000-0000-000000000001', worker = '10000000-0000-0000-0000-000000000002';
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(${boss}::uuid,'Supervisor QA','boss@example.invalid','coordinator',40),(${worker}::uuid,'Worker QA','worker@example.invalid','employee',22)`;
  await sql`INSERT INTO horacerta.entries(user_id,date,start,"end",service,status,rate,rules) SELECT ${worker}::uuid,current_date-1,'07:00','18:00','Snapshot QA','Aprovado',30,rules FROM horacerta.settings WHERE id=1`;
  const beforeRules = (await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules;
  const beforePoint = (await sql`SELECT to_jsonb(e) value FROM horacerta.entries e`)[0].value;

  await release('--prepare');
  assert.deepEqual((await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules, beforeRules);
  assert.equal((await sql`SELECT count(*)::int n FROM horacerta.schema_migrations WHERE name='024-work-rules'`)[0].n, 0);
  assert.equal((await sql`SELECT to_regprocedure('horacerta.trip_update_dates(uuid,jsonb)') IS NOT NULL ok`)[0].ok, true);
  await assert.rejects(release('--activate', '--actor=' + worker, '--reason=Ativação conferida em ambiente efêmero'), /coordenador ativo/);
  assert.deepEqual((await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules, beforeRules);

  await release('--activate', '--actor=' + boss, '--reason=Ativação conferida em ambiente efêmero');
  const afterRules = (await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules;
  assert.equal(afterRules.calculation_version, 2);
  assert.equal(afterRules.approval_required, false);
  assert.equal(afterRules.daily_minutes, 480);
  assert.equal(afterRules.day_policies.saturday.normal_minutes, 480);
  assert.deepEqual(afterRules.day_policies.saturday.tiers, [{ up_to_minutes: 180, bonus: 60 }, { up_to_minutes: null, bonus: 100 }]);
  const audit = (await sql`SELECT before_value,after_value FROM horacerta.audit WHERE action='Regras de horas ativadas'`)[0];
  assert.deepEqual(audit.before_value, beforeRules);
  assert.equal(audit.after_value.release, '024/025');
  assert.equal(audit.after_value.reason, 'Ativação conferida em ambiente efêmero');
  assert.deepEqual((await sql`SELECT to_jsonb(e)-'work_type'-'shift'-'break_start' value FROM horacerta.entries e`)[0].value, beforePoint);
  await release('--prepare');
  await release('--activate', '--actor=' + boss, '--reason=Reaplicação idempotente no teste efêmero');
  assert.equal((await sql`SELECT count(*)::int n FROM horacerta.audit WHERE action='Regras de horas ativadas'`)[0].n, 1);
  console.log('Cutover real: preparação preserva regras, ativação valida coordenador, salva backup auditado e mantém pontos; reaplicação idempotente. Nenhum banco externo foi acessado.');
} finally {
  process.argv = originalArgs;
  if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
  await sql.close?.();
}
