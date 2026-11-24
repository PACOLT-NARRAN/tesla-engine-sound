/**
 * REVLINE voice synthesiser: procedural sound banks for the fun packs (two-strokes, old cars,
 * motorbikes, aircraft, locomotives, crazy machines). Pure TypeScript, no Web Audio: it renders
 * LOOP BUFFERS in exactly the shape the recorded banks have, so the runtime audio engine
 * (RPM crossfade, load layers, pops, shifts) treats them like any other engine.
 *
 * How a loop is made (physically inspired, not sample based):
 *   1. Excitation: firing / chuff / blade events placed on the engine cycle (uneven firing,
 *      misfires, diesel knock, tappet rattle), plus crackle bursts.
 *   2. Resonators: formant band-passes (intake, block, exhaust), an exhaust pipe comb and a
 *      body low-pass, all applied CIRCULARLY (run twice, keep the second pass), so the loop
 *      end flows into its start without a click.
 *   3. Tonal layers locked to the loop (whines, hums, rotor tones, inverter "singing") with
 *      loop-locked vibrato / tremolo, and noise layers (roar, hiss, rumble).
 *   4. DC removal, normalisation, soft saturation.
 */
import { createRng, hashString } from '../../utils/math.ts';

export interface VoiceContext {
  /** Band position between idle (0) and limiter (1). */
  norm: number;
  /** Shaft revolutions per second after the recipe's revScale. */
  fRev: number;
  on: boolean;
}

export interface ToneSpec {
  hz: number;
  gain: number;
  /** Vibrato: rate (Hz, locked to the loop) and depth (cents). */
  vib?: readonly [number, number];
  /** Tremolo: rate (Hz, locked to the loop) and depth 0..1. */
  trem?: readonly [number, number];
}

export interface VoiceRecipe {
  /** Revolutions per repeating pattern: 2 = four-stroke, 1 = two-stroke / turbine / rotor. */
  cycleRevs: number;
  /** Engine RPM per "real" shaft RPM (e.g. 20 for a steam loco: wheels turn slowly). */
  revScale?: number;
  /** Firing / chuff events as fractions of the cycle. Empty = no pulse train. */
  events: readonly number[];
  /** Per-event gain (uneven engines, missing beats). */
  eventGains?: readonly number[];
  /** Pulse shape. */
  pulse?: { decayMs: number; click: number; noise: number; thumpHz?: number; thump?: number };
  /** Pulse level over the band position (0 idle … 1 limiter), [at idle, at limiter]. */
  pulseLevel?: readonly [number, number];
  /** Formant resonators on the pulse train: [Hz, Q, gain]. */
  formants: ReadonlyArray<readonly [number, number, number]>;
  /** How much the formants move up with RPM (0 = fixed). */
  formantTrack?: number;
  /** Dry pulse mixed past the formants. */
  direct?: number;
  /** Exhaust pipe comb: delay (ms) and feedback. */
  pipe?: readonly [number, number];
  /** Body low-pass at idle and at the limiter (Hz). */
  lowpass: readonly [number, number];
  misfire?: number;
  knock?: number;
  rattle?: number;
  /** Random crackle bursts per second [idle, limiter] and gain. */
  crackle?: { perSec: readonly [number, number]; gain: number };
  tones?: (c: VoiceContext) => ToneSpec[];
  /** Noise layer: gain [idle, limiter], band-pass centre [idle, limiter] Hz and Q, pulsed by the events (0..1). */
  noise?: { gain: readonly [number, number]; hz: readonly [number, number]; q: number; pulsed?: number };
  /** Sub rumble: gain [idle, limiter] and corner Hz. */
  rumble?: { gain: readonly [number, number]; hz: number };
  /** Off-load (coasting) changes. */
  off?: { pulse?: number; tones?: number; noise?: number; lowpass?: number; misfire?: number; burble?: number };
  /** Saturation drive (1 = clean, 3 = gritty). */
  drive?: number;
  /** Final level over the band position [idle, limiter] (quiet idle for electric / steam). */
  level?: readonly [number, number];
  /** Preferred loop length (s). */
  loopS?: number;
  /** Number of RPM bands (default 7). */
  bands?: number;
}

export interface VoiceLoop {
  data: Float32Array;
  sampleRate: number;
  rpm: number;
}

