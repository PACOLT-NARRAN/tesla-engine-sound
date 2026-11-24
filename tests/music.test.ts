import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicBrain, type MusicInputs, type MusicNote } from '../src/audio/music/musicBrain.ts';
import { MUSIC_STYLES, getMusicStyle } from '../src/audio/music/musicStyles.ts';
import { MUSIC_CATALOG, MUSIC_PROFILES } from '../src/profiles/musicEngines.ts';
import { ENGINE_PACKS } from '../src/profiles/packs.ts';
import { MotionEstimator } from '../src/motion/MotionEstimator.ts';
import { offsetHeading } from '../src/utils/geo.ts';

const DT = 0.02;

/** Drive the brain for `secs` with constant inputs; returns the notes produced. */
function run(b: MusicBrain, t: { now: number }, secs: number, i: Partial<MusicInputs>): MusicNote[] {
  const inp: MusicInputs = { speed: 0, accel: 0, turnRate: 0, revPedal: false, nitro: false, ...i };
  const out: MusicNote[] = [];
  for (let s = 0; s < secs; s += DT) {
    t.now += DT;
    b.setInputs(inp, DT);
    out.push(...b.schedule(t.now, t.now + 0.35));
  }
  return out;
}

const kinds = (ns: MusicNote[]) => new Set(ns.map((n) => n.inst));

test('every music engine has a known style and belongs to the drive-music pack', () => {
  assert.ok(ENGINE_PACKS.some((p) => p.id === 'drive-music'));
  assert.equal(MUSIC_PROFILES.length, 5);
  for (const p of MUSIC_PROFILES) assert.ok(getMusicStyle(p.audio.music), p.id);
  for (const c of MUSIC_CATALOG) assert.equal(c.packId, 'drive-music');
});

for (const style of MUSIC_STYLES) {
  test(`${style.id}: standstill is calm, motorway is full, notes are valid`, () => {
    const b = new MusicBrain(style, 3);
    const t = { now: 0 };
    b.begin(0);
    const calm = run(b, t, 8, {});
    assert.ok(calm.some((n) => n.inst === 'pad'), 'pad at standstill');
    assert.ok(!kinds(calm).has('kick') && !kinds(calm).has('snare'), 'no drums at standstill');
    const bpmStill = b.bpm;
    const fast = run(b, t, 25, { speed: 130 / 3.6 });
    const k = kinds(fast.slice(-200));
    assert.ok(k.has('bass') && k.has('kick') && k.has('arp'), `full layers at speed: ${[...k]}`);
    assert.ok(b.bpm > bpmStill + 10, `tempo rises ${bpmStill} -> ${b.bpm}`);
    for (const n of [...calm, ...fast]) {
      assert.ok(Number.isFinite(n.time) && Number.isFinite(n.midi) && n.dur > 0 && n.vel >= 0 && n.vel <= 1 && Math.abs(n.pan) <= 1, JSON.stringify(n));
    }
    // Notes come in time order and are never scheduled in the past.
    for (let i = 1; i < fast.length; i++) assert.ok((fast[i]!.time) >= (fast[i - 1]!.time) - 0.2);
  });
}

test('acceleration adds energy and a melody; braking closes the filter and goes half-time', () => {
  const b = new MusicBrain(getMusicStyle('synthwave')!, 5);
  const t = { now: 0 };
  b.begin(0);
  run(b, t, 10, { speed: 50 / 3.6 });
  const cruiseCut = b.mix().cutoff;
  const push = run(b, t, 6, { speed: 60 / 3.6, accel: 3 });
  assert.ok(push.some((n) => n.inst === 'lead'), 'lead melody when pushing');
  assert.ok(b.mix().cutoff > cruiseCut, 'brighter when accelerating');
  run(b, t, 3, { speed: 40 / 3.6, accel: -4 });
  assert.ok(b.layers.halfTime, 'half-time while braking');
  assert.ok(b.mix().cutoff < cruiseCut * 0.5, `filter closes: ${b.mix().cutoff} vs ${cruiseCut}`);
});

test('steering pans the music and brings bells on the turning side', () => {
  const b = new MusicBrain(getMusicStyle('ambient')!, 9);
  const t = { now: 0 };
  b.begin(0);
  run(b, t, 6, { speed: 60 / 3.6 });
  const right = run(b, t, 6, { speed: 60 / 3.6, turnRate: 25 }).filter((n) => n.inst === 'bell');
  assert.ok(right.length > 3, 'bells in a right bend');
  assert.ok(right.every((n) => n.pan > 0), 'right bend = right side');
  assert.ok(b.mix().pan > 0.3);
  const left = run(b, t, 6, { speed: 60 / 3.6, turnRate: -25 }).filter((n) => n.inst === 'bell' && n.time > t.now - 3);
  assert.ok(left.length > 0 && left.every((n) => n.pan < 0), 'left bend = left side');
});

test('REV build-up then release drops the beat with a crash; upshift starts a new section', () => {
  const b = new MusicBrain(getMusicStyle('techno')!, 2);
  const t = { now: 0 };
  b.begin(0);
  const build = run(b, t, 3, { revPedal: true });
  assert.ok(b.riser > 0.5, 'riser builds');
  assert.ok(build.filter((n) => n.inst === 'snare').length > 6, 'snare roll');
  const drop = run(b, t, 3, {});
  assert.ok(drop.some((n) => n.inst === 'crash') && drop.some((n) => n.inst === 'kick'), 'drop: crash + kick');
  run(b, t, 10, { speed: 80 / 3.6 });
  b.shift('up');
  const after = run(b, t, 5, { speed: 80 / 3.6 });
  assert.ok(after.some((n) => n.inst === 'crash'), 'crash on the new section');
});

test('a scheduler that fell behind skips ahead instead of bursting', () => {
  const b = new MusicBrain(getMusicStyle('lofi')!, 1);
  b.begin(0);
  b.schedule(0, 0.35);
  const notes = b.schedule(30, 30.35);
  assert.ok(notes.every((n) => n.time >= 29.9), 'no stale notes');
});

test('MotionEstimator reports turn rate from GPS heading and from positions', () => {
  for (const withHeading of [true, false]) {
    const est = new MotionEstimator();
    let lat = 50.07;
    let lon = 14.43;
    let hdg = 0;
    const v = 15;
    for (let i = 0; i < 30; i++) {
      const ts = 1_000_000 + i * 1000;
      if (i >= 10) hdg = (hdg + 12) % 360; // turning right at 12 deg/s
      const p = offsetHeading(lat, lon, v, hdg);
      lat = p.lat;
      lon = p.lon;
      est.ingest({ timestamp: ts, latitude: lat, longitude: lon, accuracy: 4, speed: v, heading: withHeading ? hdg : null });
    }
    const m = est.sample(1_000_000 + 29 * 1000);
    assert.ok(m.turnRate > 8 && m.turnRate < 16, `turnRate ${m.turnRate} (heading=${withHeading})`);
  }
  const parked = new MotionEstimator();
  parked.ingest({ timestamp: 1, latitude: 50, longitude: 14, accuracy: 4, speed: 0, heading: 90 });
  assert.equal(parked.sample(1).turnRate, 0);
});
