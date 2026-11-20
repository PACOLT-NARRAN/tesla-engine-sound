import assert from 'node:assert/strict';
import test from 'node:test';
import { cs } from '../src/i18n/cs.ts';
import { en } from '../src/i18n/en.ts';
import { detectLanguage, translate, translator } from '../src/i18n/index.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Czech and English have exactly the same keys, none empty', () => {
  assert.deepEqual(Object.keys(cs).sort(), Object.keys(en).sort());
  for (const [k, v] of Object.entries(cs)) assert.ok(v.trim().length > 0, `empty cs text for ${k}`);
  for (const [k, v] of Object.entries(en)) assert.ok(v.trim().length > 0, `empty en text for ${k}`);
});

test('translations use the same placeholders as English', () => {
  for (const k of Object.keys(en) as (keyof typeof en)[]) assert.deepEqual(placeholders(cs[k]), placeholders(en[k]), k);
});

test('interpolation and Czech diacritics', () => {
  assert.equal(translate('cs', 'engines.addFavorite', { name: 'ITALIAN V12' }), 'Přidat ITALIAN V12 do oblíbených');
  assert.equal(translate('en', 'hud.manual', { offset: '−1' }), 'MANUAL −1');
});

test('number formatting follows the language', () => {
  assert.equal(translator('en').num(8500), '8,500');
  assert.equal(translator('cs').num(8500).replace(/\s/g, ' '), '8 500');
  assert.equal(translator('cs').num(5.2, 1), '5,2');
});

test('dynamic keys resolve or return null', () => {
  assert.equal(translator('cs').dyn('layout.Flat-6'), 'Boxer 6');
  assert.equal(translator('cs').dyn('layout.W16'), null);
});

test('browser language detection', () => {
  assert.equal(detectLanguage(['cs-CZ', 'en']), 'cs');
  assert.equal(detectLanguage(['sk']), 'cs');
  assert.equal(detectLanguage(['de-DE', 'en-GB']), 'en');
  assert.equal(detectLanguage(['fr']), 'en');
  assert.equal(detectLanguage(undefined), 'en');
});
