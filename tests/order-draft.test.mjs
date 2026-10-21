import test from 'node:test';
import assert from 'node:assert/strict';
import { reusableOrderDraft } from '../lib/order-draft.ts';
test('OS semelhante reaproveita planejamento e exclui execução e recursos inativos', () => {
  const source = { id:'old',version:9,status:'Concluída',official_number:'4831',starts_at:'2026-01-01',ends_at:'2026-01-02',title:'Medição',client_id:'archived',client_name:'Cliente',address:'Rua',place_id:'',contact:'Equipe',phone:'',members:['active','inactive'],vehicle_id:'inactive',equipment:'Maleta',model_ids:['model','archived-model'],equipment_models:[{id:'archived-model',status:'archived'}],instructions:'Orientação',priority:'Normal',completion:'Concluído',trips:[{}],pdf_name:'old.pdf',acknowledgements:[{}] };
  const draft = reusableOrderDraft(source,{clients:[{id:'archived',active:false}],people:[{id:'active',active:true},{id:'inactive',active:false}],vehicles:[{id:'inactive',active:false}]});
  assert.deepEqual(draft.members,['active']); assert.equal(draft.vehicle_id,''); assert.equal(draft.client_id,'');
  assert.equal(draft.title,'Medição'); assert.deepEqual(draft.model_ids,['model']);
  for(const key of ['id','version','status','official_number','starts_at','ends_at','completion','trips','pdf_name','acknowledgements']) assert.ok(!(key in draft),key);
  draft.model_ids.push('another'); assert.deepEqual(source.model_ids,['model','archived-model']);
});
