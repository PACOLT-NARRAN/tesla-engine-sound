import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicBrain, type MusicInputs, type MusicNote } from '../src/audio/music/musicBrain.ts';
import { MUSIC_STYLES, getMusicStyle } from '../src/audio/music/musicStyles.ts';
import { MUSIC_PACK_IDS } from '../src/audio/music/tracks.ts';
import { SONGS } from '../src/audio/music/songData.ts';
import { noteToMidi, parseChord, parseSong } from '../src/audio/music/songs.ts';
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

test('music packs: 10 drive-music styles, 10+ tracks per genre pack, 15+ Christmas carols', () => {
  const packIds = new Set(ENGINE_PACKS.map((p) => p.id));
  for (const p of MUSIC_PROFILES) assert.ok(getMusicStyle(p.audio.music), p.id);
  for (const c of MUSIC_CATALOG) assert.ok(c.packId && packIds.has(c.packId), `${c.id} pack ${c.packId}`);
  const count = (id: string) => MUSIC_CATALOG.filter((c) => c.packId === id).length;
  assert.equal(count('drive-music'), 10);
  assert.ok(count('christmas') >= 15, `christmas ${count('christmas')}`);
  for (const id of MUSIC_PACK_IDS) if (id !== 'drive-music' && id !== 'christmas') assert.ok(count(id) >= 10, `${id} ${count(id)}`);
  assert.equal(new Set(MUSIC_PROFILES.map((p) => p.id)).size, MUSIC_PROFILES.length, 'unique ids');
  for (const id of ['music-synthwave', 'music-techno', 'music-lofi', 'music-ambient', 'music-epic']) assert.ok(MUSIC_PROFILES.some((p) => p.id === id), id);
});

test('every written song parses, its melody fills whole bars and matches its chords', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    const p = parseSong(song);
    let pos = 0;
    for (const tok of song.melody.trim().split(/\s+/)) pos += Number(tok.split('.')[1]);
    assert.equal(pos, p.bars.length * p.stepsPerBar, `${name}: melody ${pos / p.stepsPerBar} bars vs ${p.bars.length} chord bars`);
    for (const n of p.notes) assert.ok(n.midi >= 40 && n.midi <= 96, `${name} note ${n.midi}`);
  }
  assert.deepEqual(parseChord('F#m7').tones.map((m) => m % 12).sort((a, b) => a - b), [1, 4, 6, 9]);
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('Bb3'), 58);
});

test('gears add instruments: counter-line, bells, choir, harmony; upshift plays a fanfare', () => {
  const b = new MusicBrain(getMusicStyle('synthwave')!, 4);
  const t = { now: 0 };
  b.begin(0);
  const g1 = run(b, t, 8, { speed: 50 / 3.6, gear: 1, accel: 1.5 });
  assert.ok(!kinds(g1).has('counter') && !kinds(g1).has('choir'));
  b.shift('up');
  const up = run(b, t, 1, { speed: 50 / 3.6, gear: 2, accel: 1.5 });
  assert.ok(up.filter((n) => n.inst === 'fanfare').length === 4, 'four-note fanfare');
  const g6 = run(b, t, 10, { speed: 90 / 3.6, gear: 6, accel: 2.5 });
  for (const k of ['counter', 'choir', 'harmony', 'bell'] as const) assert.ok(kinds(g6).has(k), `gear 6 has ${k}`);
  assert.equal(b.layers.gearVoices, 5);
});

test('songs play their written melody from the first bar', () => {
  const b = new MusicBrain(getMusicStyle('xm-jingle')!, 1);
  const t = { now: 0 };
  b.begin(0);
  const lead = run(b, t, 3, {}).filter((n) => n.inst === 'lead').map((n) => n.midi);
  assert.deepEqual(lead.slice(0, 7), [76, 76, 76, 76, 76, 76, 76], 'jingle bells, jingle bells');
});

test('metalcore: braking turns the riff into a breakdown', () => {
  const b = new MusicBrain(getMusicStyle('mc-breakdown')!, 1);
  const t = { now: 0 };
  b.begin(0);
  const drive = run(b, t, 8, { speed: 80 / 3.6, gear: 4 });
  assert.ok(drive.some((n) => n.inst === 'guitar' || n.inst === 'power'), 'riffs while driving');
  run(b, t, 2.5, { speed: 60 / 3.6, accel: -4, gear: 3 });
  assert.ok(b.layers.halfTime, 'breakdown');
});

for (const style of MUSIC_STYLES) {
  test(`${style.id}: standstill is calm, motorway is full, notes are valid`, () => {
    const b = new MusicBrain(style, 3);
    const t = { now: 0 };
    b.begin(0);
    const calm = run(b, t, 8, {});
    assert.ok(calm.some((n) => n.inst === 'pad' || n.inst === 'lead' || n.inst === 'bell' || n.inst === 'arp'), 'something plays at standstill');
    assert.ok(!kinds(calm).has('kick') && !kinds(calm).has('snare'), 'no drums at standstill');
    const bpmStill = b.bpm;
    const fast = run(b, t, 25, { speed: 130 / 3.6 });
    const k = kinds(fast.slice(-200));
    assert.ok((k.has('bass') || k.has('rbass')) && k.has('arp') && (style.drumThreshold > 1 || k.has('kick')), `full layers at speed: ${[...k]}`);
    assert.ok(b.bpm > bpmStill + (style.bpm[1] - style.bpm[0]) * 0.5, `tempo rises ${bpmStill} -> ${b.bpm}`);
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
