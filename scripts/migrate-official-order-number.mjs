import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const sql=neon(process.env.DATABASE_URL);
const ddl=await readFile(new URL("../sql/023-official-order-number.sql",import.meta.url),"utf8");
const actions=await readFile(new URL("../sql/004-order-actions.sql",import.meta.url),"utf8");
await sql.transaction([sql`SELECT pg_advisory_xact_lock(2849061701)`,...ddl.split(/\r?\n-- statement-break\r?\n/).filter(s=>s.trim()).map(s=>sql.query(s)),sql.query(actions)]);
console.log("Official OS number migration applied; existing references preserved.");
