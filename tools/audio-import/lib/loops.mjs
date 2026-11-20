// Turns an engine RPM sweep into short seamless loops at chosen RPMs.

export function rms(x, start = 0, end = x.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

/** Normalised cross-correlation of x[a..a+n) and x[b..b+n). */
export function ncc(x, a, b, n) {
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const u = x[a + i], v = x[b + i];
    sab += u * v; saa += u * u; sbb += v * v;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * Time (seconds) in a sweep at which the engine is at `rpm`.
 * `curve` is an optional list of [timeSec, rpm] points (monotonic in rpm); otherwise linear start->end.
 */
export function timeForRpm(rpm, { durationS, rpmStart, rpmEnd, curve }) {
  const pts = curve && curve.length >= 2 ? curve : [[0, rpmStart], [durationS, rpmEnd]];
  const asc = pts[pts.length - 1][1] >= pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, r0] = pts[i];
    const [t1, r1] = pts[i + 1];
    const inSeg = asc ? rpm >= r0 && rpm <= r1 : rpm <= r0 && rpm >= r1;
    if (inSeg) return t0 + ((rpm - r0) / (r1 - r0 || 1)) * (t1 - t0);
  }
  const before = asc ? rpm < pts[0][1] : rpm > pts[0][1];
  return before ? pts[0][0] : pts[pts.length - 1][0];
}

/** RPM at time t of a sweep (inverse of timeForRpm). */
export function rpmForTime(t, { durationS, rpmStart, rpmEnd, curve }) {
  const pts = curve && curve.length >= 2 ? curve : [[0, rpmStart], [durationS, rpmEnd]];
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, r0] = pts[i];
    const [t1, r1] = pts[i + 1];
    if (t <= t1) return r0 + ((t - t0) / (t1 - t0 || 1)) * (r1 - r0);
  }
  return pts[pts.length - 1][1];
}

/**
 * De-chirp: time-warp the region of a sweep around `centerS` so the engine runs at a constant
 * `rpm`. Source time advances by rpm/rpmAt(t) per output sample, i.e. the engine phase advances
 * uniformly. The result is periodic and can be looped cleanly even where the sweep is steep.
 */
export function flattenSweep(x, sampleRate, { centerS, rpm, outS, rpmAt }) {
  const n = Math.round(outS * sampleRate);
  const out = new Float32Array(n);
  // Walk backwards half the output length to find the start time.
  let t = centerS;
  for (let i = 0; i < n / 2; i++) t -= rpm / Math.max(1, rpmAt(t)) / sampleRate;
  t = Math.max(0, t);
  for (let i = 0; i < n; i++) {
    const pos = t * sampleRate;
    const k = Math.floor(pos);
    if (k + 1 >= x.length) return out.subarray(0, i);
    const f = pos - k;
    out[i] = x[k] * (1 - f) + x[k + 1] * f;
    t += rpm / Math.max(1, rpmAt(t)) / sampleRate;
  }
  return out;
}

/**
 * Extract a loop of ~targetS seconds centred at `centerS`, whose length is a whole number of
 * engine cycles (refined by autocorrelation), with an equal-power crossfade baked into the seam.
 * @returns {{ samples: Float32Array, start: number, length: number, score: number }}
 */
export function extractLoop(x, sampleRate, { centerS, rpm, targetS = 0.45, fadeS = 0.02 }) {
  const cycle = (120 / rpm) * sampleRate; // samples per 4-stroke cycle
  const cycles = Math.max(2, Math.round((targetS * sampleRate) / cycle));
  const nominal = Math.round(cycles * cycle);
  const fade = Math.min(Math.round(fadeS * sampleRate), Math.floor(nominal / 4));
  const probe = Math.max(64, Math.min(Math.round(cycle), Math.floor(nominal / 3)));
  const search = Math.max(4, Math.round(nominal * 0.06));
  const maxLen = nominal + search;
  let start = Math.round(centerS * sampleRate - nominal / 2);
  start = Math.max(0, Math.min(start, x.length - maxLen - fade - probe - 1));
  if (start < 0) throw new Error(`Stream too short for a ${targetS}s loop`);

  let bestLen = nominal;
  let best = -Infinity;
  for (let L = nominal - search; L <= nominal + search; L++) {
    const s = ncc(x, start, start + L, probe);
    if (s > best) { best = s; bestLen = L; }
  }

  const L = bestLen;
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = x[start + i];
  for (let i = 0; i < fade; i++) {
    const a = (i + 0.5) / fade;
    out[i] = x[start + i] * Math.sqrt(a) + x[start + L + i] * Math.sqrt(1 - a);
  }
  return { samples: out, start, length: L, score: best };
}

/** Scale to a target RMS while keeping peaks below `ceiling`. */
export function normalize(x, targetRms = 0.12, ceiling = 0.95) {
  const r = rms(x);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (r === 0 || peak === 0) return x;
  const g = Math.min(targetRms / r, ceiling / peak);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

/** Two back-to-back copies: lets the runtime loop the middle period, immune to codec priming delay. */
export function doubleLoop(loop) {
  const out = new Float32Array(loop.length * 2);
  out.set(loop, 0);
  out.set(loop, loop.length);
  return out;
}

/** Mix several equally long-or-not mono streams with gains (result length = shortest). */
export function mix(streams, gains) {
  const n = Math.min(...streams.map((s) => s.length));
  const out = new Float32Array(n);
  streams.forEach((s, k) => {
    const g = gains?.[k] ?? 1;
    for (let i = 0; i < n; i++) out[i] += s[i] * g;
  });
  return out;
}

export function logSpaced(lo, hi, n) {
  return Array.from({ length: n }, (_, i) => Math.round(lo * Math.pow(hi / lo, i / (n - 1))));
}
