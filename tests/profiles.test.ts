import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProfile } from '../src/profiles/schema.ts';

const dir = join(import.meta.dirname, '../src/profiles/engines');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

test('all 20 qb-changesound engines have a profile', () => {
  assert.equal(files.length, 20);
});

for (const f of files) {
  test(`profile ${f} is valid and matches its sound bank`, () => {
    const p = validateProfile(JSON.parse(readFileSync(join(dir, f), 'utf8')), f);
    assert.equal(`${p.id}.json`, f);
    assert.equal(p.source.awc, `sfx/dlc_${p.id}/${p.id}.awc`);
  });
}

test('invalid profile is rejected with a path', () => {
  assert.throws(() => validateProfile({ id: 'x', name: 'x', idleRPM: 900, redlineRPM: 800, limiterRPM: 900 }), /idleRPM/);
});
