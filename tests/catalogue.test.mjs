import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { selectableModels } from '../lib/library.ts';

test('Coordinator OS form selects equipment without editing checklist drafts', async () => {
  const source = await readFile(new URL('../components/order-editors.tsx', import.meta.url), 'utf8');
  assert.match(source, /<ModelPicker/);
  assert.doesNotMatch(source, /ChecklistPreview|checklistDrafts|checklist_drafts/);
  const actions = await readFile(new URL('../sql/004-order-actions.sql', import.meta.url), 'utf8');
  assert.match(actions, /attach_order_checklists/);
});

test('OS picker includes imported pending models even when none are published', () => {
  const models = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }];
  assert.deepEqual(selectableModels(models, []).map(m => m.id), ['a', 'b']);
});
test('OS picker hides archived models except ones already selected', () => {
  const models = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'published' }, { id: 'c', status: 'archived' }];
  assert.deepEqual(selectableModels(models, []).map(m => m.id), ['a', 'b']);
  assert.deepEqual(selectableModels(models, ['c']).map(m => m.id), ['a', 'b', 'c']);
});
