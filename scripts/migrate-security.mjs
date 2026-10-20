import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { hashPin, verifyPin, randomTemporaryPin } from '../lib/pin.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the explicit security migration.');
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../sql/020-identity-integrity.sql', import.meta.url), 'utf8');
const legacyClock = await readFile(new URL('../sql/002-clock-function.sql', import.meta.url), 'utf8');
await sql.transaction([
  sql`SELECT pg_advisory_xact_lock(2849061701)`,
  ...source.split(/\r?\n-- statement-break\r?\n/).filter(s => s.trim()).map(s => sql.query(s)),
  sql.query(legacyClock),
]);
// Legacy universal credentials (even accounts that dismissed the prompt) are never usable after upgrade.
// Compare-and-set avoids overwriting a concurrent operator/user credential change.
const users = await sql`SELECT id,pin_hash,pin_change_required,temporary_pin_expires_at FROM horacerta.users WHERE pin_hash IS NOT NULL`;
let invalidated = 0;
for (const user of users) {
  const universal = await verifyPin('123456', user.pin_hash);
  const legacyOnboarding = user.pin_change_required && !user.temporary_pin_expires_at;
  if (!universal && !legacyOnboarding) continue;
  const replacement = await hashPin(randomTemporaryPin());
  const changed = await sql`UPDATE horacerta.users SET pin_hash=${replacement},pin_change_required=true,pin_change_prompted=false,temporary_pin_expires_at=now(),temporary_pin_used_at=NULL,login_attempts=0,attempt_window=NULL WHERE id=${user.id} AND pin_hash=${user.pin_hash} RETURNING id`;
  invalidated += changed.length;
}
console.log(`Security migration applied; ${invalidated} legacy credential(s) revoked. Use reset-pin.mjs for coordinator recovery, then issue employee invitations from the app. No credentials were printed.`);
