import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { writeFile } from 'node:fs/promises';
const sql=neon(process.env.DATABASE_URL),base=process.env.TEST_BASE_URL||'http://127.0.0.1:5174';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local test server required');
const [admin]=await sql`SELECT id FROM horacerta.users WHERE role='coordinator' AND active LIMIT 1`;
const worker=randomUUID(),other=randomUUID(),model=randomUUID(),sourceDoc=randomUUID(),tag='QA-checklist-'+randomUUID(),tokens=[],cookies=new Map(),orders=[];
let checks=0;
const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;console.log('OK '+label);};
async function call(path,body,who=admin.id){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(who?{cookie:cookies.get(who)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});return{status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};}
const item=()=>({id:randomUUID(),label:'Cabo de teste',planned:2,outgoing:false,incoming:false,outgoing_qty:null,incoming_qty:null,na:false,notes:''});
const action=(action,data,who)=>call('/api/checklists',{action,...data},who);
const os=(day=0)=>({title:tag,client_name:'Cliente de teste',starts_at:new Date(Date.now()-3600000+day*86400000).toISOString(),ends_at:new Date(Date.now()+3600000+day*86400000).toISOString(),members:[worker],vehicle_id:null,model_ids:[model]});
try{
 await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate) VALUES(${worker},'QA checklist colaborador',${worker+'@example.invalid'},'employee',0),(${other},'QA checklist outro',${other+'@example.invalid'},'employee',0)`;
 await sql`INSERT INTO horacerta.equipment_models(id,name,family) VALUES(${model},${tag},'Teste descartável')`;
 for(const id of [admin.id,worker,other]){const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');tokens.push(hash);cookies.set(id,'hc_session='+token);await sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${hash},${id},now()+interval '20 minutes')`;}
 const templateBody={model_id:model,version:0,title:'Checklist de teste',source_document_id:null,status:'active',items:[item()]};
 check((await call('/api/checklists/templates?model='+model,null,null)).status,401,'Anonymous template blocked');
 check((await call('/api/checklists/templates?model='+model,null,worker)).status,403,'Employee cannot inspect drafts');
 check((await call('/api/checklists/templates',templateBody,worker)).status,403,'Employee cannot alter templates');
 const saved=await call('/api/checklists/templates',templateBody);check(saved.status,200,'Coordinator activates template');
 check((await sql`SELECT status FROM horacerta.equipment_models WHERE id=${model}`)[0].status,'published','Activation also validates catalogue model');
 check((await call('/api/checklists/templates',templateBody)).status,409,'Stale template version blocked');
 const preview=await call('/api/checklists/preview?models='+model);check(preview.data.models[0].items.length,1,'Instant preview contains editable template items');
 const customItem={...templateBody.items[0],label:'Cabo personalizado na OS',outgoing:true,incoming:true,outgoing_qty:2,incoming_qty:2,na:true,notes:'Marcação indevida no planejamento'};
 const created=await call('/api/operations',{action:'save_order',data:{...os(),checklist_drafts:[{model_id:model,template_version:1,title:'Checklist desta OS',items:[customItem]}]}});
 check(created.status,200,'OS created with customized checklist atomically');orders.push(created.data.id);
 let payload=await call('/api/checklists?order='+orders[0],null,worker);let c=payload.data.checklists[0];
 check(c.items[0].label,customItem.label,'Draft customization persisted only on OS');
 check([c.items[0].outgoing,c.items[0].incoming,c.items[0].outgoing_qty,c.items[0].incoming_qty,c.items[0].na,c.items[0].notes],[false,false,null,null,false,''],'Coordinator planning cannot pre-fill employee conference');
 check((await call('/api/checklists?order='+orders[0],null,other)).status,404,'Unassigned user blocked');
 check((await call('/api/checklists?order='+orders[0],null,null)).status,401,'Anonymous list blocked');
 check((await call(`/checklists/${c.id}/print`,null,other)).status,404,'Unassigned print blocked');
 check((await call(`/checklists/${c.id}/print`,null,null)).status,307,'Anonymous print redirects to login');
 const printed=await call(`/checklists/${c.id}/print`,null,worker);
 check(printed.status,200,'Assigned user can print');check(printed.data.includes('Cliente de teste'),true,'Print includes client');check(printed.data.includes(customItem.label),true,'Print includes customized items');
 await action('sync',{order_id:orders[0]});check((await call('/api/checklists?order='+orders[0])).data.checklists.length,1,'Re-linking is idempotent');
 const updatedTemplate=await call('/api/checklists/templates',{...templateBody,version:1,items:[{...item(),label:'Modelo revisado'}]});check(updatedTemplate.status,200,'Template new version saved');
 check((await call('/api/checklists?order='+orders[0])).data.checklists[0].items[0].label,customItem.label,'Old OS snapshot survives template change');
 const staleOS=await call('/api/operations',{action:'save_order',data:{...os(1),checklist_drafts:[{model_id:model,template_version:1,title:'Versão antiga',items:[customItem]}]}});
 check(staleOS.status,409,'Stale draft cannot create an OS with a changed template');
 const nextOS=await call('/api/operations',{action:'save_order',data:{...os(1),members:[worker,other]}});check(nextOS.status,200,'Next OS uses current standard');orders.push(nextOS.data.id);
 check((await call('/api/checklists?order='+orders[1])).data.checklists[0].items[0].label,'Modelo revisado','Next OS receives updated items');
 const shared=(await call('/api/checklists?order='+orders[1],null,other)).data.checklists[0];
 check((await action('save',{id:shared.id,version:shared.version,title:shared.title,items:shared.items,notes:'A equipe decidiu que eu farei esta conferência.',identification:''},other)).status,200,'Any assigned employee can confer when team has multiple people');
 check((await call('/api/checklists?order='+orders[1])).data.checklists[0].updated_by,other,'Shared team conference records actual author');
 const baseData={id:c.id,version:c.version,title:c.title,items:c.items,notes:'',identification:''};
 check((await action('save',baseData)).status,403,'Coordinator cannot fill employee conference');
 check((await action('complete',baseData)).status,403,'Coordinator cannot complete employee conference');
 let sqlCoordinatorBlocked=false;
 try { await sql`SELECT horacerta.checklist_action(${admin.id}::uuid,'save',${JSON.stringify(baseData)}::jsonb)`; } catch(e) { sqlCoordinatorBlocked=e.code==='P0001'; }
 check(sqlCoordinatorBlocked,true,'Database also enforces employee-only conference');
 check((await action('save',baseData,other)).status,409,'Unassigned write blocked');
 check((await action('complete',baseData,worker)).status,400,'Unconfirmed checklist cannot complete');
 await call('/api/operations',{action:'begin',data:{id:orders[0]}},worker);
 check((await call('/api/operations',{action:'finish',data:{id:orders[0],notes:'Serviço concluído'}},worker)).status,409,'OS cannot finish with open checklist');
 const concurrent=await Promise.all([action('save',{...baseData,notes:'A'},worker),action('save',{...baseData,notes:'B'},worker)]);
 check(concurrent.map(r=>r.status).sort(),[200,409],'Concurrent updates preserve one writer');
 c=(await call('/api/checklists?order='+orders[0])).data.checklists[0];
 const finishedItems=c.items.map(i=>({...i,outgoing:true,incoming:true,outgoing_qty:2,incoming_qty:1}));
 check((await action('complete',{...baseData,version:c.version,items:finishedItems},worker)).status,400,'Unexplained shortage blocked');
 finishedItems[0].notes='Uma unidade voltou avariada e foi separada.';
 check((await action('complete',{...baseData,version:c.version,items:finishedItems},worker)).status,200,'Justified return can complete');
 c=(await call('/api/checklists?order='+orders[0])).data.checklists[0];
 check(c.completed_by,worker,'Conference attributed to the logged-in employee');
 check((await action('save',{...baseData,version:c.version},worker)).status,409,'Completed checklist locked');
 check((await action('reopen',{id:c.id,version:c.version,reason:'Correção'},worker)).status,403,'Only coordinator reopens');
 check((await action('reopen',{id:c.id,version:c.version,reason:'Correção de conferência'})).status,200,'Coordinator reopens with reason');
 c=(await call('/api/checklists?order='+orders[0])).data.checklists[0];
 check((await action('complete',{...baseData,version:c.version,items:finishedItems},worker)).status,200,'Reopened checklist can complete');
 check((await call('/api/operations',{action:'finish',data:{id:orders[0],notes:'Serviço concluído'}},worker)).status,200,'OS can finish after conference');
 c=(await call('/api/checklists?order='+orders[0])).data.checklists[0];
 check((await action('reopen',{id:c.id,version:c.version,reason:'Tentativa após encerramento'})).status,409,'Closed OS preserves immutable conference');
 check((await call('/api/checklists?order='+orders[0])).data.history.length>=5,true,'Audit trail records changes');
 // Imported source lists are usable references, without publishing their original.
 await sql`INSERT INTO horacerta.library_documents(id,sha256,name,extension,size,category,ready) VALUES(${sourceDoc},${createHash('sha256').update(tag).digest('hex')},'QA checklist source.txt','.txt',1,'checklist',true)`;
 await sql`UPDATE horacerta.checklist_templates SET status='imported',source_document_id=${sourceDoc},source_name='QA checklist source.txt',items=${JSON.stringify([item()])}::jsonb WHERE model_id=${model}`;
 await sql`UPDATE horacerta.equipment_models SET status='pending' WHERE id=${model}`;
 check((await call('/api/checklists/preview?models='+model)).data.models[0].items.length,1,'Imported list visible in coordinator preview');
 const importedOS=await call('/api/operations',{action:'save_order',data:os(2)});check(importedOS.status,200,'Imported checklist auto-links without model approval');orders.push(importedOS.data.id);
 const imported=(await call('/api/checklists?order='+importedOS.data.id,null,worker)).data.checklists[0];
 check(imported.items.length,1,'Employee receives actual imported items');
 check(imported.source_review_pending,true,'Imported reference is not represented as technically approved');
 check((await call('/api/library/'+sourceDoc,null,worker)).status,404,'Original draft document remains private');
 const legacyOS=await call('/api/operations',{action:'save_order',data:{...os(3),model_ids:[]}});orders.push(legacyOS.data.id);
 await sql`UPDATE horacerta.orders SET model_ids=ARRAY[${model}::uuid] WHERE id=${legacyOS.data.id}`;
 await sql`INSERT INTO horacerta.order_checklists(order_id,model_id,model_name,title,updated_by) VALUES(${legacyOS.data.id},${model},${tag},'Legacy empty list',${admin.id})`;
 check((await action('sync',{order_id:legacyOS.data.id})).data.added,1,'Untouched legacy empty list recovers source items');
 const repaired=(await call('/api/checklists?order='+legacyOS.data.id,null,worker)).data.checklists[0];
 check([repaired.items.length,repaired.version],[1,2],'Recovered checklist has items and audited new revision');
 check((await action('sync',{order_id:legacyOS.data.id})).data.added,0,'Repair is idempotent');
 check((await action('sync',{order_id:orders[1]})).data.added,0,'Existing nonempty checklist is never overwritten');
 check((await action('custom',{order_id:legacyOS.data.id,model_id:model,title:'Empty',items:[]})).status,400,'Cannot create a new empty custom list');
 check((await action('save',{id:repaired.id,version:repaired.version,title:repaired.title,items:[],notes:'',identification:''},worker)).status,400,'Employee cannot erase all checklist items');
 await sql`UPDATE horacerta.library_documents SET obsolete=true WHERE id=${sourceDoc}`;
 const obsoleteOS=await call('/api/operations',{action:'save_order',data:os(4)});orders.push(obsoleteOS.data.id);
 check((await call('/api/checklists?order='+obsoleteOS.data.id)).data.checklists.length,0,'Obsolete source never auto-links');
 await sql`UPDATE horacerta.library_documents SET obsolete=false WHERE id=${sourceDoc}`;
 const deletionFor=async id=>{const [o]=await sql`SELECT number,version FROM horacerta.orders WHERE id=${id}`;return {id,version:o.version,confirmation:'OS-'+String(o.number).padStart(6,'0')};};
 check((await call('/api/operations',{action:'delete_order',data:await deletionFor(orders[1])})).status,409,'Saved employee checklist protects OS from deletion');
 check((await call('/api/operations',{action:'delete_order',data:await deletionFor(legacyOS.data.id)})).status,200,'Unfilled repaired checklist does not prevent deleting mistaken OS');
 check((await sql`SELECT id FROM horacerta.order_checklists WHERE order_id=${legacyOS.data.id}`).length,0,'Deleting OS removes only its unfilled checklist copy');
 check((await sql`SELECT id FROM horacerta.checklist_templates WHERE model_id=${model}`).length,1,'Deleting OS preserves catalogue checklist standard');
 console.log(`${checks} checklist checks passed.`);
 if(process.env.UI_TEST_HOLD==='1'){
  await writeFile(new URL('../work/library/test-checklist-context.json',import.meta.url),JSON.stringify({order_id:importedOS.data.id,employee_id:worker}));
  console.log('Disposable fixtures available for temporary UI verification. Send Enter to clean up.');
  await new Promise(resolve=>{const timer=setTimeout(resolve,Number(process.env.UI_TEST_HOLD_MS)||600000);process.stdin.once('data',()=>{clearTimeout(timer);resolve();});});
 }
}finally{
 await sql.transaction([
  sql`DELETE FROM horacerta.audit WHERE action='OS excluída' AND before_value->>'order_id'=ANY(${orders}::text[])`,
  sql`DELETE FROM horacerta.checklist_history WHERE template_id IN (SELECT id FROM horacerta.checklist_templates WHERE model_id=${model}) OR checklist_id IN (SELECT id FROM horacerta.order_checklists WHERE order_id=ANY(${orders}::uuid[]))`,
  sql`DELETE FROM horacerta.order_checklists WHERE order_id=ANY(${orders}::uuid[])`,
  sql`DELETE FROM horacerta.order_events WHERE order_id=ANY(${orders}::uuid[])`,
  sql`DELETE FROM horacerta.orders WHERE id=ANY(${orders}::uuid[])`,
  sql`DELETE FROM horacerta.checklist_templates WHERE model_id=${model}`,
  sql`DELETE FROM horacerta.library_documents WHERE id=${sourceDoc}`,
  sql`DELETE FROM horacerta.equipment_models WHERE id=${model}`,
  sql`DELETE FROM horacerta.sessions WHERE token_hash=ANY(${tokens}::text[])`,
  sql`DELETE FROM horacerta.sessions WHERE user_id=ANY(${[worker,other]}::uuid[])`,
  sql`DELETE FROM horacerta.users WHERE id=ANY(${[worker,other]}::uuid[])`,
 ]);console.log('All disposable checklist fixtures and sessions removed.');
}
