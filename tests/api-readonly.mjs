// HTTP audit: GETs and requests rejected before mutation only. No real records are changed.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
if (!process.env.AUDIT_DATABASE_URL) throw new Error('Set AUDIT_DATABASE_URL explicitly. This audit only reads business records and revokes its temporary sessions.');
const sql=neon(process.env.AUDIT_DATABASE_URL),base=process.env.AUDIT_BASE_URL||'http://localhost:5174';
if (!['localhost','127.0.0.1','ponto-api-gold.vercel.app'].includes(new URL(base).hostname)) throw new Error('Use the local server or the verified production domain; do not send session credentials to another host.');
const zero='00000000-0000-4000-8000-000000000000', sessions=[], actors={};
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label);};
async function call(path,who,body,method='POST',origin=base){
 const res=await fetch(base+path,{method:body===undefined?'GET':method,headers:{...(who?{cookie:'hc_session='+actors[who].token}:{}),...(body===undefined?{}:{'Content-Type':'application/json',origin})},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 return {status:res.status,body:await res.json()};
}
try {
 for(const role of ['coordinator','employee']){
  const [user]=await sql`SELECT id FROM horacerta.users WHERE active AND role=${role} LIMIT 1`;
  assert.ok(user);const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
  await sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${hash},${user.id},now()+interval '5 minutes')`;
  sessions.push(hash);actors[role]={id:user.id,token};
 }
 const end=new Date().toISOString().slice(0,10), date='?from='+end.slice(0,7)+'-01&to='+end;
 for(const path of ['/api/state'+date,'/api/operations','/api/library','/api/checklists?order='+zero,'/api/checklists/preview?models='+zero,'/api/checklists/templates?model='+zero,'/api/places?q=abc','/api/operations/'+zero+'/pdf','/api/library/'+zero,'/api/library/'+zero+'/file'])check((await call(path)).status===401,'Anonymous blocked '+path.split('?')[0]);
 check((await call('/api/session')).body.login===true,'Anonymous session requests login');
 for(const role of ['coordinator','employee']){
  for(const path of ['/api/session','/api/state'+date,'/api/operations','/api/library'])check((await call(path,role)).status===200,role+' reads '+path.split('?')[0]);
 }
 const own=(await call('/api/state'+date,'employee')).body;
 check(own.users.every(u=>u.id===actors.employee.id)&&own.entries.every(e=>e.user_id===actors.employee.id)&&own.teamTimers.length===0,'Employee sees only own people/time data');
 const ops=(await call('/api/operations','employee')).body;
 check(ops.orders.every(o=>o.members.includes(actors.employee.id))&&ops.clients.length===0&&ops.people.length===0,'Employee OS and master-data scope');
 const adminOps=(await call('/api/operations','coordinator')).body;
 check(adminOps.clients.every(c=>typeof c.has_history==='boolean'),'Client lifecycle protection exposed');
 check((await call('/api/state?from=2026-02-30&to=2026-03-05','coordinator')).status===400,'Invalid calendar day has actionable 400');
 check((await call('/api/state?from=2026-09-30&to=2026-09-01','coordinator')).status===400,'Reversed report period rejected');
 for(const action of ['save_client','save_vehicle','save_order','delete_order','cancel','delete_client','archive_client','restore_client'])check((await call('/api/operations','employee',{action,data:{}})).status===403,'Employee denied '+action);
 for(const entity of ['user','client','settings'])check((await call('/api/manage','employee',{entity,data:{}})).status===403,'Employee denied manage '+entity);
 check((await call('/api/library','employee',{})).status===403,'Employee cannot publish library');
 check((await call('/api/checklists','coordinator',{action:'save'})).status===403,'Coordinator cannot confer for employee');
 for(const action of ['sync','custom','reopen'])check((await call('/api/checklists','employee',{action})).status===403,'Employee denied checklist '+action);
 check((await call('/api/places?q=abc','employee')).status===403,'Places restricted to coordinator');
 for(const path of ['/api/entries','/api/clock','/api/manage']){const r=await call(path,'employee','{');check(r.status===400,'Malformed JSON handled '+path+' '+JSON.stringify(r));}
 check((await call('/api/manage','employee',{data:'x'.repeat(30001)})).status===413,'Actual payload size bounded');
 check((await call('/api/manage','employee',{},'POST','https://unrelated.invalid')).status===403,'Cross-origin write denied');
 for(const method of ['PATCH','DELETE'])check((await call('/api/entries','employee',{id:zero,version:1},method)).status===403,'Employee cannot '+method+' entries');
 for(const o of ops.orders.slice(0,3))check((await call('/api/checklists?order='+o.id,'employee')).status===200,'Assigned employee can read OS checklist');
 const unassigned=adminOps.orders.find(o=>!o.members.includes(actors.employee.id));
 if(unassigned)check((await call('/api/checklists?order='+unassigned.id,'employee')).status===404,'Other team checklist inaccessible');
 check((await call('/api/login?name=__audit_no_match__')).status===200,'Name lookup responds without login mutation');
 console.log('HTTP audit passed: '+checks+' checks, without business mutations.');
}finally{for(const hash of sessions)await sql`DELETE FROM horacerta.sessions WHERE token_hash=${hash}`;console.log('Temporary audit sessions revoked.');}
