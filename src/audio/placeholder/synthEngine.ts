/**
 * TODO(placeholder-audio): procedural stand-in for engines whose GTA .awc bank has not been
 * converted yet (see docs/AUDIO_PIPELINE.md). It produces LOOP BUFFERS in exactly the shape
 * the import pipeline produces, so the runtime audio engine is identical for real and
 * placeholder banks. Delete this module once every profile has converted audio.
 *
 * Each loop is an integer number of 4-stroke engine cycles, so it repeats seamlessly.
 */
import { createRng } from '../../utils/math.ts';

export interface SynthParams {
  rpm: number;
  cylinders: number;
  load: 'on' | 'off';
  sampleRate: number;
  brightness: number; // 0..1
  roughness: number; // 0..1
  forcedInduction: 'none' | 'turbo' | 'supercharger';
  seed: number;
  targetDurationS?: number;
}

export interface SynthLoop {
  data: Float32Array;
  sampleRate: number;
  /** Exact RPM represented by the loop after rounding to whole samples. */
  rpm: number;
}

export function synthesizeEngineLoop(p: SynthParams): SynthLoop {
  const sr = p.sampleRate;
  const rng = createRng(p.seed);
  const cycleSamples = Math.max(16, Math.round((120 / p.rpm) * sr));
  const rpm = (120 * sr) / cycleSamples;
  const fCycle = sr / cycleSamples; // engine cycle (2 revolutions) frequency
  const nCycles = Math.max(2, Math.round((p.targetDurationS ?? 0.55) / (cycleSamples / sr)));
  const length = nCycles * cycleSamples;
  const on = p.load === 'on';
  const cyl = Math.max(1, p.cylinders);

  // 1) One engine cycle as a sum of half-order harmonics.
  const cycle = new Float64Array(cycleSamples);
  const maxFreq = Math.min(sr * 0.45, on ? 2600 + p.brightness * 4400 : 1500 + p.brightness * 1600);
  const formant = 350 + p.brightness * 900;
  const kMax = Math.floor(maxFreq / fCycle);
  for (let k = 1; k <= kMax; k++) {
    const freq = k * fCycle;
    const firing = k % cyl === 0;
    let amp: number;
    if (firing) {
      const h = k / cyl;
      amp = 1 / Math.pow(h, on ? 1.05 - 0.45 * p.brightness : 1.55);
    } else {
      if (k > cyl * 6) continue;
      amp = ((on ? 0.22 : 0.38) * (0.4 + p.roughness) * (0.5 + rng())) / Math.sqrt(k);
    }
    amp *= 1 + 1.4 * Math.exp(-(((freq - formant) / (formant * 0.6)) ** 2));
    amp *= Math.min(1, freq / 60); // tame sub-bass
    // Oscillator by complex rotation: far cheaper than Math.sin per sample on a car CPU.
    const phase = rng() * Math.PI * 2;
    const w = (2 * Math.PI * k) / cycleSamples;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let re = Math.cos(phase) * amp;
    let im = Math.sin(phase) * amp;
    for (let i = 0; i < cycleSamples; i++) {
      cycle[i] = (cycle[i] as number) + im;
      const r = re * cw - im * sw;
      im = re * sw + im * cw;
      re = r;
    }
  }

  // Forced-induction whine locked to a harmonic so the loop stays periodic.
  if (on && p.forcedInduction !== 'none') {
    const target = p.forcedInduction === 'supercharger' ? (p.rpm / 60) * 9 : 2400 + p.rpm * 0.35;
    const k = Math.max(1, Math.round(Math.min(target, sr * 0.4) / fCycle));
    const w = (2 * Math.PI * k) / cycleSamples;
    const a = p.forcedInduction === 'supercharger' ? 0.05 : 0.025;
    for (let i = 0; i < cycleSamples; i++) cycle[i] = (cycle[i] as number) + a * Math.sin(w * i);
  }

  // 2) Tile cycles with smooth, cyclic combustion-strength variation.
  const strengths = Array.from({ length: nCycles }, () => 1 + (rng() - 0.5) * 0.5 * p.roughness);
  const out = new Float32Array(length);
  for (let c = 0; c < nCycles; c++) {
    const a = strengths[c] as number;
    const b = strengths[(c + 1) % nCycles] as number;
    for (let i = 0; i < cycleSamples; i++) {
      const t = 0.5 - 0.5 * Math.cos((Math.PI * i) / cycleSamples);
      out[c * cycleSamples + i] = (cycle[i] as number) * (a + (b - a) * t);
    }
  }

  // 3) Firing-pulsed noise (intake/exhaust turbulence) with a baked loop crossfade.
  const fade = Math.min(Math.floor(length / 4), Math.round(sr * 0.012));
  const noise = new Float32Array(length + fade);
  let lp = 0;
  const lpCoef = on ? 0.25 + 0.5 * p.brightness : 0.12;
  for (let i = 0; i < noise.length; i++) {
    lp += lpCoef * (rng() * 2 - 1 - lp);
    noise[i] = lp;
  }
  const noiseAmp = (on ? 0.35 : 0.22) * (0.5 + p.roughness);
  for (let i = 0; i < length; i++) {
    let n = noise[i] as number;
    if (i < fade) {
      const t = i / fade;
      n = n * t + (noise[length + i] as number) * (1 - t);
    }
    const firingPhase = ((i % cycleSamples) / cycleSamples) * cyl;
    const env = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * firingPhase), 3);
    out[i] = (out[i] as number) + n * noiseAmp * (0.3 + env);
  }

  // 4) DC removal, soft saturation, normalise.
  let mean = 0;
  for (let i = 0; i < length; i++) mean += out[i] as number;
  mean /= length;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const v = (out[i] as number) - mean;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const drive = 1.3 + p.roughness * 1.5;
  const norm = peak > 0 ? 1 / peak : 1;
  const tanhD = Math.tanh(drive);
  for (let i = 0; i < length; i++) out[i] = (Math.tanh((out[i] as number) * norm * drive) / tanhD) * (on ? 0.85 : 0.6);

  return { data: out, sampleRate: sr, rpm };
}

/** TODO(placeholder-audio): procedural exhaust crackle used until real pop samples are extracted. */
export function synthesizePop(sampleRate: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const dur = 0.05 + rng() * 0.07;
  const n = Math.round(dur * sampleRate);
  const out = new Float32Array(n);
  const thumpF = 70 + rng() * 90;
  const decay = 18 + rng() * 25;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * decay) * Math.min(1, t * 2000);
    lp += 0.35 * (rng() * 2 - 1 - lp);
    out[i] = (0.75 * lp + 0.6 * Math.sin(2 * Math.PI * thumpF * t)) * env;
  }
  return out;
}
