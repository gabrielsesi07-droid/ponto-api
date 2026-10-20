import { neon } from '@neondatabase/serverless';

/** Never falls back to the application's production database. LOCAL_SQL_TEST is an ephemeral PostgreSQL WASM runtime. */
export async function isolatedSql() {
  if (process.env.LOCAL_SQL_TEST !== '1') {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Defina TEST_DATABASE_URL para um banco isolado, ou LOCAL_SQL_TEST=1 com PGlite em work/sql-runtime. DATABASE_URL não é usada.');
    return neon(process.env.TEST_DATABASE_URL);
  }
  const { PGlite } = await import('../work/sql-runtime/node_modules/@electric-sql/pglite/dist/index.js');
  const local = new PGlite();
  async function execute(text, params = []) {
    if (params.length) return (await local.query(text, params)).rows;
    const result = await local.exec(text);
    return result.at(-1)?.rows || [];
  }
  const lazy = (text, params = []) => ({text,params,then(resolve,reject) { return execute(text,params).then(resolve,reject); }});
  const sql = (strings, ...params) => lazy(strings.reduce((value, part, i) => value + (i ? `$${i}` : '') + part,''),params);
  sql.query = (text,params) => lazy(text,params);
  sql.transaction = async queries => {
    await local.exec('BEGIN');
    try {
      const results = [];
      for (const query of queries) results.push(await execute(query.text,query.params));
      await local.exec('COMMIT');
      return results;
    } catch(error) { await local.exec('ROLLBACK'); throw error; }
  };
  sql.close = () => local.close();
  return sql;
}
