// Reads the metadata of a GTA V / FiveM .awc audio bank: stream name hashes and granular grain data.
// Stream order matches the subsong order vgmstream uses (stream_01.wav = table entry 0).
import { readFileSync } from 'node:fs';

/** Jenkins one-at-a-time hash as used by RAGE (lower-cased input). */
export function joaat(s) {
  let h = 0;
  for (const c of Buffer.from(s.toLowerCase(), 'utf8')) {
    h = (h + c) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h;
}

/** AWC stream ids are the low 29 bits of joaat(name). */
export const awcId = (name) => joaat(name) & 0x1fffffff;

const CHUNK_DATA = 0x55;
const CHUNK_FORMAT = 0xfa;
const CHUNK_GRAINS = 0x5a;

/**
 * @returns {{ streams: Array<{ index: number, id: number, sampleRate: number|null, samples: number|null,
 *   grains: Array<{ sample: number, hz: number }>|null, hasData: boolean }> }}
 */
export function readAwc(path) {
  const b = readFileSync(path);
  if (b.toString('latin1', 0, 4) !== 'ADAT') throw new Error(`${path} is not an AWC file (or is encrypted)`);
  const flags = b.readUInt32LE(4);
  const n = b.readUInt32LE(8);
  let p = 16;
  if (flags & 0x10000) p += 2 * n;
  const infos = [];
  for (let i = 0; i < n; i++, p += 4) infos.push(b.readUInt32LE(p));
  const streams = [];
  for (let i = 0; i < n; i++) {
    const id = infos[i] & 0x1fffffff;
    const tagCount = infos[i] >>> 29;
    const chunks = new Map();
    for (let k = 0; k < tagCount; k++, p += 8) {
      const v = b.readBigUInt64LE(p);
      chunks.set(Number((v >> 56n) & 0xffn), { size: Number((v >> 28n) & 0xfffffffn), offset: Number(v & 0xfffffffn) });
    }
    let sampleRate = null;
    let samples = null;
    const fmt = chunks.get(CHUNK_FORMAT);
    if (fmt && fmt.size >= 10) {
      samples = b.readUInt32LE(fmt.offset);
      sampleRate = b.readUInt16LE(fmt.offset + 8);
    }
    let grains = null;
    const g = chunks.get(CHUNK_GRAINS);
    if (g) {
      // 12-byte records: uint32 start sample, float32 grain frequency (Hz, one grain = one engine cycle), uint32.
      grains = [];
      for (let o = g.offset; o + 12 <= g.offset + g.size; o += 12) {
        const hz = b.readFloatLE(o + 4);
        if (Number.isFinite(hz) && hz > 0.5 && hz < 1000) grains.push({ sample: b.readUInt32LE(o), hz });
      }
    }
    const codec = fmt && fmt.size >= 20 ? b[fmt.offset + 0x13] : null;
    const data = chunks.get(CHUNK_DATA) ?? null;
    streams.push({ index: i, id, sampleRate, samples, grains, hasData: data !== null, codec, data });
  }
  return { streams };
}

/** Names from a RAGE .nametable file (NUL-separated). */
export function readNametable(path) {
  return readFileSync(path, 'latin1').split(/[\0\s]+/).filter(Boolean);
}

const CORE_ROLES = ['engine_accel', 'exhaust_accel', 'engine_decel', 'exhaust_decel', 'engine_idle', 'exhaust_idle', 'startup', 'shutdown'];

/**
 * Stock GTA V extra-sound names that engine packs reuse (exhaust pops, dump valves, start/stop),
 * so streams can be named even when a pack ships without .nametable files.
 */
export const COMMON_NAMES = (() => {
  const out = new Set(['start_up', 'shut_down', 'start_up_interior', 'luxury_gen_vehicle_ignition_start', 'luxury_gen_vehicle_ignition_tail']);
  const pad = (i) => String(i).padStart(2, '0');
  for (let i = 1; i <= 5; i++) out.add(`start_up_${pad(i)}`);
  const tiers = ['v_hi', 'hi', 'lo', 'lo_2', 'v_lo', 'mid', 'rally', 'muscle', 'sport', 'super', 'race', 'tuner', 'classic', 'luxury', 'offroad', 'bike'];
  for (const t of tiers) for (const k of ['exhaust_pop', 'limiter_pop', 'backfire']) for (let i = 1; i <= 12; i++) out.add(`vehicle_extras_${t}_${k}_${pad(i)}`);
  for (let i = 1; i <= 20; i++) for (const s of ['', 'a', 'b', 'c', 'd', '_wastegate', '_surge', '_dump_lo', '_dump_hi']) out.add(`vehicles_extras_dump_valve_${pad(i)}${s}`);
  return [...out];
})();

/** Generic names from a nametable entry (engine-specific prefixes removed), for sharing across packs. */
export function genericNames(id, raw) {
  const n = raw.toLowerCase();
  const out = [n];
  for (const pre of [`dlc_${id}_${id}_`, `dlc_${id}_`, `${id}_`]) if (n.startsWith(pre)) out.push(n.slice(pre.length));
  return out;
}

/**
 * Resolve stream names by hashing candidate names. Candidates: the core granular-engine names plus every
 * name in the bank's nametables with the usual `dlc_<id>_<id>_` / `<id>_` prefixes stripped.
 * @returns {Map<number, string>} stream index -> name
 */
export function resolveStreamNames(awc, id, nametableNames = [], sharedNames = []) {
  const cands = new Set([...CORE_ROLES, ...COMMON_NAMES]);
  for (const raw of nametableNames) {
    const n = raw.toLowerCase();
    cands.add(n);
    for (const pre of [`dlc_${id}_${id}_`, `dlc_${id}_`, `${id}_`]) if (n.startsWith(pre)) cands.add(n.slice(pre.length));
  }
  // Names other engine packs use (their nametables, prefixes stripped): packs share most extras.
  for (const n of sharedNames) cands.add(n.toLowerCase());
  const byId = new Map(awc.streams.map((s) => [s.id, s.index]));
  const names = new Map();
  for (const c of cands) {
    const idx = byId.get(awcId(c));
    if (idx !== undefined) names.set(idx, c);
  }
  return names;
}

/** Role of a resolved stream name. */
export function roleOf(name) {
  if (!name) return 'unknown';
  if (CORE_ROLES.includes(name)) return name;
  if (/^start_?up(_\d+)?$/.test(name)) return 'startup';
  if (/^shut_?down(_\d+)?$/.test(name)) return 'shutdown';
  if (/door/.test(name)) return 'door';
  if (/exhaust_pop|backfire|pop_\d/.test(name)) return 'pop';
  if (/wastegate/.test(name)) return 'wastegate';
  if (/dump_valve|blow_?off|bov/.test(name)) return 'blowoff';
  return 'extra';
}

/**
 * RPM curve [[timeS, rpm], ...] from granular grains. One grain is one engine cycle (two revolutions),
 * so rpm = 120 * grainHz. Verified on k20a: the strongest spectral line is exactly 4x the grain
 * frequency, i.e. the inline-4 firing frequency (rpm / 30). Points are thinned to `stepS` and forced
 * strictly monotonic so the curve can be inverted.
 */
export function grainCurve(grains, sampleRate, stepS = 0.25) {
  if (!grains || grains.length < 2) return null;
  const asc = grains[grains.length - 1].hz >= grains[0].hz;
  const pts = [];
  for (const g of grains) {
    const t = g.sample / sampleRate;
    const rpm = Math.round(120 * g.hz);
    const prev = pts[pts.length - 1];
    if (!prev || ((asc ? rpm > prev[1] : rpm < prev[1]) && t - prev[0] >= stepS)) pts.push([+t.toFixed(3), rpm]);
  }
  const last = grains[grains.length - 1];
  const tl = +(last.sample / sampleRate).toFixed(3);
  const rl = Math.round(120 * last.hz);
  const prev = pts[pts.length - 1];
  if (prev && tl > prev[0] && (asc ? rl > prev[1] : rl < prev[1])) pts.push([tl, rl]);
  return pts.length >= 2 ? pts : null;
}

/** Mean grain period (seconds) of a steady recording such as an idle loop. */
export function meanCycleS(grains) {
  if (!grains || grains.length === 0) return null;
  return grains.reduce((s, g) => s + 1 / g.hz, 0) / grains.length;
}

/** AWC codec id for plain little-endian 16-bit PCM. */
export const AWC_CODEC_PCM = 0;

/**
 * Decodes an AWC whose audio streams are all plain PCM (no vgmstream needed).
 * Writes stream_NN.wav (1-based, same order as vgmstream subsongs) for each stream with audio.
 * @returns {number|null} number of streams written, or null if any stream uses another codec.
 */
export function decodePcmAwc(path, outDir, writeWav16) {
  const b = readFileSync(path);
  const { streams } = readAwc(path);
  const audio = streams.filter((s) => s.data && s.sampleRate);
  if (audio.length === 0 || audio.some((s) => s.codec !== AWC_CODEC_PCM)) return null;
  let k = 0;
  for (const s of audio) {
    k++;
    const n = Math.min(s.samples ?? Infinity, Math.floor(s.data.size / 2));
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = b.readInt16LE(s.data.offset + 2 * i) / 32768;
    writeWav16(`${outDir}/stream_${String(k).padStart(2, '0')}.wav`, x, s.sampleRate);
  }
  return k;
}