/** Longest loop rendered (s). */
const MAX_LOOP_S = 2.5;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const at = (r: readonly [number, number], t: number) => lerp(r[0], r[1], t);

// --- Circular filters ------------------------------------------------------------------------

type Proc = (x: number) => number;

/** Runs `proc` over the loop twice and keeps the second pass: seamless steady-state filtering. */
function circular(x: Float32Array, proc: Proc): Float32Array {
  for (let i = 0; i < x.length; i++) proc(x[i] as number);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = proc(x[i] as number);
  return out;
}

function biquad(kind: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number): Proc {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (kind === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (kind === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function comb(delay: number, fb: number): Proc {
  const buf = new Float32Array(Math.max(1, delay));
  let i = 0;
  return (x) => {
    const y = x + fb * (buf[i] as number);
    buf[i] = y;
    i = (i + 1) % buf.length;
    return y;
  };
}

// --- Renderer ----------------------------------------------------------------------------------

export function renderVoiceLoop(
  r: VoiceRecipe, rpmIn: number, norm: number, on: boolean, sampleRate: number, seed: number,
): VoiceLoop {
  const sr = sampleRate;
  const rng = createRng(seed);
  const revScale = r.revScale ?? 1;
  const exact = Math.max(16, Math.round(((r.cycleRevs * 60 * revScale) / rpmIn) * sr));
  // Very slow cycles (a tram or steam loco barely moving) are capped at MAX_LOOP_S; the band
  // then keeps its nominal RPM (its pulses are faint there anyway).
  const capped = exact > MAX_LOOP_S * sr;
  const cycleSamples = capped ? Math.round(MAX_LOOP_S * sr) : exact;
  const rpm = capped ? rpmIn : (r.cycleRevs * 60 * revScale * sr) / cycleSamples;
  const cycleS = cycleSamples / sr;
  const want = r.loopS ?? 0.6;
  const nCycles = cycleS >= want * 0.8 ? 1 : Math.max(2, Math.round(want / cycleS));
  const L = nCycles * cycleSamples;
  const Ls = L / sr;
  const ctx: VoiceContext = { norm, fRev: rpm / 60 / revScale, on };
  const off = on ? null : (r.off ?? {});
  const lock = (hz: number) => Math.max(1, Math.round(hz * Ls)) / Ls; // frequency with whole periods in the loop
  const out = new Float32Array(L);

  // 1) Pulse train.
  const pulseGain = r.events.length ? at(r.pulseLevel ?? [1, 1], norm) * (off?.pulse ?? 1) : 0;
  if (pulseGain > 0 && r.pulse) {
    const ex = new Float32Array(L);
    const decay = Math.max(1, (r.pulse.decayMs / 1000) * sr);
    const thumpHz = r.pulse.thumpHz ?? 0;
    const misfire = (r.misfire ?? 0) + (off?.misfire ?? 0);
    const burble = off?.burble ?? 0;
    const knock = r.knock ?? 0;
    const knockEx = knock > 0 ? new Float32Array(L) : null;
    const len = Math.min(L, Math.round(decay * 6));
    for (let c = 0; c < nCycles; c++) {
      r.events.forEach((frac, k) => {
        let g = (r.eventGains?.[k] ?? 1) * (0.85 + rng() * 0.3);
        if (rng() < misfire) g *= 0.08;
        else if (rng() < burble) g *= 1.9;
        const start = Math.round((c + frac) * cycleSamples) % L;
        for (let j = 0; j < len; j++) {
          const env = Math.exp(-j / decay);
          let v = (j === 0 ? r.pulse!.click : 0) + r.pulse!.noise * (rng() * 2 - 1) * env;
          if (thumpHz > 0) v += (r.pulse!.thump ?? 0.5) * Math.sin((2 * Math.PI * thumpHz * j) / sr) * env;
          const idx = (start + j) % L;
          ex[idx] = (ex[idx] as number) + v * g;
        }
        if (knockEx) {
          const kl = Math.round(sr * 0.004);
          for (let j = 0; j < kl; j++) {
            const idx = (start + j) % L;
            knockEx[idx] = (knockEx[idx] as number) + (rng() * 2 - 1) * Math.exp(-j / (kl / 4)) * g;
          }
        }
      });
    }
    const shift = 1 + (r.formantTrack ?? 0.3) * (norm - 0.4);
    const mix = new Float32Array(L);
    const direct = r.direct ?? 0.25;
    for (let i = 0; i < L; i++) mix[i] = (ex[i] as number) * direct;
    for (const [f, q, g] of r.formants) {
      const y = circular(ex, biquad('bp', f * shift, q, sr));
      for (let i = 0; i < L; i++) mix[i] = (mix[i] as number) + (y[i] as number) * g * (off && f > 900 ? 0.6 : 1);
    }
    if (knockEx) {
      const y = circular(knockEx, biquad('bp', 2600, 1.4, sr));
      for (let i = 0; i < L; i++) mix[i] = (mix[i] as number) + (y[i] as number) * knock * 3;
    }
    let body = mix;
    if (r.pipe) {
      const d = Math.round((r.pipe[0] / 1000) * sr);
      body = circular(body, comb(d, r.pipe[1]));
    }
    body = circular(body, biquad('lp', at(r.lowpass, norm) * (off?.lowpass ?? 0.7), 0.707, sr));
    for (let i = 0; i < L; i++) out[i] = (out[i] as number) + (body[i] as number) * pulseGain;
  }

  // 2) Tappet / chain rattle.
  if (r.rattle) {
    const ex = new Float32Array(L);
    const n = Math.round(Ls * ctx.fRev * 6);
    for (let k = 0; k < n; k++) ex[Math.floor(rng() * L)] = (rng() * 2 - 1);
    const y = circular(ex, biquad('bp', 4200, 3, sr));
    for (let i = 0; i < L; i++) out[i] = (out[i] as number) + (y[i] as number) * r.rattle * 6;
  }

  // 3) Crackle.
  if (r.crackle) {
    const ex = new Float32Array(L);
    const n = Math.round(at(r.crackle.perSec, norm) * Ls * (on ? 1 : 1.6));
    for (let k = 0; k < n; k++) {
      const start = Math.floor(rng() * L);
      const dec = sr * (0.004 + rng() * 0.02);
      const a = 0.3 + rng();
      for (let j = 0; j < dec * 5; j++) {
        const idx = (start + j) % L;
        ex[idx] = (ex[idx] as number) + (rng() * 2 - 1) * a * Math.exp(-j / dec);
      }
    }
    const y = circular(ex, biquad('lp', 3500, 0.7, sr));
    for (let i = 0; i < L; i++) out[i] = (out[i] as number) + (y[i] as number) * r.crackle.gain;
  }

  // 4) Tonal layers.
  if (r.tones) {
    const tg = off?.tones ?? 1;
    for (const tone of r.tones(ctx)) {
      if (tone.gain <= 0 || tone.hz >= sr * 0.45) continue;
      const f = lock(tone.hz);
      const vr = tone.vib ? lock(tone.vib[0]) : 0;
      const vd = tone.vib ? (f * (Math.pow(2, tone.vib[1] / 1200) - 1)) / Math.max(vr, 1e-6) : 0;
      const tr = tone.trem ? lock(tone.trem[0]) : 0;
      const td = tone.trem ? tone.trem[1] : 0;
      const ph = rng() * Math.PI * 2;
      const a0 = tone.gain * tg;
      // Oscillators by complex rotation (cheap on a car CPU); vibrato needs a real phase.
      const rot = (hz: number, phase: number) => {
        const w = (2 * Math.PI * hz) / sr;
        return { cw: Math.cos(w), sw: Math.sin(w), re: Math.cos(phase), im: Math.sin(phase) };
      };
      const tm = td ? rot(tr, 0) : null;
      if (vd) {
        const vm = rot(vr, 0);
        for (let i = 0; i < L; i++) {
          const p = (2 * Math.PI * f * i) / sr + ph + vd * vm.im;
          let a = a0;
          if (tm) a *= 1 - td * (0.5 + 0.5 * tm.im);
          out[i] = (out[i] as number) + a * Math.sin(p);
          const r1 = vm.re * vm.cw - vm.im * vm.sw; vm.im = vm.re * vm.sw + vm.im * vm.cw; vm.re = r1;
          if (tm) { const r2 = tm.re * tm.cw - tm.im * tm.sw; tm.im = tm.re * tm.sw + tm.im * tm.cw; tm.re = r2; }
        }
      } else {
        const o = rot(f, ph);
        for (let i = 0; i < L; i++) {
          let a = a0;
          if (tm) a *= 1 - td * (0.5 + 0.5 * tm.im);
          out[i] = (out[i] as number) + a * o.im;
          const r1 = o.re * o.cw - o.im * o.sw; o.im = o.re * o.sw + o.im * o.cw; o.re = r1;
          if (tm) { const r2 = tm.re * tm.cw - tm.im * tm.sw; tm.im = tm.re * tm.sw + tm.im * tm.cw; tm.re = r2; }
        }
      }
    }
  }

  // 5) Noise layer (roar, hiss, wind), optionally pulsed by the events.
  if (r.noise) {
    const g = at(r.noise.gain, norm) * (off?.noise ?? 1);
    if (g > 0) {
      const w = new Float32Array(L);
      for (let i = 0; i < L; i++) w[i] = rng() * 2 - 1;
      const y = circular(w, biquad('bp', at(r.noise.hz, norm), r.noise.q, sr));
      const pulsed = r.noise.pulsed ?? 0;
      const ev = r.events.length || 1;
      for (let i = 0; i < L; i++) {
        let env = 1;
        if (pulsed > 0) {
          const ph = ((i % cycleSamples) / cycleSamples) * ev;
          env = 1 - pulsed + pulsed * Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * ph), 3);
        }
        out[i] = (out[i] as number) + (y[i] as number) * g * 3 * env;
      }
    }
  }

  // 6) Sub rumble.
  if (r.rumble) {
    const g = at(r.rumble.gain, norm);
    const w = new Float32Array(L);
    for (let i = 0; i < L; i++) w[i] = rng() * 2 - 1;
    let y = circular(w, biquad('lp', r.rumble.hz, 0.9, sr));
    y = circular(y, biquad('lp', r.rumble.hz * 1.5, 0.7, sr));
    for (let i = 0; i < L; i++) out[i] = (out[i] as number) + (y[i] as number) * g * 6;
  }

  // 7) DC / sub-sonic removal, normalise, saturate.
  const hp = circular(out, biquad('hp', 28, 0.707, sr));
  let peak = 0;
  for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(hp[i] as number));
  const drive = r.drive ?? 1.6;
  const norm1 = peak > 0 ? 1 / peak : 0;
  const level = at(r.level ?? [1, 1], norm) * (on ? 0.85 : 0.6);
  const td = Math.tanh(drive);
  for (let i = 0; i < L; i++) hp[i] = (Math.tanh((hp[i] as number) * norm1 * drive) / td) * level;
  return { data: hp, sampleRate: sr, rpm };
}

