import assert from 'node:assert/strict';
import test from 'node:test';
import { selectableModels } from '../lib/library.ts';

test('OS picker includes imported pending models even when none are published', () => {
  const models = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }];
  assert.deepEqual(selectableModels(models, []).map(m => m.id), ['a', 'b']);
});
test('OS picker hides archived models except ones already selected', () => {
  const models = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'published' }, { id: 'c', status: 'archived' }];
  assert.deepEqual(selectableModels(models, []).map(m => m.id), ['a', 'b']);
  assert.deepEqual(selectableModels(models, ['c']).map(m => m.id), ['a', 'b', 'c']);
});
