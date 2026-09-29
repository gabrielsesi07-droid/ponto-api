import test from 'node:test';
import assert from 'node:assert/strict';
import { availablePointOrders, pointOrderNumber } from '../lib/point-orders.ts';
const order=(id,status='Agendada',assigned=true,start_date='2026-09-29')=>({id,status,assigned,start_date,number:1,title:'Serviço',client_name:'Cliente'});
const orders=[order('ready'),order('ongoing','Em andamento'),order('finished','Concluída'),order('cancelled','Cancelada'),order('another','Agendada',false),order('future','Agendada',true,'2026-10-01')];
test('Live point only offers assigned open OS from the scheduled day onward',()=>{
 assert.deepEqual(availablePointOrders(orders,'2026-09-29',true).map(o=>o.id),['ready','ongoing']);
 assert.equal(availablePointOrders(orders,'2026-09-28',true).length,0);
});
test('Forgotten points can select completed or cancelled work without showing another team OS',()=>{
 assert.deepEqual(availablePointOrders(orders,'2026-09-29',false).map(o=>o.id),['ready','ongoing','finished','cancelled']);
});
test('An existing point retains its historical order, even after a membership or schedule change',()=>{
 assert.ok(availablePointOrders(orders,'2026-09-28',false,'another').some(o=>o.id==='another'));
 assert.equal(pointOrderNumber(104),'OS-000104');
});
