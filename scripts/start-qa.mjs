import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Load before spawning Next: Next forwards execArgv into NODE_OPTIONS, where
// --env-file is not allowed. Keep that flag out of the Next process entirely.
const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvFile(new URL('../.env.qa', import.meta.url));
const target = new URL(process.env.TEST_DATABASE_URL || '');
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/horacerta_qa') {
  throw new Error('QA requires the same dedicated loopback horacerta_qa database and a non-production environment.');
}
const child = spawn(process.execPath, [
  '--import', './tests/support/local-neon.mjs',
  'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001',
], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, HORACERTA_LOCAL_TEST: '1', HORACERTA_LOCAL_NEON_TEST: '1', VERCEL: '1' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
