import { clamp, lerp } from '../utils/math.ts';

/**
 * Equal-power crossfade weights across RPM bands. Only the two bands bracketing
 * `rpm` are non-zero; the crossfade runs in log-RPM so it is perceptually even.
 * Writes into `out` to avoid allocations in the audio update loop.
 */
export function bandWeights(rpm: number, bandRpms: readonly number[], out: number[]): number[] {
  const n = bandRpms.length;
  out.length = n;
  for (let i = 0; i < n; i++) out[i] = 0;
  if (n === 0) return out;
  const first = bandRpms[0] as number;
  const last = bandRpms[n - 1] as number;
  if (rpm <= first) {
    out[0] = 1;
    return out;
  }
  if (rpm >= last) {
    out[n - 1] = 1;
    return out;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = bandRpms[i] as number;
    const b = bandRpms[i + 1] as number;
    if (rpm >= a && rpm <= b) {
      const t = (Math.log(rpm) - Math.log(a)) / (Math.log(b) - Math.log(a));
      out[i] = Math.cos((t * Math.PI) / 2);
      out[i + 1] = Math.sin((t * Math.PI) / 2);
      break;
    }
  }
  return out;
}

/** Playback rate that makes a loop recorded at `bandRpm` sound like `rpm`. */
export function bandPlaybackRate(rpm: number, bandRpm: number, pitch = 1): number {
  return clamp((Math.max(rpm, 1) / bandRpm) * pitch, 0.35, 3);
}

/** Mix between the on-load and off-load layers. */
export function loadGains(load: number, overrun: boolean): { on: number; off: number } {
  if (overrun) return { on: 0.08, off: 1 };
  const l = clamp(load, 0, 1);
  return { on: lerp(0.4, 1, Math.sqrt(l)), off: lerp(0.75, 0.1, l) };
}

/**
 * Overall loudness rises with RPM and load, like a real engine heard from the cabin.
 * The idle floor is high on purpose: a standing engine must stay clearly audible
 * after the start-up sample has faded.
 */
export function engineLevel(rpm: number, idleRpm: number, redlineRpm: number, load: number, overrun: boolean): number {
  const r = clamp((rpm - idleRpm) / (redlineRpm - idleRpm), 0, 1);
  const base = 0.78 + 0.22 * r + 0.12 * clamp(load, 0, 1);
  return overrun ? base * 0.78 : base;
}

/** Low-pass cutoff: the engine "opens up" under load and at high RPM. */
export function toneCutoffHz(rpm: number, idleRpm: number, redlineRpm: number, load: number, overrun: boolean): number {
  const r = clamp((rpm - idleRpm) / (redlineRpm - idleRpm), 0, 1);
  const open = clamp(0.25 + 0.45 * load + 0.3 * r, 0, 1);
  return overrun ? lerp(1400, 3800, r) : lerp(1800, 11000, open);
}