// --- Helpers for recipes -------------------------------------------------------------------------

/** Evenly spaced firing events. */
export const even = (n: number): number[] => Array.from({ length: n }, (_, i) => i / n);
/** Harmonic series of `f` with 1/k^slope amplitudes. */
export function harmonics(f: number, count: number, gain: number, slope = 1, extra: Partial<ToneSpec> = {}): ToneSpec[] {
  return Array.from({ length: count }, (_, i) => ({ hz: f * (i + 1), gain: gain / Math.pow(i + 1, slope), ...extra }));
}

/** Stable seed for a voice band. */
export const voiceSeed = (id: string, band: number, on: boolean) => hashString(id) + band * 101 + (on ? 0 : 50);

// --- Whole bank (worker or main thread) ---------------------------------------------------------

export interface RenderedBand {
  rpm: number;
  on: Float32Array;
  off: Float32Array;
}

/** Renders every band of a voice between idle and limiter (pure; runs inside the voice worker). */
export function renderVoiceBands(recipe: VoiceRecipe, voiceId: string, idle: number, limiter: number, sampleRate: number, defaultBands: number): RenderedBand[] {
  const n = Math.max(3, recipe.bands ?? defaultBands);
  const out: RenderedBand[] = [];
  for (let i = 0; i < n; i++) {
    const norm = i / (n - 1);
    const nominal = idle * Math.pow(limiter / idle, norm);
    const on = renderVoiceLoop(recipe, nominal, norm, true, sampleRate, voiceSeed(voiceId, i, true));
    const off = renderVoiceLoop(recipe, nominal, norm, false, sampleRate, voiceSeed(voiceId, i, false));
    out.push({ rpm: on.rpm, on: on.data, off: off.data });
  }
  return out;
}
