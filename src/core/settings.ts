import type { EngineProfile } from '../types/profile.ts';

/** Persisted user preferences. GPS data is never persisted. */
export interface Settings {
  profileId: string;
  volume: number;
  units: 'kmh' | 'mph';
  demoScenarioId: string;
  demoNoise: boolean;
  demoNoCoordsSpeed: boolean;
  /** How quickly the virtual engine runs out of revs: 'real' gearing, or shorter so everyday speeds use the whole rev range. */
  gearing: Gearing;
  /** When the automatic gearbox shifts: early (comfort) … late (track). */
  shiftStyle: ShiftStyle;
  theme: Theme;
}

export type ShiftStyle = 'comfort' | 'sport' | 'track';
export type Theme = 'dark' | 'light';

/**
 * How far the relaxed-driving shift points move toward the full-throttle ones.
 * 'comfort' = the profile as written (shifts very early); 'sport' keeps the engine in its
 * mid-range; 'track' holds gears long.
 */
export const SHIFT_STYLE: Record<ShiftStyle, { up: number; down: number }> = {
  comfort: { up: 0, down: 0 },
  sport: { up: 0.35, down: 0.25 },
  track: { up: 0.6, down: 0.45 },
};

/** Profile copy with the relaxed-driving shift points raised for the chosen style. */
export function withShiftStyle(p: EngineProfile, style: ShiftStyle): EngineProfile {
  const k = SHIFT_STYLE[style] ?? SHIFT_STYLE.comfort;
  if (k.up === 0 && k.down === 0) return p;
  const gb = p.gearbox;
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  return {
    ...p,
    gearbox: {
      ...gb,
      shiftUpRPM: { ...gb.shiftUpRPM, gentle: lerp(gb.shiftUpRPM.gentle, gb.shiftUpRPM.hard, k.up) },
      shiftDownRPM: { ...gb.shiftDownRPM, gentle: lerp(gb.shiftDownRPM.gentle, gb.shiftDownRPM.hard, k.down) },
    },
  };
}

export type Gearing = 'fun' | 'normal' | 'real';

/**
 * Final-drive multiplier per gearing mode. 'real' reaches the sound's full range around 160 km/h;
 * 'normal' around 130 km/h; 'fun' around 100 km/h.
 */
export const GEARING_FACTOR: Record<Gearing, number> = { real: 1, normal: 160 / 130, fun: 160 / 100 };

const KEY = 'revline.settings.v1';

export function loadSettings(defaults: Settings): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode); preferences just won't persist */
  }
}

/** Profile copy with the final drive scaled for the chosen gearing mode. */
export function withGearing(p: EngineProfile, gearing: Gearing): EngineProfile {
  const k = GEARING_FACTOR[gearing] ?? 1;
  return k === 1 ? p : { ...p, gearbox: { ...p.gearbox, finalDrive: p.gearbox.finalDrive * k } };
}
