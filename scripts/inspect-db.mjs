import { neon } from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const tables=await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name`;
console.log(JSON.stringify({connected:true,tables}));
