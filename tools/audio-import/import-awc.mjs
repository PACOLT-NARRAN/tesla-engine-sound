#!/usr/bin/env node
/**
 * GTA V / FiveM engine sound bank (.awc) -> browser-ready RPM-band loops.
 *
 *   1. copy originals          qb-changesound/sfx/dlc_<id>/*.awc + audioconfig/<id>_*  -> audio-source/original/<id>/
 *   2. decode AWC -> WAV       vgmstream-cli (or point --wav-dir at WAVs exported with CodeWalker)
 *   3. report streams          audio-source/decoded/<id>/streams.json
 *   4. map streams             tools/audio-import/mapping/<id>.json (written as a guess on first run)
 *   5. cut seamless loops      de-chirp the sweep at each band RPM, then one on + one off loop per band
 *   6. encode                  ffmpeg -> Opus/WebM (or AAC/M4A, or plain WAV)
 *   7. publish                 public/audio/<id>/*.webm + manifest.json, and set audio.converted=true
 *
 * Usage:
 *   node tools/audio-import/import-awc.mjs --repo ../qb-changesound --engine k20a
 *   node tools/audio-import/import-awc.mjs --repo ../qb-changesound --all
 *   node tools/audio-import/import-awc.mjs --engine k20a --wav-dir ./exports/k20a     (WAVs from CodeWalker)
 * Options: --codec opus|aac|wav  --bitrate 96k  --bands 8  --loop 0.45  --accept-guess
 *          --vgmstream <path>  --ffmpeg <path>  --remap (rebuild the mapping from the AWC metadata)
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, toMono, writeWav16 } from './lib/wav.mjs';
import { doubleLoop, extractLoop, flattenSweep, logSpaced, mix, ncc, normalize, rms, rpmForTime, timeForRpm } from './lib/loops.mjs';
import { grainCurve, meanCycleS, readAwc, readNametable, resolveStreamNames, roleOf } from './lib/awc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILES = join(ROOT, 'src/profiles/engines');
const MAPPINGS = join(ROOT, 'tools/audio-import/mapping');
const SOURCE = join(ROOT, 'audio-source');
const PUBLIC = join(ROOT, 'public/audio');

function parseArgs(argv) {
  const a = { codec: 'opus', bitrate: '96k', bands: 8, loop: 0.45, vgmstream: 'vgmstream-cli', ffmpeg: 'ffmpeg' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--repo') a.repo = resolve(next());
    else if (k === '--engine') a.engine = next();
    else if (k === '--all') a.all = true;
    else if (k === '--wav-dir') a.wavDir = resolve(next());
    else if (k === '--codec') a.codec = next();
    else if (k === '--bitrate') a.bitrate = next();
    else if (k === '--bands') a.bands = Number(next());
    else if (k === '--loop') a.loop = Number(next());
    else if (k === '--vgmstream') a.vgmstream = next();
    else if (k === '--ffmpeg') a.ffmpeg = next();
    else if (k === '--accept-guess') a.acceptGuess = true;
    else if (k === '--remap') a.remap = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Unknown option ${k}`);
  }
  return a;
}

const log = (...m) => console.log('[audio-import]', ...m);

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) {
    if (allowFail) return null;
    throw new Error(`Cannot run "${cmd}": ${r.error.message}. Install it or pass its path (see docs/AUDIO_PIPELINE.md).`);
  }
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r;
}

function profileFor(id) {
  const p = join(PROFILES, `${id}.json`);
  if (!existsSync(p)) throw new Error(`No profile src/profiles/engines/${id}.json`);
  return { path: p, data: JSON.parse(readFileSync(p, 'utf8')) };
}

// 1) Preserve originals -------------------------------------------------------
function copyOriginals(repo, id) {
  const dest = join(SOURCE, 'original', id);
  mkdirSync(dest, { recursive: true });
  const sfx = join(repo, 'sfx', `dlc_${id}`);
  if (!existsSync(sfx)) throw new Error(`Missing ${sfx}`);
  for (const f of readdirSync(sfx)) copyFileSync(join(sfx, f), join(dest, f));
  const ac = join(repo, 'audioconfig');
  if (existsSync(ac)) for (const f of readdirSync(ac)) if (f.startsWith(`${id}_`)) copyFileSync(join(ac, f), join(dest, f));
  const awc = join(dest, `${id}.awc`);
  if (!existsSync(awc)) throw new Error(`Missing player bank ${id}.awc in ${sfx}`);
  return awc;
}

// 2) Decode AWC -> WAV via vgmstream -----------------------------------------
function decodeAwc(awc, outDir, vgm) {
  mkdirSync(outDir, { recursive: true });
  const meta = run(vgm, ['-m', awc]).stdout;
  const count = Number(/stream count:\s*(\d+)/i.exec(meta)?.[1] ?? 1);
  log(`${basename(awc)}: ${count} stream(s)`);
  for (let s = 1; s <= count; s++) {
    // -i: ignore loop points (export the stream once), -s: subsong index (1-based)
    run(vgm, ['-i', '-s', String(s), '-o', join(outDir, `stream_${String(s).padStart(2, '0')}.wav`), awc]);
  }
}

// 3) Stream report -------------------------------------------------------------
function describeStreams(dir) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav')).sort();
  if (files.length === 0) throw new Error(`No WAV files in ${dir}`);
  return files.map((file, index) => {
    const w = readWav(join(dir, file));
    const mono = toMono(w);
    return { index, file, sampleRate: w.sampleRate, channels: w.channels.length, durationS: +(mono.length / w.sampleRate).toFixed(3), rms: +rms(mono).toFixed(4) };
  });
}

// 3b) AWC metadata: stream names (hash lookup) and granular RPM data -------------
function awcMeta(id) {
  const dir = join(SOURCE, 'original', id);
  const awcPath = join(dir, `${id}.awc`);
  if (!existsSync(awcPath)) return null;
  try {
    const awc = readAwc(awcPath);
    const names = readdirSync(dir).filter((f) => f.endsWith('.nametable')).flatMap((f) => readNametable(join(dir, f)));
    const resolved = resolveStreamNames(awc, id, names);
    return awc.streams.map((s) => ({ index: s.index, name: resolved.get(s.index) ?? null, role: roleOf(resolved.get(s.index)), sampleRate: s.sampleRate, grains: s.grains }));
  } catch (e) {
    log(`${id}: could not read AWC metadata (${e.message}) — falling back to a guess`);
    return null;
  }
}

/** Mapping built from the game's own metadata: which stream is which, and its exact RPM curve. */
function autoMapping(profile, streams, meta) {
  const find = (role) => meta.find((m) => m.role === role);
  const sweep = (role, gain) => {
    const m = find(role);
    const sr = streams[m?.index]?.sampleRate ?? m?.sampleRate;
    const curve = m && sr ? grainCurve(m.grains, sr) : null;
    return curve ? { stream: m.index, name: m.name, gain, curve } : null;
  };
  const on = [sweep('exhaust_accel', 1), sweep('engine_accel', 1)].filter(Boolean);
  const off = [sweep('exhaust_decel', 1), sweep('engine_decel', 1)].filter(Boolean);
  if (on.length === 0 || off.length === 0) return null;
  const idleM = find('exhaust_idle') ?? find('engine_idle');
  const cycleS = idleM ? meanCycleS(idleM.grains) : null;
  // The game layers engine_idle under exhaust_idle; mix it in when both exist.
  const idleE = idleM?.role === 'exhaust_idle' ? find('engine_idle') : undefined;
  const cycleE = idleE ? meanCycleS(idleE.grains) : null;
  const all = (role) => meta.filter((m) => m.role === role).map((m) => ({ stream: m.index, name: m.name }));
  const one = (role) => { const m = find(role); return m ? { stream: m.index, name: m.name } : undefined; };
  return {
    profileId: profile.id,
    verified: true,
    source: 'awc-metadata',
    note: 'Generated from the AWC stream names and granular grain data (rpm = 120 x grain Hz). Edit freely; re-run with --remap to regenerate.',
    on: { streams: on },
    off: { streams: off },
    ...(idleM && cycleS
      ? { idle: { stream: idleM.index, name: idleM.name, cycleS: +cycleS.toFixed(6), ...(idleE && cycleE ? { with: { stream: idleE.index, name: idleE.name, cycleS: +cycleE.toFixed(6), gain: 0.9 } } : {}) } }
      : {}),
    pops: all('pop'),
    blowoff: all('blowoff'),
    ...(one('startup') ? { startup: one('startup') } : {}),
    ...(one('shutdown') ? { shutdown: one('shutdown') } : {}),
    unused: meta.filter((m) => ['door', 'wastegate', 'extra', 'unknown', 'engine_idle'].includes(m.role) && m.index !== idleM?.index && m.index !== idleE?.index).map((m) => ({ stream: m.index, name: m.name, role: m.role })),
  };
}

