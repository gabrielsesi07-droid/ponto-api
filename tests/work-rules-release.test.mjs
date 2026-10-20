import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseMode, splitWorkRulesMigration, workRulesReleaseStatements } from '../scripts/work-rules-release-plan.mjs';

test('cutover separa estrutura de ativação sem acessar banco', async () => {
  const prepare = await workRulesReleaseStatements('prepare', true);
  const activate = await workRulesReleaseStatements('activate', true);
  assert.ok(prepare.some(s => s.includes('CREATE TABLE IF NOT EXISTS horacerta.order_shifts')));
  assert.ok(prepare.some(s => s.includes('FUNCTION horacerta.point_entry_order_for_type')));
  assert.ok(prepare.some(s => s.includes('FUNCTION horacerta.order_reschedule')));
  assert.ok(prepare.some(s => s.includes('FUNCTION horacerta.trip_update_dates')));
  assert.ok(prepare.every(s => !s.includes('UPDATE horacerta.settings')));
  assert.equal(activate.length, 1);
  assert.ok(activate[0].includes('UPDATE horacerta.settings'));
  assert.ok(activate[0].includes("name='024-work-rules'"));
  assert.ok(!activate[0].includes('CREATE OR REPLACE FUNCTION'));
});

test('migração individual sem argumento preserva as duas etapas completas', async () => {
  const source = await readFile(new URL('../sql/024-work-rules.sql', import.meta.url), 'utf8');
  assert.deepEqual(splitWorkRulesMigration(source), [...splitWorkRulesMigration(source, 'prepare'), ...splitWorkRulesMigration(source, 'activate')]);
  assert.equal(releaseMode([]), 'all');
  assert.equal(releaseMode([], 'prepare'), 'prepare');
  assert.equal(releaseMode(['--prepare']), 'prepare');
  assert.equal(releaseMode(['--activate']), 'activate');
  assert.throws(() => releaseMode(['--prepare', '--activate']), /somente/);
});

test('cutover recusa mudança que misture ativação e preparação', () => {
  assert.throws(() => splitWorkRulesMigration('SELECT 1', 'activate'), /último bloco/);
  assert.throws(() => splitWorkRulesMigration("UPDATE horacerta.settings SET rules='{}';\n-- statement-break\nDO $$ BEGIN IF name='024-work-rules' THEN UPDATE horacerta.settings SET rules='{}'; END IF; END $$", 'prepare'), /preparação/);
  assert.throws(() => splitWorkRulesMigration('', 'unknown'), /inválida/);
});
