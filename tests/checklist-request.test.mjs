import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { submitChecklist } from '../lib/checklist-request.ts';

test('Checklist submission sends one request with version and waits for confirmation', async () => {
  const payload={action:'complete',id:'test',version:4,items:[]};
  const fetchMock=mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(url,'/api/checklists'); assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),payload); assert.ok(init.signal);
    return Response.json({ok:true,version:5});
  });
  try { assert.equal((await submitChecklist(payload)).ok,true); assert.equal(fetchMock.mock.callCount(),1); }
  finally { fetchMock.mock.restore(); }
});
test('Validation and concurrent-edit responses preserve actionable server messages', async () => {
  for (const status of [400,403,409]) {
    const fetchMock=mock.method(globalThis,'fetch',async()=>Response.json({error:'Confira as quantidades ou reabra a versão atual.'},{status}));
    try { await assert.rejects(submitChecklist({}),/Confira as quantidades/); }
    finally { fetchMock.mock.restore(); }
  }
});
test('Non-JSON responses and missing save confirmation never appear as success', async () => {
  for (const response of [new Response('<html>Bad gateway</html>',{status:502}),Response.json({}),Response.json(null)]) {
    const fetchMock=mock.method(globalThis,'fetch',async()=>response);
    try { await assert.rejects(submitChecklist({}),/campos foram mantidos/); }
    finally { fetchMock.mock.restore(); }
  }
});
test('Connection failure gives recovery guidance without automatically resubmitting', async () => {
  const fetchMock=mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});
  try { await assert.rejects(submitChecklist({}),/Falha de conexão/); assert.equal(fetchMock.mock.callCount(),1); }
  finally { fetchMock.mock.restore(); }
});
test('Hung submission times out and warns of uncertain save without blind retry', async () => {
  const fetchMock=mock.method(globalThis,'fetch',(_,init)=>new Promise((resolve,reject)=>{
    init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  }));
  try { await assert.rejects(submitChecklist({},10),/pode ter sido salvo/); assert.equal(fetchMock.mock.callCount(),1); }
  finally { fetchMock.mock.restore(); }
});