/**
 * Idle loop made of two recordings with unrelated cycle lengths (exhaust + engine idle).
 * Picks a loop length that is (almost) a whole number of cycles of both, extracts each
 * seamless loop, stretches the second by the tiny remaining mismatch and sums them.
 */
function buildIdleMix(decodedDir, streams, idle, xa, sr) {
  const ca = idle.cycleS;
  const cb = idle.with.cycleS;
  const b = loadPart(decodedDir, streams, { streams: [{ stream: idle.with.stream, gain: 1, curve: [[0, 1000], [1e6, 1001]] }] });
  const xb = b[0].x;
  // Both loops must fit inside their recordings (with room for the seam search and crossfade).
  const maxS = Math.min(1.6, xa.length / sr - 0.2, xb.length / sr - 0.2);
  let best = null;
  for (let na = 2; na * ca * 1.07 <= maxS; na++) {
    if (na * ca < 0.35) continue;
    const nb = Math.max(1, Math.round((na * ca) / cb));
    const err = Math.abs(na * ca - nb * cb) / (na * ca);
    if (!best || err < best.err) best = { na, nb, err };
  }
  if (!best) return null;
  const la = extractLoop(xa, sr, { centerS: xa.length / sr / 2, rpm: 120 / ca, targetS: best.na * ca });
  const lb = extractLoop(xb, sr, { centerS: xb.length / sr / 2, rpm: 120 / cb, targetS: best.nb * cb });
  const A = normalize(la.samples);
  const B = normalize(lb.samples);
  const L = la.length;
  const out = new Float32Array(L);
  const g = idle.with.gain ?? 0.9;
  for (let i = 0; i < L; i++) {
    const pos = (i * lb.length) / L;
    const k = Math.floor(pos);
    const f = pos - k;
    const vb = B[k % lb.length] * (1 - f) + B[(k + 1) % lb.length] * f;
    out[i] = A[i] + g * vb;
  }
  return { samples: out, start: 0, length: L, score: Math.min(la.score, lb.score) };
}

