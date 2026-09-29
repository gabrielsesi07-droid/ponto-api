import assert from 'node:assert/strict';
import test from 'node:test';
import { clientNameKey, searchClients } from '../lib/client-search.ts';
test('Client search ignores accents, case and repeated spaces',()=>{
 assert.equal(clientNameKey('  INDÚSTRIA   São José '),'industria sao jose');
 assert.equal(searchClients([{id:'1',name:'Indústria São José'}],'sao jose')[0].id,'1');
});
test('Client search ranks exact matches before partial and typo suggestions',()=>{
 const options=[{id:'2',name:'Nissan Sul'},{id:'1',name:'Nissan'},{id:'3',name:'Nissam'}];
 assert.deepEqual(searchClients(options,'Nissan').map(x=>x.id),['1','2','3']);
 assert.equal(searchClients(options,'nissam')[0].id,'3');
});
test('Search keeps same-name client IDs separate and caps suggestions',()=>{
 const options=Array.from({length:10},(_,i)=>({id:String(i),name:'Cliente comum'}));
 assert.equal(searchClients(options,'cliente').length,8);
 assert.equal(new Set(searchClients(options,'cliente').map(x=>x.id)).size,8);
 assert.deepEqual(searchClients(options,'x'),[]);
});
