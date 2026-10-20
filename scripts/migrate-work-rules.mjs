import { neon } from '@neondatabase/serverless';
import { releaseMode, workRulesReleaseStatements } from './work-rules-release-plan.mjs';
const args = process.argv.slice(2);
if (args.some(arg => !['--prepare', '--activate'].includes(arg))) throw new Error('Use --prepare, --activate ou nenhum argumento para aplicar ambas as etapas.');
const mode = releaseMode(args);
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no ambiente do servidor.');
const sql = neon(process.env.DATABASE_URL);
await sql.transaction([sql`SELECT pg_advisory_xact_lock(2849061701)`, ...(await workRulesReleaseStatements(mode)).map(s => sql.query(s))]);
console.log(mode === 'prepare'
  ? 'Estrutura 024 preparada; regras atuais e pontos históricos preservados.'
  : mode === 'activate' ? 'Regras 024 ativadas; pontos históricos preservados.'
    : 'Estrutura e regras 024 aplicadas; pontos históricos preservados.');