// 4) Mapping -------------------------------------------------------------------
function guessMapping(profile, streams) {
  const byLen = [...streams].sort((a, b) => b.durationS - a.durationS);
  const pick = (k) => (byLen[k] ?? byLen[0]).index;
  return {
    profileId: profile.id,
    verified: false,
    note: 'AUTO-GENERATED GUESS. Listen to audio-source/decoded/<id>/*.wav, then set which streams are the on-load (accel) and off-load (decel) RPM sweeps, the RPM they start/end at, and set verified=true.',
    on: { streams: [pick(0), pick(1)].filter((v, i, a) => a.indexOf(v) === i), gains: [1, 0.85], rpmStart: profile.idleRPM, rpmEnd: profile.limiterRPM, curve: null },
    off: { streams: [pick(2), pick(3)].filter((v, i, a) => a.indexOf(v) === i), gains: [1, 0.85], rpmStart: profile.idleRPM, rpmEnd: profile.limiterRPM, curve: null },
    pops: [],
  };
}

// 5-7) Loops, encode, publish ---------------------------------------------------
function encode(ffmpeg, wavPath, codec, bitrate) {
  if (codec === 'wav') return basename(wavPath);
  const ext = codec === 'aac' ? 'm4a' : 'webm';
  const out = wavPath.replace(/\.wav$/, `.${ext}`);
  const args = codec === 'aac'
    ? ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-c:a', 'aac', '-b:a', bitrate, out]
    : ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-c:a', 'libopus', '-b:a', bitrate, '-application', 'audio', out];
  run(ffmpeg, args);
  rmSync(wavPath);
  return basename(out);
}

