import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// No environment file is loaded; all mutations are confined to disposable in-memory PostgreSQL.
const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(new URL('../work/sql-runtime/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url)))
  throw new Error('Instale o runtime local de testes em work/sql-runtime antes de usar esta verificação. Veja docs/homologacao-local.md.');
const suites=['api-handlers-local','security-handlers-local','equipment-checklists-local','order-workflow-isolated','workweek-migration','work-rules-isolated','order-date-changes-isolated','work-rules-cutover-isolated'];
for(const suite of suites){
  console.log('\nVerificando '+suite);
  const result=spawnSync(process.execPath,['tests/'+suite+'.mjs'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,LOCAL_SQL_TEST:'1',DATABASE_URL:'',TEST_DATABASE_URL:''}});
  if(result.error)throw result.error;
  if(result.status!==0){process.exitCode=result.status??1;break;}
}
