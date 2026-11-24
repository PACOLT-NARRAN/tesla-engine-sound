import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderVoiceLoop, voiceSeed } from '../src/audio/placeholder/voiceSynth.ts';
import { VOICES, getVoice } from '../src/audio/placeholder/voices.ts';
import { FUN_CATALOG, FUN_PROFILES } from '../src/profiles/funEngines.ts';
import { validateProfile } from '../src/profiles/schema.ts';
import { ENGINE_PACKS } from '../src/profiles/packs.ts';

const SR = 32000;

test('fun packs: every engine is a valid profile with a known voice and a pack', () => {
  const packIds = new Set(ENGINE_PACKS.map((p) => p.id));
  for (const p of FUN_PROFILES) {
    validateProfile(p, p.id);
    assert.ok(getVoice(p.audio.voice), `${p.id} voice ${p.audio.voice}`);
  }
  for (const c of FUN_CATALOG) assert.ok(c.packId && packIds.has(c.packId), `${c.id} pack ${c.packId}`);
  const crazy = FUN_CATALOG.filter((c) => c.packId === 'crazy').length;
  assert.ok(crazy >= 10, `crazy pack has ${crazy} engines`);
  for (const id of ['two-stroke', 'retro-junkyard', 'motorbikes', 'aircraft', 'locomotives']) {
    assert.ok(FUN_CATALOG.filter((c) => c.packId === id).length >= 5, id);
  }
});

test('voice synth: every voice renders clean, audible, seamless loops on every band', () => {
  const t0 = Date.now();
  for (const p of FUN_PROFILES) {
    const r = VOICES[p.audio.voice as string]!;
    const n = r.bands ?? 7;
    for (let i = 0; i < n; i++) {
      const norm = i / (n - 1);
      const rpm = p.idleRPM * Math.pow(p.limiterRPM / p.idleRPM, norm);
      for (const on of [true, false]) {
        const { data, rpm: real } = renderVoiceLoop(r, rpm, norm, on, SR, voiceSeed(p.audio.voice as string, i, on));
        const tag = `${p.id} band ${i} ${on ? 'on' : 'off'}`;
        assert.ok(Math.abs(real / rpm - 1) < 0.05, `${tag}: rpm ${real} vs ${rpm}`);
        assert.ok(data.length >= SR * 0.1 && data.length <= SR * 3, `${tag}: length ${data.length}`);
        let peak = 0, sum = 0, maxStep = 0;
        for (let k = 0; k < data.length; k++) {
          const v = data[k] as number;
          assert.ok(Number.isFinite(v), `${tag}: NaN`);
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          if (k > 0) maxStep = Math.max(maxStep, Math.abs(v - (data[k - 1] as number)));
        }
        const rms = Math.sqrt(sum / data.length);
        assert.ok(peak <= 1, `${tag}: peak ${peak}`);
        assert.ok(rms > 0.02, `${tag}: too quiet (rms ${rms.toFixed(4)})`);
        // The loop seam must look like any other step inside the loop (no click).
        const seam = Math.abs((data[0] as number) - (data[data.length - 1] as number));
        assert.ok(seam <= maxStep * 1.05 + 1e-6, `${tag}: seam ${seam.toFixed(4)} > max step ${maxStep.toFixed(4)}`);
      }
    }
  }
  console.log(`rendered ${FUN_PROFILES.length} fun engines in ${Date.now() - t0} ms`);
});

// --- PRO: edit any engine -------------------------------------------------------------------------
import { buildCustomProfile, duplicateSpec, sanitizeSpec, specFromProfile } from '../src/studio/customEngine.ts';

test('PRO edit: a built-in edit keeps its "overrides" link; a copy never does', () => {
  const fun = FUN_PROFILES.find((p) => p.id === 'fun-vtwin')!;
  const spec = { ...specFromProfile(fun, 'V-TWIN CRUISER 1.9', 1000), overrides: fun.id };
  assert.deepEqual(spec.sound, { kind: 'bank', bankId: 'fun-vtwin' });
  const stored = sanitizeSpec(JSON.parse(JSON.stringify(spec)));
  assert.equal(stored?.overrides, 'fun-vtwin');
  assert.equal(sanitizeSpec({ ...spec, overrides: 'custom-abc' })?.overrides, undefined, 'cannot override another custom engine');
  assert.equal(duplicateSpec(spec, 'MY COPY', 2000).overrides, undefined);
});

test('PRO edit: borrowing a fun-pack sound keeps its synth voice', () => {
  const fun = FUN_PROFILES.find((p) => p.id === 'fun-steam')!;
  const spec = specFromProfile(fun, 'MY STEAM', 1000);
  const prof = buildCustomProfile({ ...spec, idleRPM: 800 }, fun);
  assert.equal(prof.audio.voice, 'steam');
  assert.equal(prof.audio.converted, false);
  assert.equal(prof.source.soundName, 'fun-steam');
});