/**
 * A mapping part ("on"/"off") lists its source streams. Each entry is either a stream index (all
 * streams share the part's rpmStart/rpmEnd/curve and are mixed sample-aligned), or an object
 * { stream, gain, curve, skip } with its own RPM curve: each stream is then de-chirped separately at
 * the band RPM and the constant-RPM results are mixed. `skip` lists [t0, t1] regions (seconds) that
 * contain no usable engine tone (e.g. a gear-change noise burst).
 */
function loadPart(dir, streams, part) {
  return part.streams.map((entry, k) => {
    const e = typeof entry === 'number' ? { stream: entry } : entry;
    const s = streams[e.stream];
    if (!s) throw new Error(`Mapping references stream ${e.stream}, which does not exist`);
    const x = toMono(readWav(join(dir, s.file)));
    const durationS = x.length / s.sampleRate;
    const model = { durationS, rpmStart: e.rpmStart ?? part.rpmStart, rpmEnd: e.rpmEnd ?? part.rpmEnd, curve: e.curve ?? part.curve };
    return { x, sr: s.sampleRate, durationS, model, gain: e.gain ?? part.gains?.[k] ?? 1, skip: e.skip ?? [] };
  });
}

/** RPM range [min, max] a stream's model covers. */
function coveredRange(model) {
  const pts = model.curve && model.curve.length >= 2 ? model.curve : [[0, model.rpmStart], [model.durationS, model.rpmEnd]];
  const r = pts.map((p) => p[1]);
  return [Math.min(...r), Math.max(...r)];
}

/** One stream de-chirped to a constant `rpm`, `outS` long. Out-of-range RPMs are reached by resampling the nearest end. */
function flatAt(src, rpm, outS) {
  const [lo, hi] = coveredRange(src.model);
  const edge = Math.min(hi, Math.max(lo, rpm));
  let t = timeForRpm(edge, src.model);
  // Keep the whole read window inside the stream (source time used ~= outS * rpm / edge).
  const half = (outS * Math.max(1, rpm / edge)) / 2 + 0.02;
  t = Math.min(src.durationS - half, Math.max(half, t));
  for (const [a, b] of src.skip) if (t > a - half && t < b + half) return null;
  return flattenSweep(src.x, src.sr, { centerS: t, rpm, outS, rpmAt: (tt) => rpmForTime(tt, src.model) });
}

/** Mix the de-chirped streams of a part at `rpm`. */
function partAt(srcs, rpm, outS) {
  let flats = [];
  for (const src of srcs) {
    const f = flatAt(src, rpm, outS);
    if (f && f.length > 0) flats.push({ f: normalize(f), gain: src.gain, score: periodicity(f, src.sr, rpm) });
  }
  // Drop a source that is not periodic here (e.g. a gear-change noise burst) if another one is.
  const best = Math.max(...flats.map((v) => v.score));
  if (best > 0.5) flats = flats.filter((v) => v.score >= Math.max(0.35, best - 0.3));
  if (flats.length === 0) throw new Error(`No usable stream at ${rpm} rpm`);
  return mix(flats.map((v) => v.f), flats.map((v) => v.gain));
}

/** How periodic a de-chirped signal is at one engine cycle (normalised correlation, 1 = perfectly). */
function periodicity(x, sr, rpm) {
  const cycle = Math.round((120 / rpm) * sr);
  const n = Math.min(Math.round(0.1 * sr), x.length - cycle - 1);
  if (n < cycle / 2) return 0;
  let best = 0;
  for (let d = -3; d <= 3; d++) best = Math.max(best, ncc(x, 0, cycle + d, n));
  return best;
}

