// Optional local tooling. Install the pinned portable binary in the ignored folder:
// npm install --prefix work/local-postgres embedded-postgres@17.10.0-beta.17
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const toolRoot = new URL('../work/local-postgres/', import.meta.url);
const { default: EmbeddedPostgres } = await import(new URL('node_modules/embedded-postgres/dist/index.js', toolRoot).href);
const databaseDir = fileURLToPath(new URL('data/', toolRoot));
mkdirSync(fileURLToPath(toolRoot), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir, user: 'postgres', password: 'horacerta_local_only', port: 55432,
  persistent: true, createPostgresUser: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: console.error,
});
if (!existsSync(databaseDir + '/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
try {
  const found = await client.query("SELECT 1 FROM pg_database WHERE datname='horacerta_qa'");
  if (!found.rowCount) await client.query("CREATE DATABASE horacerta_qa ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");
} finally { await client.end(); }
console.log('PostgreSQL QA ready: 127.0.0.1:55432 / horacerta_qa. Local disposable credentials only.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60_000);
