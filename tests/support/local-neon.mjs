// Explicit QA-only transport preload. Production code still uses the official Neon client.
import { neonConfig } from '@neondatabase/serverless';
const expectedUrl = process.env.TEST_DATABASE_URL;
if (process.env.HORACERTA_LOCAL_NEON_TEST !== '1' || process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')
  throw new Error('Local Neon preload requires explicit QA opt-in and cannot run in production.');
const target = new URL(expectedUrl || 'about:blank');
if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/horacerta_qa' || !target.port)
  throw new Error('Local Neon preload requires TEST_DATABASE_URL for explicit loopback port/database horacerta_qa.');
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== expectedUrl)
  throw new Error('QA application DATABASE_URL must exactly match TEST_DATABASE_URL.');
// Keep the URL valid before Next's fetch wrapper inspects it. The exact header
// guard below remains authoritative even if another module changes this endpoint.
neonConfig.fetchEndpoint = 'http://127.0.0.1:55433/sql';

const originalFetch = globalThis.fetch;
globalThis.fetch = async function localNeonFetch(input, init) {
  const headers = new Headers(typeof input === 'object' && input !== null && 'headers' in input ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const connectionString = headers.get('Neon-Connection-String');
  if (!connectionString) return originalFetch(input, init);
  if (connectionString !== expectedUrl) throw new Error('QA transport rejects any Neon connection other than its exact loopback test database.');
  // Neon derives an invalid api.0.0.1 URL from the loopback IP. Do not parse that
  // placeholder: its exact connection header, not the derived URL, chooses this transport.
  const request = typeof input === 'object' && input !== null && 'method' in input ? input : undefined;
  if ((init?.method ?? request?.method) !== 'POST') throw new Error('QA Neon transport accepts POST queries only.');
  const body = init?.body ?? (request ? await request.clone().text() : undefined);
  return originalFetch('http://127.0.0.1:55433/sql', {
    method: 'POST', headers, body, signal: init?.signal ?? request?.signal,
  });
};
