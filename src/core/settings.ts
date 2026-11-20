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
