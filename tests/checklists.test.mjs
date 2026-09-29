import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { suggestChecklistItems, checklistProblems, checklistCompletionIssues, checklistItemsSchema, plannedChecklistItems } from '../lib/checklists.ts';
test('FPO extraction preserves item quantities but strips personal filled fields', () => {
 const items=suggestChecklistItems([{content:'Data: | 01/01/2020'},{content:'ITENS | QTD Entrega | QTD Devolução | Comentários'},
  {content:'Scanner SN ASW-123 | 2 | 1 | Cliente antigo'},{content:'Cabo serial RS232 |  |  | '},{content:'Assinatura do responsável | X | X'}],randomUUID);
 assert.equal(items.length,2);assert.equal(items[0].label,'Scanner');assert.equal(items[0].planned,2);assert.equal(items[0].notes,'');
 assert.equal(items[0].incoming_qty,null);assert.equal(items[0].outgoing,false);assert.equal(items[1].label,'Cabo serial RS232');assert.equal(items[1].planned,null);
});
test('Unknown table is never invented as a checklist',()=>assert.deepEqual(suggestChecklistItems([{content:'Descrição sem tabela | 9 | 10'}],randomUUID),[]));
test('Completion feedback identifies every pending item and its current position',()=>{
 const base={id:randomUUID(),label:'Cabo',planned:1,outgoing:true,incoming:true,outgoing_qty:1,incoming_qty:1,na:false,notes:''};
 const missing={...base,id:randomUUID(),label:'Fonte',incoming:false};
 const na={...base,id:randomUUID(),label:'Suporte',na:true};
 const issues=checklistCompletionIssues([base,missing,na]);
 assert.deepEqual(issues.map(i=>[i.itemId,i.index]),[[missing.id,2],[na.id,3]]);
 assert.deepEqual(issues.map(i=>i.message),checklistProblems([base,missing,na]));
 assert.deepEqual(checklistCompletionIssues([{...missing,incoming:true},{...na,notes:'Não utilizado'}]),[]);
 assert.equal(checklistCompletionIssues([na,base])[0].index,1);
});
test('Completion requires conferences, quantities and justified discrepancies',()=>{
 const i={id:randomUUID(),label:'Cabo',planned:2,outgoing:true,incoming:true,outgoing_qty:2,incoming_qty:1,na:false,notes:''};
 assert.equal(checklistProblems([i]).length,1);assert.equal(checklistProblems([{...i,notes:'Uma unidade avariada retida no cliente.'}]).length,0);
 assert.equal(checklistProblems([{...i,incoming_qty:null}]).length,1);assert.equal(checklistProblems([{...i,na:true}]).length,1);
 assert.equal(checklistProblems([{...i,na:true,notes:'Não usado nesta OS.'}]).length,0);assert.equal(checklistProblems([]).length,1);
});
test('Repeated item IDs are rejected',()=>{
 const i={id:randomUUID(),label:'Cabo',planned:1};assert.equal(checklistItemsSchema.safeParse([i,i]).success,false);
});
test('Coordinator planning never pre-confirms an employee conference',()=>{
 const item={id:randomUUID(),label:'Cabo',planned:2,outgoing:true,incoming:true,outgoing_qty:2,incoming_qty:2,na:true,notes:'Preenchido antes'};
 const [planned]=plannedChecklistItems([item]);
 assert.deepEqual(planned,{...item,outgoing:false,incoming:false,outgoing_qty:null,incoming_qty:null,na:false,notes:''});
 assert.equal(item.outgoing,true);
});