/** A one-shot effect: whole stream (or start..end), silence trimmed, faded out, normalised. */
function oneShot(dir, streams, e, peak = 0.9) {
  const s = streams[e.stream];
  if (!s) throw new Error(`Mapping references stream ${e.stream}, which does not exist`);
  let x = toMono(readWav(join(dir, s.file)));
  if (e.start !== undefined || e.end !== undefined) x = x.slice(Math.round((e.start ?? 0) * s.sampleRate), Math.round((e.end ?? x.length / s.sampleRate) * s.sampleRate));
  let maxAbs = 0;
  for (const v of x) maxAbs = Math.max(maxAbs, Math.abs(v));
  const floor = maxAbs * 0.003; // -50 dB
  let a = 0;
  let b = x.length;
  while (a < b && Math.abs(x[a]) < floor) a++;
  while (b > a && Math.abs(x[b - 1]) < floor) b--;
  const out = x.slice(a, b);
  const fade = Math.min(out.length, Math.round(0.02 * s.sampleRate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  const g = maxAbs > 0 ? peak / maxAbs : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return { samples: out, sampleRate: s.sampleRate };
}

function importEngine(args, id) {
  const { path: profilePath, data: profile } = profileFor(id);
  const decodedDir = args.wavDir ?? join(SOURCE, 'decoded', id);

  if (!args.wavDir && !args.repo) throw new Error('Pass --repo <path to qb-changesound> (or --wav-dir with pre-exported WAVs)');
  if (args.repo) {
    const awc = copyOriginals(args.repo, id);
    if (!args.wavDir) decodeAwc(awc, decodedDir, args.vgmstream);
  }

  const streams = describeStreams(decodedDir);
  const meta = awcMeta(id);
  if (meta) for (const s of streams) Object.assign(s, { name: meta[s.index]?.name ?? null, role: meta[s.index]?.role ?? 'unknown' });
  writeFileSync(join(decodedDir, 'streams.json'), JSON.stringify(streams, null, 2));
  log(`${id}: streams`, streams.map((s) => `#${s.index} ${s.file} ${s.durationS}s${s.name ? ` ${s.name}` : ''}`).join(', '));

  mkdirSync(MAPPINGS, { recursive: true });
  const mapPath = join(MAPPINGS, `${id}.json`);
  if (!existsSync(mapPath) || args.remap) {
    const auto = meta ? autoMapping(profile, streams, meta) : null;
    writeFileSync(mapPath, JSON.stringify(auto ?? guessMapping(profile, streams), null, 2) + '\n');
    log(`${id}: wrote ${auto ? 'mapping from AWC metadata' : 'mapping GUESS'} ${mapPath}`);
  }
  const mapping = JSON.parse(readFileSync(mapPath, 'utf8'));
  if (!mapping.verified && !args.acceptGuess) {
    log(`${id}: STOP — review ${mapPath} and set "verified": true (or re-run with --accept-guess).`);
    return false;
  }

  const parts = { on: loadPart(decodedDir, streams, mapping.on), off: loadPart(decodedDir, streams, mapping.off) };
  // Idle: either a recording at a known rpm ({stream, rpm}) or one played at its native pitch at the idle band ({stream, cycleS}).
  const idleRpm = mapping.idle ? (mapping.idle.rpm ?? profile.idleRPM) : 0;
  const idle = mapping.idle ? loadPart(decodedDir, streams, { streams: [{ stream: mapping.idle.stream, gain: 1, curve: [[0, idleRpm], [1e6, idleRpm + 1]] }] }) : null;
  const sr = parts.on[0].sr;
  if ([...parts.on, ...parts.off, ...(idle ?? [])].some((p) => p.sr !== sr)) throw new Error('Mapped streams must share a sample rate');
  const outDir = join(PUBLIC, id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const idleMixLoop = idle && mapping.idle.cycleS && mapping.idle.with ? buildIdleMix(decodedDir, streams, mapping.idle, idle[0].x, sr) : null;
  if (idleMixLoop) log(`${id}: idle = ${mapping.idle.name} + ${mapping.idle.with.name} (${(idleMixLoop.length / sr).toFixed(3)} s loop)`);
  const rpms = logSpaced(profile.idleRPM, profile.limiterRPM, args.bands);
  const outS = args.loop * 2 + 0.1;
  const bands = [];
  for (const rpm of rpms) {
    const entry = { rpm };
    const native = idle && mapping.idle.cycleS && rpm <= idleRpm * (mapping.idle.upTo ?? 1.1);
    const useIdle = idle && rpm <= idleRpm * (mapping.idle.upTo ?? (mapping.idle.cycleS ? 1.1 : 1.25));
    for (const name of ['on', 'off']) {
      let x;
      let loopRpm = rpm;
      if (native && idleMixLoop) {
        x = null;
      } else if (native) {
        x = idle[0].x;
        loopRpm = 120 / mapping.idle.cycleS; // loop a whole number of the recording's own cycles
      } else {
        x = useIdle ? partAt(idle, rpm, outS) : partAt(parts[name], rpm, outS);
      }
      const loop = x === null ? idleMixLoop : extractLoop(x, sr, { centerS: x.length / sr / 2, rpm: loopRpm, targetS: args.loop });
      const samples = doubleLoop(normalize(loop.samples));
      const wav = join(outDir, `${name}_${rpm}.wav`);
      writeWav16(wav, samples, sr);
      const file = encode(args.ffmpeg, wav, args.codec, args.bitrate);
      const L = loop.length / sr;
      // Loop the middle period of the doubled file: immune to codec priming/padding.
      entry[name] = { file, loopStart: +(L * 0.5).toFixed(6), loopEnd: +(L * 1.5).toFixed(6) };
      if (loop.score < 0.6) log(`${id}: ${name}@${rpm} weak periodicity (score ${loop.score.toFixed(2)}) — check RPM mapping`);
    }
    bands.push(entry);
  }

  const shot = (e, name, peak) => {
    const o = oneShot(decodedDir, streams, e, peak);
    const wav = join(outDir, `${name}.wav`);
    writeWav16(wav, o.samples, o.sampleRate);
    return encode(args.ffmpeg, wav, args.codec, args.bitrate);
  };
  const pops = (mapping.pops ?? []).map((p, k) => shot(p, `pop_${k}`, 0.6));
  const blowoff = (mapping.blowoff ?? []).map((p, k) => shot(p, `blowoff_${k}`, 0.6));
  const startup = mapping.startup ? shot(mapping.startup, 'startup', 0.8) : null;
  const shutdown = mapping.shutdown ? shot(mapping.shutdown, 'shutdown', 0.8) : null;
  if (mapping.pops?.length) log(`${id}: ${pops.length} pop(s), ${blowoff.length} blow-off, startup ${startup ? 'yes' : 'no'}, shutdown ${shutdown ? 'yes' : 'no'}`);

  const manifest = { version: 1, profileId: id, source: profile.source.awc, generatedAt: new Date().toISOString(), codec: args.codec, bands, ...(pops.length ? { pops } : {}), ...(blowoff.length ? { blowoff } : {}), ...(startup ? { startup } : {}), ...(shutdown ? { shutdown } : {}) };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  profile.audio.converted = true;
  profile.audio.manifest = `audio/${id}/manifest.json`;
  writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
  log(`${id}: wrote ${bands.length} bands to public/audio/${id}/ and marked the profile as converted`);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.engine && !args.all)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).join('\n'));
    return;
  }
  if (!['opus', 'aac', 'wav'].includes(args.codec)) throw new Error('--codec must be opus, aac or wav');
  if (args.codec !== 'wav') run(args.ffmpeg, ['-version']);
  const ids = args.all ? readdirSync(PROFILES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [args.engine];
  let ok = 0;
  for (const id of ids) {
    try {
      if (importEngine(args, id)) ok++;
    } catch (e) {
      console.error(`[audio-import] ${id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  log(`done: ${ok}/${ids.length} converted`);
}

main();
