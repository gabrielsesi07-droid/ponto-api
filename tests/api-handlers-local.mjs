import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isolatedSql } from './isolated-sql-runtime.mjs';
import { installLocalHandlerHooks } from './api-fixtures/local-handler-hooks.mjs';

// This suite deliberately refuses every remote-test fallback, even when a URL exists.
if (process.env.LOCAL_SQL_TEST !== '1') throw new Error('Somente PGlite local: execute com LOCAL_SQL_TEST=1. Nenhuma URL de banco é usada.');
const local = await isolatedSql();
const context = { memberId: '', sql: null, lastSqlError: null };
function tracked(query) {
  return {
    text: query.text, params: query.params,
    then(resolve, reject) { return Promise.resolve(query).catch(error => { context.lastSqlError = error; throw error; }).then(resolve, reject); },
  };
}
const sql = (strings, ...params) => tracked(local(strings, ...params));
sql.query = (text, params) => tracked(local.query(text, params));
sql.transaction = async queries => {
  try {
    if (context.beforeTransaction) {
      const before = context.beforeTransaction;
      context.beforeTransaction = null;
      await before();
    }
    return await local.transaction(queries);
  }
  catch (error) { context.lastSqlError = error; throw error; }
};
context.sql = sql;
const removeHooks = installLocalHandlerHooks(context);
let passed = 0;
async function scenario(name, run) { await run(); passed++; console.log(`OK ${passed}: ${name}`); }
async function migration(file) {
  const source = await readFile(new URL('../sql/' + file, import.meta.url), 'utf8');
  for (const statement of source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim())) await sql.query(statement);
}
async function request(handler, method, path, body, expected = 200) {
  context.lastSqlError = null;
  const response = await handler(new Request('http://localhost' + path, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(body) } : {}),
  }));
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}${context.lastSqlError ? ` SQL: ${context.lastSqlError.message} (${context.lastSqlError.code})` : ''}`);
  return result;
}

try {
  const entries = await import('../app/api/entries/route.ts');
  const shifts = await import('../app/api/shifts/route.ts');
  const recalculation = await import('../app/api/recalculation/route.ts');
  const { calculate, today, legacyDefaults } = await import('../lib/domain.ts');
  await migration('001-schema.sql');
  await sql.query('CREATE TABLE horacerta.timers(user_id uuid PRIMARY KEY REFERENCES horacerta.users(id), started_at timestamptz NOT NULL)');
  await migration('003-orders.sql');
  await migration('005-flexible-client.sql');
  await migration('013-points-require-order.sql');
  await migration('014-monthly-salary.sql');
  await sql.query('CREATE TABLE horacerta.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  const flow = await readFile(new URL('../sql/019-flow-fixes.sql', import.meta.url), 'utf8');
  for (const statement of flow.split(/\r?\n-- statement-break\r?\n/)) {
    if (statement.includes('Notificações passam')) break;
    if (statement.trim()) await sql.query(statement);
  }
  await migration('024-work-rules.sql');
  const boss = randomUUID(), worker = randomUUID(), colleague = randomUUID();
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(${boss}::uuid,'Coordenador','boss@example.invalid','coordinator',40),(${worker}::uuid,'Pessoa Um','worker@example.invalid','employee',30),(${colleague}::uuid,'Pessoa Dois','other@example.invalid','employee',20)`;
  const base = new Date(today() + 'T12:00:00Z');
  base.setUTCDate(1); base.setUTCDate(0);
  while (base.getUTCDay() !== 1) base.setUTCDate(base.getUTCDate() - 1);
  const date = offset => new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const month = date(0).slice(0, 7);
  const order = randomUUID(), otherOrder = randomUUID();
  await sql`INSERT INTO horacerta.orders(id,title,client_name,address,starts_at,ends_at,members,created_by) VALUES
    (${order}::uuid,'Medição','Cliente local','Endereço de teste',${date(-15) + 'T08:00:00-03:00'}::timestamptz,${date(0) + 'T18:00:00-03:00'}::timestamptz,ARRAY[${worker}::uuid,${colleague}::uuid],${boss}::uuid),
    (${otherOrder}::uuid,'Deslocamento','Cliente local','Endereço de teste',${date(-15) + 'T08:00:00-03:00'}::timestamptz,${date(0) + 'T18:00:00-03:00'}::timestamptz,ARRAY[${worker}::uuid],${boss}::uuid)`;
  context.memberId = worker;
  const shift = { start: '08:00', end: '17:00', break_start: '12:00', break_end: '13:00' };
  const point = patch => ({ user_id: worker, order_id: order, date: date(0), start: '07:00', end: '18:00', break_minutes: 60, break_mode: 'automatic', work_type: 'work', ...patch });
  const stored = async id => (await sql`SELECT *,date::text,start::text,"end"::text,break_start::text FROM horacerta.entries WHERE id=${id}::uuid`)[0];
  let workId, travelId;

  await scenario('serviço v2 exige turno; falha não cria ponto ou auditoria', async () => {
    const rejected = await request(entries.POST, 'POST', '/api/entries', point(), 409);
    assert.match(rejected.error, /Confirme seu turno/);
    assert.equal((await sql`SELECT 1 FROM horacerta.entries`).length, 0);
    assert.equal((await sql`SELECT 1 FROM horacerta.audit WHERE entry_id IS NOT NULL`).length, 0);
  });
  await scenario('colaborador confirma seu turno, consulta e não pode sobrescrevê-lo', async () => {
    const saved = await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, work_type: 'work', shift });
    assert.equal(saved.version, 1);
    const read = await request(shifts.GET, 'GET', `/api/shifts?order_id=${order}`);
    assert.deepEqual(read.shifts[0].shift, shift);
    const again = await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, work_type: 'work', shift, version: 1 }, 409);
    assert.match(again.error, /já está confirmado/);
  });
  await scenario('mutação real 07h–18h desconta 1h, calcula 2h extras e aprova automaticamente', async () => {
    const saved = await request(entries.POST, 'POST', '/api/entries', point());
    workId = saved.id;
    const entry = await stored(workId);
    assert.equal(entry.status, 'Aprovado');
    assert.equal(entry.break_minutes, 60);
    assert.deepEqual(entry.shift, shift);
    const [computed] = calculate([entry]);
    assert.equal(computed.worked, 600);
    assert.equal(computed.extra, 120);
    assert.equal(computed.amount, 90);
    assert.equal((await sql`SELECT status FROM horacerta.orders WHERE id=${order}::uuid`)[0].status, 'Em andamento');
  });
  await scenario('empregado edita o próprio aprovado e a versão antiga é recusada', async () => {
    const before = await stored(workId);
    await request(entries.POST, 'POST', '/api/entries', point({ id: workId, version: before.version, end: '18:30' }));
    const changed = await stored(workId);
    assert.equal(changed.status, 'Aprovado');
    assert.equal(changed.version, before.version + 1);
    assert.equal(calculate([changed])[0].extra, 150);
    await request(entries.POST, 'POST', '/api/entries', point({ id: workId, version: before.version }), 409);
  });
  await scenario('viagem diária dispensa turno e mantém identificação própria', async () => {
    const saved = await request(entries.POST, 'POST', '/api/entries', point({ order_id: otherOrder, date: date(-7), start: '05:00', end: '09:00', break_minutes: 0, work_type: 'travel' }));
    travelId = saved.id;
    const entry = await stored(travelId);
    assert.equal(entry.work_type, 'travel');
    assert.equal(entry.shift, null);
    assert.equal(calculate([entry])[0].extra, 0);
  });
  await scenario('viagem antes da data prevista é aceita; serviço antes da OS continua bloqueado', async () => {
    const early = { date: date(-16), start: '05:00', end: '09:00', break_minutes: 0 };
    const denied = await request(entries.POST, 'POST', '/api/entries', point(early), 409);
    assert.match(denied.error, /anterior ao dia agendado/);
    const saved = await request(entries.POST, 'POST', '/api/entries', point({ ...early, work_type: 'travel' }));
    assert.equal((await stored(saved.id)).work_type, 'travel');
    assert.equal((await stored(saved.id)).date, date(-16));
  });
  await scenario('contratos negam lançamento/turno de outra pessoa e data inválida retorna400', async () => {
    await request(entries.POST, 'POST', '/api/entries', point({ user_id: colleague, date: date(-1) }), 403);
    const shiftOther = await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, user_id: colleague, work_type: 'work', shift }, 409);
    assert.match(shiftOther.error, /próprio turno/);
    await request(shifts.GET, 'GET', `/api/shifts?order_id=${order}&user_id=${colleague}`, null, 403);
    await request(entries.POST, 'POST', '/api/entries', point({ date: '2026-02-30' }), 400);
  });
  await scenario('can_edit e aprovação manual impedem editar aprovado; snapshots não mudam', async () => {
    const before = await stored(workId);
    await sql`UPDATE horacerta.users SET can_edit=false WHERE id=${worker}::uuid`;
    await request(entries.POST, 'POST', '/api/entries', point({ id: workId, version: before.version }), 403);
    await sql`UPDATE horacerta.users SET can_edit=true WHERE id=${worker}::uuid`;
    await sql`UPDATE horacerta.settings SET rules=jsonb_set(rules,'{approval_required}','true') WHERE id=1`;
    await request(entries.POST, 'POST', '/api/entries', point({ id: workId, version: before.version }), 403);
    await sql`UPDATE horacerta.settings SET rules=jsonb_set(rules,'{approval_required}','false') WHERE id=1`;
    assert.deepEqual((await stored(workId)).rules, before.rules);
  });
  await scenario('coordenador corrige turno com motivo/versão sem alterar snapshot antigo', async () => {
    context.memberId = boss;
    await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, user_id: worker, work_type: 'work', shift, version: 1, reason: 'curto' }, 409);
    const corrected = { ...shift, start: '09:00', end: '18:00' };
    await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, user_id: worker, work_type: 'work', shift: corrected, version: 1, reason: 'Correção conferida com colaborador' });
    assert.deepEqual((await stored(workId)).shift, shift);
    await request(shifts.POST, 'POST', '/api/shifts', { order_id: order, user_id: worker, work_type: 'work', shift, version: 1, reason: 'Tentativa com versão desatualizada' }, 409);
  });
  await scenario('deslocamento por turno exige referência e intervalo SQL não pode voltar pela meia-noite', async () => {
    context.memberId = worker;
    await sql`UPDATE horacerta.settings SET rules=jsonb_set(rules,'{travel_mode}','"shift"') WHERE id=1`;
    await request(entries.POST, 'POST', '/api/entries', point({ order_id: otherOrder, date: date(-3), start: '05:00', end: '09:00', break_minutes: 0, work_type: 'travel' }), 409);
    await sql`UPDATE horacerta.settings SET rules=jsonb_set(rules,'{travel_mode}','"daily"') WHERE id=1`;
    await assert.rejects(async () => await sql`SELECT horacerta.point_entry_context(${worker}::uuid,${worker}::uuid,NULL,${date(0)}::date,'10:00'::time,'23:00'::time,180,'custom','22:00'::time)`, /intervalo dentro da jornada/);
  });
  await scenario('mudança entre pré-validação e transação usa regras, aprovação e valor-hora autoritativos', async () => {
    const previous = (await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules;
    context.beforeTransaction = async () => {
      const changed = { ...previous, approval_required: true, travel_mode: 'all_extra' };
      await sql`UPDATE horacerta.settings SET rules=${JSON.stringify(changed)}::jsonb WHERE id=1`;
      await sql`UPDATE horacerta.users SET hourly_rate=50 WHERE id=${worker}::uuid`;
    };
    const created = await request(entries.POST, 'POST', '/api/entries', point({ order_id: otherOrder, date: date(-3), start: '05:00', end: '09:00', break_minutes: 0, work_type: 'travel' }));
    const entry = await stored(created.id);
    assert.equal(entry.status, 'Pendente');
    assert.equal(entry.rules.travel_mode, 'all_extra');
    assert.equal(Number(entry.rate), 50);
    assert.equal(calculate([entry])[0].extra, 240);
    await sql`UPDATE horacerta.settings SET rules=${JSON.stringify(previous)}::jsonb WHERE id=1`;
    await sql`UPDATE horacerta.users SET hourly_rate=30 WHERE id=${worker}::uuid`;
    context.memberId = boss;
  });
  await scenario('recálculo real confere prévia, recupera taxa e aplica turno atual com auditoria', async () => {
    await sql`UPDATE horacerta.entries SET rules=${JSON.stringify(legacyDefaults)}::jsonb,rate=0 WHERE id=${travelId}::uuid`;
    const scope = { month, user_id: worker, fill_missing_rates: true, use_current_shifts: true };
    const preview = await request(recalculation.GET, 'GET', `/api/recalculation?month=${month}&user_id=${worker}&fill_missing_rates=true&use_current_shifts=true`);
    assert.equal(preview.entries, 4);
    assert.equal(preview.recovered_rates, 1);
    assert.equal(preview.updated_shifts, 1);
    const result = await request(recalculation.POST, 'POST', '/api/recalculation', { ...scope, token: preview.token, reason: 'Conferência e correção do cálculo do mês' });
    assert.equal(result.updated, 4);
    const work = await stored(workId), travel = await stored(travelId);
    assert.equal(travel.rules.calculation_version, 2);
    assert.equal(Number(travel.rate), 30);
    assert.equal(work.shift.start, '09:00');
    assert.equal(work.status, 'Aprovado');
    assert.equal((await sql`SELECT 1 FROM horacerta.audit WHERE action='Recálculo de horas'`).length, 4);
  });
  await scenario('prévia de recálculo fica inválida após edição e empregado não pode recalcular', async () => {
    const preview = await request(recalculation.GET, 'GET', `/api/recalculation?month=${month}&user_id=${worker}`);
    await sql`UPDATE horacerta.entries SET version=version+1,notes='Conferido após prévia' WHERE id=${workId}::uuid`;
    await request(recalculation.POST, 'POST', '/api/recalculation', { month, user_id: worker, token: preview.token, reason: 'Prévia deve ser invalidada após alteração' }, 409);
    context.memberId = worker;
    await request(recalculation.GET, 'GET', `/api/recalculation?month=${month}`, null, 403);
    await request(recalculation.POST, 'POST', '/api/recalculation', { month, token: preview.token, reason: 'Empregado não pode aplicar recálculo' }, 403);
  });
  await scenario('mês fechado bloqueia edição, criação, status, exclusão e recálculo', async () => {
    await sql`INSERT INTO horacerta.month_closings(month,closed_by) VALUES(${month + '-01'}::date,${boss}::uuid)`;
    const before = await stored(workId);
    await request(entries.POST, 'POST', '/api/entries', point({ id: workId, version: before.version }), 409);
    await request(entries.POST, 'POST', '/api/entries', point({ date: date(-1) }), 409);
    context.memberId = boss;
    await request(entries.PATCH, 'PATCH', '/api/entries', { id: workId, version: before.version, status: 'Pendente' }, 409);
    await request(entries.DELETE, 'DELETE', '/api/entries', { id: workId, version: before.version }, 409);
    await request(recalculation.GET, 'GET', `/api/recalculation?month=${month}`, null, 409);
    assert.equal((await stored(workId)).version, before.version);
    await sql`DELETE FROM horacerta.month_closings WHERE month=${month + '-01'}::date`;
  });
  await scenario('reaplicar migração preserva regras configuradas, pontos e snapshots', async () => {
    const before = await stored(workId);
    await sql`UPDATE horacerta.settings SET rules=jsonb_set(rules,'{day_policies,weekday,normal_minutes}','420') WHERE id=1`;
    await migration('024-work-rules.sql');
    assert.equal((await sql`SELECT rules FROM horacerta.settings WHERE id=1`)[0].rules.day_policies.weekday.normal_minutes, 420);
    assert.deepEqual(await stored(workId), before);
  });
  console.log(`\n${passed} cenários passaram usando handlers reais, SQL real e PostgreSQL PGlite em memória. Nenhum banco remoto foi acessado.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  removeHooks();
  await local.close?.();
}
