import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { BASIC_SHIFT_BARK, basicSoundModel } from '../src/audio/soundModel.ts';
import {
  FREE_ENGINE, PLAN_CAPABILITIES, PRODUCT, canInstallPack, canUseAdvancedOverrun, canUseEngine, canUseManualShifting,
  canUseSportProfile, canUseTrackProfile, effectiveEngine, engineLock, packOwnership, resolveEntitlements,
} from '../src/entitlements/entitlements.ts';
import { FREE_PLAN, PRO_COMPARISON, PRO_PLAN, formatPrice } from '../src/entitlements/products.ts';
import { en } from '../src/i18n/en.ts';
import { ENGINE_CATALOG } from '../src/profiles/catalog.ts';
import { ENGINE_PACKS } from '../src/profiles/packs.ts';
import { testProfile } from './helpers.ts';

const free = resolveEntitlements('free');
const pro = resolveEntitlements('pro');
const jdmOwner = resolveEntitlements('free', false, ['jdm-legends']);
const early = resolveEntitlements('auto', true);
const PRO_ENGINE = { custom: false, tier: 'pro' as const, packId: null };
const JDM = { custom: false, tier: 'pack' as const, packId: 'jdm-legends' };

test('product catalog: one configurable price per product, formatted per language', () => {
  assert.equal(PRO_PLAN.priceEur, 9.99);
  assert.equal(PRO_PLAN.billing, 'lifetime');
  assert.equal(FREE_PLAN.priceEur, 0);
  assert.equal(formatPrice(9.99, 'en'), '€9.99');
  assert.match(formatPrice(9.99, 'cs'), /^9,99\s€$/);
  for (const p of ENGINE_PACKS) assert.ok(p.priceEur >= 2.99 && p.priceEur <= 4.99, `${p.id} price in the planned range`);
  for (const k of [...FREE_PLAN.features, ...PRO_PLAN.features]) assert.ok(k in en);
  for (const c of PRO_COMPARISON) for (const suffix of ['', '.free', '.pro']) assert.ok(`product.cmp.${c}${suffix}` in en);
});

test('no price literal is duplicated in components', () => {
  const dir = new URL('../src/components/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /9[.,]99|3[.,]99|4[.,]99|€/, `${f} must use products.ts / packs.ts`);
  }
});

test('packs: every pack has engines, every pack engine has a pack', () => {
  for (const p of ENGINE_PACKS) {
    const engines = ENGINE_CATALOG.filter((e) => e.packId === p.id);
    assert.ok(engines.length >= 3, p.id);
    assert.ok(p.highlights.length > 0 && p.name.cs && p.description.cs);
  }
  assert.equal(ENGINE_CATALOG.find((e) => e.id === 'gt3flat6')?.tier, 'free', 'default engine stays FREE');
});

test('entitlements: early access unlocks everything, simulation is explicit', () => {
  assert.equal(PRODUCT.earlyAccess, true);
  assert.deepEqual(resolveEntitlements('auto'), { plan: 'pro', ownedPackIds: [], earlyAccess: true, simulated: false });
  assert.equal(canUseEngine(early, JDM), true);
  assert.equal(packOwnership(early, 'jdm-legends'), 'early-access');
  assert.equal(free.simulated, true);
  assert.equal(free.earlyAccess, false, 'a simulated plan is exactly what the developer chose');
  assert.deepEqual([...PLAN_CAPABILITIES.free], []);
});

test('capability selectors', () => {
  assert.equal(canUseSportProfile(free), false);
  assert.equal(canUseTrackProfile(pro), true);
  assert.equal(canUseManualShifting(free), false);
  assert.equal(canUseAdvancedOverrun(free, 'gps'), false);
  assert.equal(canUseAdvancedOverrun(free, 'demo'), true, 'Demo previews the full sound');
  assert.equal(canUseAdvancedOverrun(pro, 'gps'), true);
});

test('engine locks: FREE / PRO / pack / custom', () => {
  assert.equal(engineLock(free, FREE_ENGINE), null);
  assert.equal(engineLock(free, PRO_ENGINE), 'pro');
  assert.equal(engineLock(pro, PRO_ENGINE), null);
  assert.equal(engineLock(free, JDM), 'pack');
  assert.equal(engineLock(pro, JDM), 'pack', 'PRO does not include packs');
  assert.equal(engineLock(jdmOwner, JDM), null);
  assert.equal(packOwnership(jdmOwner, 'jdm-legends'), 'owned');
  assert.equal(packOwnership(jdmOwner, 'italian-exotics'), 'not-owned');
  assert.equal(canInstallPack(jdmOwner, 'italian-exotics'), false);
  const custom = { custom: true, tier: 'free' as const, packId: null };
  assert.equal(engineLock(free, custom), 'studio');
  assert.equal(engineLock(pro, custom), null);
  assert.equal(engineLock(pro, { ...custom, borrows: { tier: 'pack', packId: 'jdm-legends' } }), 'pack', 'borrowed pack sound stays locked');
});

test('try before buy: locked engine plays in Demo, GPS uses the fallback, selection is kept', () => {
  assert.deepEqual(effectiveEngine(free, { id: 'm297zonda', requirement: PRO_ENGINE }, 'demo', 'gt3flat6'), { id: 'm297zonda', locked: true, preview: true });
  assert.deepEqual(effectiveEngine(free, { id: 'm297zonda', requirement: PRO_ENGINE }, 'gps', 'k20a'), { id: 'k20a', locked: true, preview: false });
  assert.deepEqual(effectiveEngine(pro, { id: 'm297zonda', requirement: PRO_ENGINE }, 'gps', 'k20a'), { id: 'm297zonda', locked: false, preview: false });
  assert.deepEqual(effectiveEngine(free, { id: 'k20a', requirement: FREE_ENGINE }, 'gps', 'gt3flat6'), { id: 'k20a', locked: false, preview: false });
});

test('basic sound model removes the advanced layers only', () => {
  const p = testProfile({ aspiration: 'twin-turbo' });
  p.audio = { ...p.audio, overrunPops: 0.8, shiftBark: 1, blowoff: 0.7, supercharger: 0.4 };
  const b = basicSoundModel(p);
  assert.equal(b.audio.overrunPops, 0);
  assert.equal(b.audio.blowoff, 0);
  assert.equal(b.audio.turbo, 0, 'explicit 0 overrides the turbo default');
  assert.equal(b.audio.supercharger, 0);
  assert.equal(b.audio.shiftBark, BASIC_SHIFT_BARK);
  assert.equal(b.audio.volume, p.audio.volume);
  assert.equal(b.gearbox, p.gearbox);
  assert.equal(p.audio.overrunPops, 0.8, 'input not mutated');
});
