import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { ENGINE_CATALOG, getCatalogEntry } from '../src/profiles/catalog.ts';
import { engineSubtitle, engineTitle } from '../src/profiles/presentation.ts';
import { validateProfile } from '../src/profiles/schema.ts';
import { translator } from '../src/i18n/index.ts';

const dir = new URL('../src/profiles/engines/', import.meta.url);
const profiles = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => validateProfile(JSON.parse(readFileSync(new URL(f, dir), 'utf8')), f));

test('every engine profile has a catalog entry and vice versa', () => {
  const ids = new Set(profiles.map((p) => p.id));
  for (const p of profiles) assert.ok(getCatalogEntry(p.id), `no catalog entry for ${p.id}`);
  for (const e of ENGINE_CATALOG) assert.ok(ids.has(e.id), `catalog entry without profile: ${e.id}`);
  assert.equal(new Set(ENGINE_CATALOG.map((e) => e.id)).size, ENGINE_CATALOG.length);
});

test('marketing names are unique and never the internal bank id', () => {
  const names = ENGINE_CATALOG.map((e) => e.displayName);
  assert.equal(new Set(names).size, names.length, 'duplicate display names');
  for (const p of profiles) {
    const title = engineTitle(p);
    assert.notEqual(title.toLowerCase().replace(/[^a-z0-9]/g, ''), p.id.replace(/[^a-z0-9]/g, ''), `${p.id} title is its bank id`);
    assert.notEqual(title, p.source.soundName.toUpperCase());
  }
});

test('descriptions exist in both languages', () => {
  for (const e of ENGINE_CATALOG) {
    assert.ok(e.shortDescription.en.length > 5, e.id);
    assert.ok(e.shortDescription.cs.length > 5, e.id);
  }
});

test('technical subtitle is derived from the profile', () => {
  const lambo = profiles.find((p) => p.id === 'lambov10');
  assert.ok(lambo);
  assert.equal(engineSubtitle(lambo, translator('en')), '5.2 L · 8,500 RPM · 7-speed');
  assert.equal(engineSubtitle(lambo, translator('cs')).replace(/\s/g, ' '), '5,2 l · 8 500 ot/min · 7 st.');
  const flat6 = profiles.find((p) => p.id === 'gt3flat6');
  assert.ok(flat6);
  assert.match(engineSubtitle(flat6, translator('en')), /^4\.0 L/);
});
