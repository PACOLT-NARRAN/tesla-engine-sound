export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp(invLerp(edge0, edge1, x), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. tau in seconds. */
export function expApproach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return target + (current - target) * Math.exp(-dt / tau);
}

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const msToKmh = (ms: number): number => ms * 3.6;
export const msToMph = (ms: number): number => ms * 2.236936;

/** Deterministic PRNG (mulberry32) so procedural content is reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
