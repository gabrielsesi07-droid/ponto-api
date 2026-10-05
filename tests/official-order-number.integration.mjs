import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const url=process.env.TEST_DATABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname!=='/horacerta_qa') throw new Error('Explicit local TEST_DATABASE_URL /horacerta_qa required');
test('official OS number preserves identity and history with guarded coordinator edits',async()=>{
 const pool=new pg.Pool({connectionString:url}), c=await pool.connect();
 const schema='qa_number_'+randomUUID().replaceAll('-','');
 const load=async file=>(await readFile(new URL('../sql/'+file,import.meta.url),'utf8')).replaceAll('horacerta',schema).replaceAll('2849061701','2849061723');
 try {
  await c.query('BEGIN');
  await c.query(await load('001-schema.sql'));
  await c.query(`CREATE TABLE ${schema}.timers(user_id uuid PRIMARY KEY REFERENCES ${schema}.users(id),started_at timestamptz,paused_at timestamptz,pauses jsonb DEFAULT '[]',rate numeric DEFAULT 0,rules jsonb DEFAULT '{}',company text DEFAULT '',service text DEFAULT '',notes text DEFAULT ''); CREATE TABLE ${schema}.sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES ${schema}.users(id),expires_at timestamptz); CREATE TABLE ${schema}.schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now());`);
  for(const f of ['003-orders.sql','005-flexible-client.sql','006-library.sql','007-checklists.sql','009-imported-checklists.sql','010-client-search.sql','011-order-lifecycle.sql','012-client-lifecycle.sql','017-push-notifications.sql','019-flow-fixes.sql']) await c.query(await load(f));
  // Simulate an existing installation, then apply and reapply the migration.
  await c.query(`ALTER TABLE ${schema}.orders DROP COLUMN official_number`);
  for(let i=0;i<2;i++) await c.query(await load('023-official-order-number.sql'));
  await c.query(await load('004-order-actions.sql'));
  const admin=randomUUID(),employee=randomUUID();
  await c.query(`INSERT INTO ${schema}.users(id,name,email,role,hourly_rate) VALUES($1,'Admin','number-admin@example.invalid','coordinator',10),($2,'Worker','number-worker@example.invalid','employee',10)`,[admin,employee]);
  const data={title:'Document service',official_number:' 004831/26 ',client_name:'QA document client',address:'',place_id:'',contact:'',phone:'',starts_at:'2026-01-01T08:00:00Z',ends_at:'2026-01-01T12:00:00Z',members:[employee],vehicle_id:null,equipment:'',instructions:'',priority:'Normal'};
  const action=async(actor,name,p)=>(await c.query(`SELECT ${schema}.order_action($1,$2,$3::jsonb) result`,[actor,name,JSON.stringify(p)])).rows[0].result;
  const created=await action(admin,'save_order',data), id=created.id;
  const row=async()=>(await c.query(`SELECT * FROM ${schema}.orders WHERE id=$1`,[id])).rows[0];
  const first=await row(); assert.equal(first.official_number,'004831/26');
  // Legacy clients omit the new field on save: it must not disappear.
  const {official_number: omitted,...legacy}=data; assert.ok(omitted);
  await action(admin,'save_order',{...legacy,id,version:first.version});
  assert.equal((await row()).official_number,'004831/26');
  const invalid=async(fn,pattern)=>{await c.query('SAVEPOINT negative');await assert.rejects(fn,pattern);await c.query('ROLLBACK TO SAVEPOINT negative');};
  await invalid(()=>action(employee,'set_order_number',{id,version:2,official_number:'BAD'}),/coordenador/);
  await invalid(()=>action(admin,'set_order_number',{id,version:1,official_number:'BAD'}),/atualizada/);
  await invalid(()=>action(admin,'set_order_number',{id,version:2,official_number:'x'.repeat(81)}),/80/);
  await c.query(`UPDATE ${schema}.orders SET status='Concluída' WHERE id=$1`,[id]);
  const before=await row();
  await action(admin,'set_order_number',{id,version:2,official_number:'4831'});
  const after=await row();
  for(const key of Object.keys(before).filter(k=>!['official_number','version'].includes(k))) assert.deepEqual(after[key],before[key],key);
  assert.equal(after.official_number,'4831'); assert.equal(after.version,3);
  assert.equal((await c.query(`SELECT count(*)::int n FROM ${schema}.audit WHERE action='Número oficial da OS alterado'`)).rows[0].n,1);
  const event=(await c.query(`SELECT detail FROM ${schema}.order_events WHERE action='Número oficial alterado'`)).rows[0]; assert.match(event.detail,/004831\/26.*4831/);
  await invalid(()=>action(admin,'set_order_number',{id,version:2,official_number:'stale'}),/atualizada/);
  await action(admin,'set_order_number',{id,version:3,official_number:'  '}); assert.equal((await row()).official_number,null);
  await c.query(await load('023-official-order-number.sql')); assert.equal((await row()).number,first.number);
 } finally {await c.query('ROLLBACK');c.release();await pool.end();}
});
