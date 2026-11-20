import type { EngineProfile } from '../types/profile.ts';
import { asRecord, pickBool, pickEnum, pickNumber, pickString, type StoredSchema } from '../storage/storage.ts';
import type { Language } from '../i18n/index.ts';

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
  /** UI language chosen by the user; null = follow the browser language. */
  language: Language | null;
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
 * Virtual gearing ("SHORT / MEDIUM / ORIGINAL" in the UI): a multiplier on the profile's final
 * drive. A shorter final drive means more engine RPM at the same road speed, so the whole rev
 * range is heard at everyday speeds. The factors were tuned so that the K20A, driven with the
 * automatic gearbox, felt like reaching its full revs around 100 / 130 / 160 km/h; they are NOT
 * exact speeds for every engine and do not affect Demo speeds. See docs/SETTINGS.md.
 */
export const GEARING_FACTOR: Record<Gearing, number> = { real: 1, normal: 160 / 130, fun: 160 / 100 };

export const GEARINGS: readonly Gearing[] = ['fun', 'normal', 'real'];
export const SHIFT_STYLES: readonly ShiftStyle[] = ['comfort', 'sport', 'track'];
export const THEMES: readonly Theme[] = ['dark', 'light'];
export const LANGUAGES: readonly Language[] = ['en', 'cs'];

/**
 * Persisted under the key used since the first release. Version 1 = the bare settings object
 * written before the versioned storage layer; version 2 = enveloped, adds `language`.
 */
export function settingsSchema(defaults: Settings): StoredSchema<Settings> {
  return {
    key: 'revline.settings.v1',
    version: 2,
    legacyVersion: 1,
    defaults: () => ({ ...defaults }),
    migrations: {
      1: (data) => ({ ...asRecord(data), language: null }),
    },
    sanitize: (data, d) => {
      const o = asRecord(data);
      return {
        profileId: pickString(o.profileId, d.profileId, 64),
        volume: pickNumber(o.volume, 0, 1, d.volume),
        units: pickEnum(o.units, ['kmh', 'mph'] as const, d.units),
        demoScenarioId: pickString(o.demoScenarioId, d.demoScenarioId, 64),
        demoNoise: pickBool(o.demoNoise, d.demoNoise),
        demoNoCoordsSpeed: pickBool(o.demoNoCoordsSpeed, d.demoNoCoordsSpeed),
        gearing: pickEnum(o.gearing, GEARINGS, d.gearing),
        shiftStyle: pickEnum(o.shiftStyle, SHIFT_STYLES, d.shiftStyle),
        theme: pickEnum(o.theme, THEMES, d.theme),
        language: typeof o.language === 'string' && (LANGUAGES as readonly string[]).includes(o.language) ? (o.language as Language) : d.language,
      };
    },
  };
}

/** Profile copy with the final drive scaled for the chosen gearing mode. */
export function withGearing(p: EngineProfile, gearing: Gearing): EngineProfile {
  const k = GEARING_FACTOR[gearing] ?? 1;
  return k === 1 ? p : { ...p, gearbox: { ...p.gearbox, finalDrive: p.gearbox.finalDrive * k } };
}
