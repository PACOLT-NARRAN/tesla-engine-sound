import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECENT, pushRecent, reconcileIds, toggleFavorite } from '../src/storage/engineLists.ts';

test('toggleFavorite adds then removes, keeping order', () => {
  let f: string[] = [];
  f = toggleFavorite(f, 'k20a');
  f = toggleFavorite(f, 'lambov10');
  assert.deepEqual(f, ['k20a', 'lambov10']);
  f = toggleFavorite(f, 'k20a');
  assert.deepEqual(f, ['lambov10']);
});

test('Last Used: newest first, no duplicates, at most three', () => {
  let r: string[] = [];
  for (const id of ['a', 'b', 'c', 'd']) r = pushRecent(r, id);
  assert.deepEqual(r, ['d', 'c', 'b']);
  assert.equal(r.length, MAX_RECENT);
  r = pushRecent(r, 'b');
  assert.deepEqual(r, ['b', 'd', 'c'], 'selecting an existing recent engine moves it to the front');
  r = pushRecent(r, 'b');
  assert.deepEqual(r, ['b', 'd', 'c']);
});

test('reconcile drops ids of engines that no longer exist', () => {
  assert.deepEqual(reconcileIds(['k20a', 'gone', 'lambov10'], new Set(['k20a', 'lambov10'])), ['k20a', 'lambov10']);
});
