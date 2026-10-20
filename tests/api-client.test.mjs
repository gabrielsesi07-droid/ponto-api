import test from 'node:test';
import assert from 'node:assert/strict';
import { requestApi, ApiError } from '../lib/api-client.ts';

test('API preserves actionable server errors and never retries a mutation', async () => {
  let calls = 0;
  const fetcher = async (_path, init) => {
    calls++;
    assert.equal(init.method, 'PATCH');
    return new Response(JSON.stringify({error:'O registro mudou. Atualize antes de salvar.',code:'CONFLICT'}), {status:409});
  };
  await assert.rejects(requestApi('/api/example', {version:1}, 'PATCH', {fetcher}), error => error instanceof ApiError && error.status === 409 && error.code === 'CONFLICT' && /registro mudou/.test(error.message));
  assert.equal(calls, 1);
});

test('non-JSON mutation response warns about uncertain outcome', async () => {
  await assert.rejects(requestApi('/api/example', {}, 'POST', {fetcher:async()=>new Response('<html>proxy error</html>',{status:502})}), /confira antes de tentar novamente/);
});

test('timeout aborts hung request and warns against blindly repeating a save', async () => {
  let calls = 0;
  const fetcher = (_path, {signal}) => new Promise((_resolve, reject) => {
    calls++;
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')), {once:true});
  });
  await assert.rejects(requestApi('/api/example', {}, 'POST', {fetcher,timeoutMs:10}), error => error.code === 'TIMEOUT' && /pode ter sido concluída/.test(error.message));
  assert.equal(calls,1);
});

test('reads use GET and return response data', async () => {
  const result = await requestApi('/api/example', undefined, 'POST', {fetcher:async(_path, init)=> {
    assert.equal(init.method,'GET');
    assert.equal(init.body,undefined);
    return new Response(JSON.stringify({items:[1]}));
  }});
  assert.deepEqual(result,{items:[1]});
});
