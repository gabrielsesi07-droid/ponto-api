// Explicit QA-only upgrade/recovery verification; requires migrated empty horacerta_qa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
import { hashPin, verifyPin } from '../lib/pin.ts';

const testUrl = process.env.TEST_DATABASE_URL;
if (process.env.HORACERTA_LOCAL_NEON_TEST !== '1' || !testUrl || !['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname) || new URL(testUrl).pathname !== '/horacerta_qa')
  throw new Error('Use the explicit disposable horacerta_qa environment and local Neon preload.');
const sql = neon(testUrl);
const admin = randomUUID(), legacy = randomUUID(), permanent = randomUUID(), ids = [admin, legacy, permanent];
const run = (script, args = []) => spawnSync(process.execPath, ['--import', './tests/support/local-neon.mjs', script, ...args], {
  cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 30000,
  env: { ...process.env, DATABASE_URL: testUrl, HORACERTA_RECOVERY_OPERATOR: 'QA authorized operator' },
});
test('upgrade revokes dismissed universal PINs and CLI recovery is atomic and auditable', async () => {
  assert.equal((await sql`SELECT count(*)::int n FROM horacerta.users`)[0].n, 0, 'Requires empty dedicated QA database');
  const universalHash = await hashPin('123456'), legacyHash = await hashPin('582941'), safeHash = await hashPin('846291');
  try {
    await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate,pin_hash,pin_change_required) VALUES(${admin},'QA dismissed universal',${admin + '@example.invalid'},'coordinator',0,${universalHash},false),(${legacy},'QA legacy onboarding',${legacy + '@example.invalid'},'employee',0,${legacyHash},true),(${permanent},'QA permanent',${permanent + '@example.invalid'},'employee',0,${safeHash},false)`;
    await sql`INSERT INTO horacerta.sessions(token_hash,user_id,credential_version,expires_at) VALUES(${'a'.repeat(64)},${admin},1,now()+interval '1 hour'),(${'b'.repeat(64)},${permanent},1,now()+interval '1 hour')`;
    assert.equal(run('scripts/migrate-security.mjs').status, 0, 'Security migration subprocess must succeed');
    const users = await sql`SELECT id,pin_hash,credential_version,pin_change_required,temporary_pin_expires_at<=now() expired FROM horacerta.users ORDER BY id`;
    for (const id of [admin, legacy]) {
      const user = users.find(row => row.id === id);
      assert.equal(user.credential_version, 2); assert.equal(user.pin_change_required, true); assert.equal(user.expired, true);
      assert.equal(await verifyPin('123456', user.pin_hash), false);
    }
    assert.equal(users.find(row => row.id === permanent).pin_hash, safeHash);
    assert.equal((await sql`SELECT count(*)::int n FROM horacerta.sessions WHERE user_id=${admin}`)[0].n, 0);
    assert.equal((await sql`SELECT count(*)::int n FROM horacerta.sessions WHERE user_id=${permanent}`)[0].n, 1);
    assert.equal(run('scripts/migrate-security.mjs').status, 0, 'Security migration reapplication must succeed');
    assert.equal((await sql`SELECT credential_version FROM horacerta.users WHERE id=${admin}`)[0].credential_version, 2);
    const [{ access_code: code }] = await sql`SELECT access_code FROM horacerta.users WHERE id=${admin}`;
    const recovered = run('scripts/reset-pin.mjs', [code]);
    assert.equal(recovered.status, 0, 'Recovery subprocess must succeed');
    // Capture credentials only in memory; neither subprocess stdout nor PIN is printed.
    let response;
    try { response = JSON.parse(recovered.stdout); } catch { throw new Error('Recovery response must be valid JSON'); }
    assert.equal(/^\d{6}$/.test(response.temporary_pin), true);
    assert.equal(response.temporary_pin === '123456', false);
    const [user] = await sql`SELECT pin_hash,credential_version,temporary_pin_used_at,temporary_pin_expires_at>now()+interval '23 hours' expires FROM horacerta.users WHERE id=${admin}`;
    assert.equal(user.credential_version, 3); assert.equal(user.temporary_pin_used_at, null); assert.equal(user.expires, true);
    assert.equal(await verifyPin(response.temporary_pin, user.pin_hash), true);
    const [event] = await sql`SELECT actor_id,after_value FROM horacerta.audit WHERE actor_id=${admin}`;
    assert.equal(event.after_value.via, 'operator_cli'); assert.equal(event.after_value.operator, 'QA authorized operator');
    assert.equal(event.after_value.credential_version, 3);
    assert.equal('pin_hash' in event.after_value, false); assert.equal('temporary_pin' in event.after_value, false);
    assert.equal(JSON.stringify(event.after_value).includes(response.temporary_pin), false);
    const [{ person }] = await sql`SELECT horacerta.complete_pin_login(${admin},${user.pin_hash},${user.credential_version},${'c'.repeat(64)},30) AS person`;
    assert.equal(person.pin_change_required, true);
    assert.equal((await sql`SELECT horacerta.complete_pin_login(${admin},${user.pin_hash},${user.credential_version},${'d'.repeat(64)},30) AS person`)[0].person, null);
  } finally {
    await sql.transaction([
      sql`DELETE FROM horacerta.audit WHERE actor_id=ANY(${ids}::uuid[])`,
      sql`DELETE FROM horacerta.sessions WHERE user_id=ANY(${ids}::uuid[])`,
      sql`DELETE FROM horacerta.users WHERE id=ANY(${ids}::uuid[])`,
    ]);
  }
});
