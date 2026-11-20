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
    streams.push({ index: i, id, sampleRate, samples, grains, hasData: chunks.has(CHUNK_DATA) });
  }
  return { streams };
}

/** Names from a RAGE .nametable file (NUL-separated). */
export function readNametable(path) {
  return readFileSync(path, 'latin1').split(/[\0\s]+/).filter(Boolean);
}

const CORE_ROLES = ['engine_accel', 'exhaust_accel', 'engine_decel', 'exhaust_decel', 'engine_idle', 'exhaust_idle', 'startup', 'shutdown'];

/**
 * Resolve stream names by hashing candidate names. Candidates: the core granular-engine names plus every
 * name in the bank's nametables with the usual `dlc_<id>_<id>_` / `<id>_` prefixes stripped.
 * @returns {Map<number, string>} stream index -> name
 */
export function resolveStreamNames(awc, id, nametableNames = []) {
  const cands = new Set(CORE_ROLES);
  for (const raw of nametableNames) {
    const n = raw.toLowerCase();
    cands.add(n);
    for (const pre of [`dlc_${id}_${id}_`, `dlc_${id}_`, `${id}_`]) if (n.startsWith(pre)) cands.add(n.slice(pre.length));
  }
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
