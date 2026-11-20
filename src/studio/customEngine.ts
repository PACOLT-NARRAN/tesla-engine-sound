import type { Aspiration, EngineCategory, EngineProfile } from '../types/profile.ts';
import { asRecord, pickEnum, pickNumber, type StoredSchema } from '../storage/storage.ts';
import { clamp } from '../utils/math.ts';

/**
 * Sound Studio: user-made engines. Pure module (no React, no registry), unit tested in Node.
 *
 * A custom engine is a BEHAVIOUR profile (layout, revs, gearbox, response) plus a SOUND source:
 * either an existing project-owned recorded bank or the built-in synthesiser. Technical data
 * alone never creates a new recording — the sound always comes from one of those two sources.
 * All numbers are stored in the units the editor shows (litres, RPM, percent).
 */

export const CUSTOM_LAYOUTS = ['V12', 'V10', 'V8', 'Inline-6', 'Inline-4', 'Flat-6', 'Rotary'] as const;
export type CustomLayout = (typeof CUSTOM_LAYOUTS)[number] & EngineCategory;

export const CUSTOM_INDUCTIONS = ['naturally-aspirated', 'turbo', 'twin-turbo', 'supercharged', 'twin-charged'] as const;
export type CustomInduction = (typeof CUSTOM_INDUCTIONS)[number] & Aspiration;

export const EXHAUSTS = ['stock', 'sport', 'race'] as const;
export type ExhaustCharacter = (typeof EXHAUSTS)[number];

export const GEARBOX_TYPES = ['manual', 'dct', 'automatic'] as const;
export type GearboxType = (typeof GEARBOX_TYPES)[number];

export type SoundSource = { kind: 'bank'; bankId: string } | { kind: 'synth' };

export interface CustomEngineSpec {
  /** 'custom-…' slug, never shown to the user. */
  id: string;
  name: string;
  description: string;
  layout: CustomLayout;
  /** Cylinders, or rotors for a rotary. */
  cylinders: number;
  displacementL: number;
  idleRPM: number;
  /** Redline. The rev limiter cuts LIMITER_MARGIN above it. */
  maxRPM: number;
  induction: CustomInduction;
  exhaust: ExhaustCharacter;
  /** Overrun crackle on lift-off, %. */
  crackle: number;
  gearboxType: GearboxType;
  gearCount: number;
  finalDrive: number;
  /** Own ratios (1st first), or null = generated from the gear count. */
  customRatios: number[] | null;
  /** %, 100 = neutral. */
  throttleResponse: number;
  /** %: how early the gearbox downshifts when coasting, keeping the revs (and engine braking) up. */
  engineBraking: number;
  /** %: loudness of the off-throttle (overrun) sound. */
  overrun: number;
  /** %: turbo whistle (turbo inductions only). */
  turbo: number;
  /** %: supercharger whine (supercharged inductions only). */
  supercharger: number;
  sound: SoundSource;
  createdAt: number;
  updatedAt: number;
}

export type NumericField =
  | 'cylinders' | 'displacementL' | 'idleRPM' | 'maxRPM' | 'crackle' | 'gearCount' | 'finalDrive'
  | 'throttleResponse' | 'engineBraking' | 'overrun' | 'turbo' | 'supercharger';

export interface FieldLimit {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Decimal places accepted and shown. */
  readonly decimals: number;
}

/** Realistic limits of every numeric field. */
export const LIMITS: Readonly<Record<NumericField, FieldLimit>> = {
  cylinders: { min: 2, max: 12, step: 1, decimals: 0 },
  displacementL: { min: 0.6, max: 8.5, step: 0.1, decimals: 1 },
  idleRPM: { min: 500, max: 1500, step: 50, decimals: 0 },
  maxRPM: { min: 4000, max: 11000, step: 100, decimals: 0 },
  crackle: { min: 0, max: 100, step: 5, decimals: 0 },
  gearCount: { min: 4, max: 10, step: 1, decimals: 0 },
  finalDrive: { min: 2, max: 5.5, step: 0.05, decimals: 2 },
  throttleResponse: { min: 50, max: 200, step: 5, decimals: 0 },
  engineBraking: { min: 0, max: 100, step: 5, decimals: 0 },
  overrun: { min: 0, max: 100, step: 5, decimals: 0 },
  turbo: { min: 0, max: 100, step: 5, decimals: 0 },
  supercharger: { min: 0, max: 100, step: 5, decimals: 0 },
};

export const RATIO_LIMITS = { min: 0.4, max: 6, minStep: 0.05, decimals: 2 } as const;
/** Idle must stay at least this far below the redline. */
export const MIN_REV_RANGE = 3000;
export const LIMITER_MARGIN = 200;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 200;
export const MAX_CUSTOM_ENGINES = 50;
const TIRE_RADIUS_M = 0.33;

/** Cylinder counts allowed for each layout (rotary = rotors). */
export const LAYOUT_CYLINDERS: Readonly<Record<CustomLayout, readonly number[]>> = {
  V12: [12], V10: [10], V8: [8], 'Inline-6': [6], 'Inline-4': [4], 'Flat-6': [6], Rotary: [2, 3, 4],
};

export const hasTurbo = (i: CustomInduction) => i === 'turbo' || i === 'twin-turbo' || i === 'twin-charged';
export const hasSupercharger = (i: CustomInduction) => i === 'supercharged' || i === 'twin-charged';

// --- Validation ---------------------------------------------------------------------------

export type IssueField = NumericField | 'name' | 'description' | 'ratios' | 'sound';
export type IssueCode =
  | 'required' | 'tooLong' | 'notNumber' | 'range' | 'decimals' | 'cylinders'
  | 'revRange' | 'ratioCount' | 'ratioRange' | 'ratioOrder' | 'sound';

export interface Issue {
  field: IssueField;
  code: IssueCode;
  /** Gear index for ratio issues (0 = 1st). */
  index?: number;
  params?: Readonly<Record<string, number | string>>;
}

/** Parses a number typed by the user ("5,0" and "5.0" both work). NaN for anything else. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return Number.NaN;
  return Number(t);
}

function checkNumber(field: NumericField, v: number, out: Issue[]): void {
  const l = LIMITS[field];
  if (!Number.isFinite(v)) {
    out.push({ field, code: 'notNumber' });
    return;
  }
  if (v < l.min || v > l.max) out.push({ field, code: 'range', params: { min: l.min, max: l.max } });
  else if (Math.abs(v * 10 ** l.decimals - Math.round(v * 10 ** l.decimals)) > 1e-6) out.push({ field, code: 'decimals', params: { decimals: l.decimals } });
}

/**
 * Every rule a saved engine must satisfy. `banks` = ids of recorded banks that may be used
 * (omit to skip the check, e.g. in pure tests of the numbers).
 */
export function validateSpec(spec: CustomEngineSpec, banks?: ReadonlySet<string>): Issue[] {
  const out: Issue[] = [];
  const name = spec.name.trim();
  if (!name) out.push({ field: 'name', code: 'required' });
  else if (name.length > NAME_MAX) out.push({ field: 'name', code: 'tooLong', params: { max: NAME_MAX } });
  if (spec.description.length > DESCRIPTION_MAX) out.push({ field: 'description', code: 'tooLong', params: { max: DESCRIPTION_MAX } });

  for (const f of Object.keys(LIMITS) as NumericField[]) checkNumber(f, spec[f], out);
  if (Number.isFinite(spec.cylinders) && !LAYOUT_CYLINDERS[spec.layout].includes(spec.cylinders)) {
    out.push({ field: 'cylinders', code: 'cylinders', params: { allowed: LAYOUT_CYLINDERS[spec.layout].join(', ') } });
  }
  if (Number.isFinite(spec.idleRPM) && Number.isFinite(spec.maxRPM) && spec.maxRPM - spec.idleRPM < MIN_REV_RANGE) {
    out.push({ field: 'idleRPM', code: 'revRange', params: { gap: MIN_REV_RANGE } });
  }

  if (spec.customRatios) {
    const r = spec.customRatios;
    if (r.length !== spec.gearCount) out.push({ field: 'ratios', code: 'ratioCount', params: { count: spec.gearCount } });
    r.forEach((v, i) => {
      if (!Number.isFinite(v)) out.push({ field: 'ratios', code: 'notNumber', index: i });
      else if (v < RATIO_LIMITS.min || v > RATIO_LIMITS.max) out.push({ field: 'ratios', code: 'ratioRange', index: i, params: { min: RATIO_LIMITS.min, max: RATIO_LIMITS.max } });
      else if (i > 0 && Number.isFinite(r[i - 1] as number) && (r[i - 1] as number) - v < RATIO_LIMITS.minStep - 1e-9) {
        out.push({ field: 'ratios', code: 'ratioOrder', index: i, params: { step: RATIO_LIMITS.minStep } });
      }
    });
  }
  if (spec.sound.kind === 'bank' && banks && !banks.has(spec.sound.bankId)) out.push({ field: 'sound', code: 'sound' });
  return out;
}

// --- Editor draft ------------------------------------------------------------------------

/** What the editor holds: numbers as typed text, so a half-typed value is never lost. */
export type CustomEngineDraft = Omit<CustomEngineSpec, NumericField | 'customRatios'> & Record<NumericField, string> & {
  /** null = generated ratios. */
  ratios: string[] | null;
};

export function toDraft(spec: CustomEngineSpec): CustomEngineDraft {
  const nums = Object.fromEntries((Object.keys(LIMITS) as NumericField[]).map((f) => [f, String(spec[f])])) as Record<NumericField, string>;
  const { customRatios, ...rest } = spec;
  return { ...rest, ...nums, ratios: customRatios ? customRatios.map((r) => r.toFixed(RATIO_LIMITS.decimals)) : null };
}

/** Draft → spec + issues. The spec is null while anything is invalid. */
export function parseDraft(d: CustomEngineDraft, banks?: ReadonlySet<string>): { spec: CustomEngineSpec | null; issues: Issue[] } {
  const nums = Object.fromEntries((Object.keys(LIMITS) as NumericField[]).map((f) => [f, parseNumber(d[f])])) as Record<NumericField, number>;
  const { ratios, ...rest } = d;
  const spec: CustomEngineSpec = {
    ...rest, ...nums,
    name: d.name.trim(), description: d.description.trim(),
    customRatios: ratios ? ratios.map(parseNumber) : null,
  };
  const issues = validateSpec(spec, banks);
  return { spec: issues.length ? null : spec, issues };
}

// --- Defaults, ids, gear ratios -----------------------------------------------------------

export function newCustomId(now = Date.now(), rnd = Math.random): string {
  return `custom-${now.toString(36)}${Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

export const isCustomId = (id: string) => id.startsWith('custom-');

/** The editor's starting point: the example from the product brief (5.0 L twin-turbo V8). */
export function defaultSpec(now = Date.now(), id = newCustomId(now)): CustomEngineSpec {
  return {
    id, name: '', description: '', layout: 'V8', cylinders: 8, displacementL: 5, idleRPM: 850, maxRPM: 8500,
    induction: 'twin-turbo', exhaust: 'race', crackle: 35, gearboxType: 'dct', gearCount: 7, finalDrive: 3.7,
    customRatios: null, throttleResponse: 100, engineBraking: 50, overrun: 50, turbo: 60, supercharger: 0,
    sound: { kind: 'synth' }, createdAt: now, updatedAt: now,
  };
}

/** Typical close-ratio gearbox: big steps low down, small steps up top (strictly descending). */
export function generateRatios(gearCount: number): number[] {
  const n = Math.round(clamp(gearCount, LIMITS.gearCount.min, LIMITS.gearCount.max));
  const first = clamp(3.4 + 0.15 * (n - 6), 2.9, 4.7);
  const last = n <= 5 ? 0.85 : n <= 7 ? 0.78 : 0.66;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.pow(i / (n - 1), 0.8);
    let r = Math.round(first * Math.pow(last / first, x) * 100) / 100;
    const prev = out[i - 1];
    if (prev !== undefined && prev - r < RATIO_LIMITS.minStep) r = Math.round((prev - RATIO_LIMITS.minStep) * 100) / 100;
    out.push(r);
  }
  return out;
}

export function effectiveRatios(spec: Pick<CustomEngineSpec, 'customRatios' | 'gearCount'>): number[] {
  return spec.customRatios ?? generateRatios(spec.gearCount);
}

/** Road speed (m/s) at `rpm` in a gear. */
export function speedAtRpm(rpm: number, ratio: number, finalDrive: number, tireRadiusM = TIRE_RADIUS_M): number {
  return (rpm / (ratio * finalDrive) / 60) * 2 * Math.PI * tireRadiusM;
}

// --- Spec → engine profile -----------------------------------------------------------------

const EXHAUST: Readonly<Record<ExhaustCharacter, { volume: number; bark: number; brightness: number; roughness: number }>> = {
  stock: { volume: 0.85, bark: 0.3, brightness: 0.5, roughness: 0.2 },
  sport: { volume: 1, bark: 0.6, brightness: 0.7, roughness: 0.35 },
  race: { volume: 1.12, bark: 0.9, brightness: 0.9, roughness: 0.55 },
};

const GEARBOX: Readonly<Record<GearboxType, { shiftDuration: number; minShiftInterval: number }>> = {
  dct: { shiftDuration: 0.16, minShiftInterval: 0.75 },
  manual: { shiftDuration: 0.38, minShiftInterval: 0.9 },
  automatic: { shiftDuration: 0.5, minShiftInterval: 1.1 },
};

/**
 * Turns a (valid) spec into the EngineProfile the drivetrain and audio engine already use.
 * `bank` is the built-in engine whose recorded sound bank is borrowed; without it (or for
 * kind 'synth') the built-in synthesiser plays.
 */
export function buildCustomProfile(spec: CustomEngineSpec, bank?: EngineProfile): EngineProfile {
  const idle = spec.idleRPM;
  const red = spec.maxRPM;
  const range = red - idle;
  const at = (k: number) => Math.round(idle + range * k);
  const ex = EXHAUST[spec.exhaust];
  const gb = GEARBOX[spec.gearboxType];
  const response = spec.throttleResponse / 100;
  const useBank = spec.sound.kind === 'bank' && bank?.audio.converted === true;
  const pct = (v: number) => clamp(v / 100, 0, 1);

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.layout,
    aspiration: spec.induction,
    cylinders: spec.cylinders,
    displacementL: spec.displacementL,
    source: { configLabel: 'Sound Studio', soundName: useBank && bank ? bank.id : 'synth', awc: '', audioConfig: [] },
    idleRPM: idle,
    redlineRPM: red,
    limiterRPM: red + LIMITER_MARGIN,
    gearbox: {
      gearRatios: effectiveRatios(spec),
      finalDrive: spec.finalDrive,
      tireRadiusM: TIRE_RADIUS_M,
      shiftUpRPM: { gentle: at(0.25), hard: red - 150 },
      // More engine braking = the gearbox downshifts earlier when coasting, keeping the revs up.
      shiftDownRPM: { gentle: at(0.03 + 0.15 * pct(spec.engineBraking)), hard: at(0.44) },
      shiftDuration: gb.shiftDuration,
      minShiftInterval: gb.minShiftInterval,
      launchRPM: at(0.38),
    },
    dynamics: { engineResponse: 0.08 / response, throttleSensitivity: Math.sqrt(response), fullThrottleAccel: 4 },
    audio: {
      converted: useBank,
      manifest: useBank && bank ? bank.audio.manifest : '',
      volume: (useBank && bank ? bank.audio.volume : 1) * ex.volume,
      pitch: useBank && bank ? bank.audio.pitch : 1,
      overrunPops: pct(spec.crackle),
      shiftBark: ex.bark,
      blowoff: hasTurbo(spec.induction) ? 0.7 : 0,
      turbo: hasTurbo(spec.induction) ? pct(spec.turbo) : 0,
      supercharger: hasSupercharger(spec.induction) ? pct(spec.supercharger) : 0,
      offLoad: 0.6 + 0.8 * pct(spec.overrun),
      ...(useBank && bank ? { bankRpm: { idle: bank.idleRPM, limiter: bank.limiterRPM } } : {}),
      placeholderTone: { brightness: ex.brightness, roughness: ex.roughness },
    },
  };
}

/** Studio starting point copied from an existing engine ("Use as base"). */
export function specFromProfile(p: EngineProfile, name: string, now = Date.now()): CustomEngineSpec {
  const layout = pickEnum(p.category, CUSTOM_LAYOUTS, 'V8');
  const allowed = LAYOUT_CYLINDERS[layout];
  const ratios = p.gearbox.gearRatios.slice(0, LIMITS.gearCount.max).map((r) => Math.round(clamp(r, RATIO_LIMITS.min, RATIO_LIMITS.max) * 100) / 100);
  const ratiosOk = ratios.length >= LIMITS.gearCount.min && ratios.every((r, i) => i === 0 || (ratios[i - 1] as number) - r >= RATIO_LIMITS.minStep - 1e-9);
  const induction = pickEnum(p.aspiration, CUSTOM_INDUCTIONS, 'naturally-aspirated');
  const round = (v: number, step: number) => Math.round(v / step) * step;
  return {
    ...defaultSpec(now),
    name: name.slice(0, NAME_MAX),
    layout,
    cylinders: allowed.includes(p.cylinders) ? p.cylinders : (allowed[0] as number),
    displacementL: clamp(Math.round((p.displacementL ?? 3) * 10) / 10, LIMITS.displacementL.min, LIMITS.displacementL.max),
    idleRPM: clamp(round(p.idleRPM, 50), LIMITS.idleRPM.min, LIMITS.idleRPM.max),
    maxRPM: clamp(round(p.redlineRPM, 100), LIMITS.maxRPM.min, LIMITS.maxRPM.max),
    induction,
    crackle: clamp(round(p.audio.overrunPops * 100, 5), 0, 100),
    gearCount: ratiosOk ? ratios.length : 7,
    finalDrive: clamp(Math.round(p.gearbox.finalDrive * 20) / 20, LIMITS.finalDrive.min, LIMITS.finalDrive.max),
    customRatios: ratiosOk ? ratios : null,
    turbo: hasTurbo(induction) ? 60 : 0,
    supercharger: hasSupercharger(induction) ? 60 : 0,
    sound: p.audio.converted ? { kind: 'bank', bankId: p.id } : { kind: 'synth' },
  };
}

/** Copy with a new id and timestamps ("Duplicate"). */
export function duplicateSpec(spec: CustomEngineSpec, name: string, now = Date.now()): CustomEngineSpec {
  return { ...spec, id: newCustomId(now), name: name.slice(0, NAME_MAX), customRatios: spec.customRatios ? [...spec.customRatios] : null, createdAt: now, updatedAt: now };
}

// --- Storage ------------------------------------------------------------------------------

/** Repairs one stored engine; null if it cannot be made valid (it is then dropped). */
export function sanitizeSpec(raw: unknown): CustomEngineSpec | null {
  const o = asRecord(raw);
  if (typeof o.id !== 'string' || !/^custom-[a-z0-9]{1,40}$/.test(o.id)) return null;
  const d = defaultSpec(0, o.id);
  const num = (k: NumericField) => pickNumber(o[k], -Infinity, Infinity, Number.NaN);
  const sound = asRecord(o.sound);
  const ratios = Array.isArray(o.customRatios) ? o.customRatios.map((r) => (typeof r === 'number' ? r : Number.NaN)) : null;
  const spec: CustomEngineSpec = {
    id: o.id,
    name: typeof o.name === 'string' ? o.name.slice(0, NAME_MAX) : '',
    description: typeof o.description === 'string' ? o.description.slice(0, DESCRIPTION_MAX) : '',
    layout: pickEnum(o.layout, CUSTOM_LAYOUTS, d.layout),
    induction: pickEnum(o.induction, CUSTOM_INDUCTIONS, d.induction),
    exhaust: pickEnum(o.exhaust, EXHAUSTS, d.exhaust),
    gearboxType: pickEnum(o.gearboxType, GEARBOX_TYPES, d.gearboxType),
    cylinders: num('cylinders'), displacementL: num('displacementL'), idleRPM: num('idleRPM'), maxRPM: num('maxRPM'),
    crackle: num('crackle'), gearCount: num('gearCount'), finalDrive: num('finalDrive'),
    throttleResponse: num('throttleResponse'), engineBraking: num('engineBraking'), overrun: num('overrun'),
    turbo: num('turbo'), supercharger: num('supercharger'),
    customRatios: ratios,
    sound: sound.kind === 'bank' && typeof sound.bankId === 'string' && /^[a-z0-9_-]{1,64}$/.test(sound.bankId) ? { kind: 'bank', bankId: sound.bankId } : { kind: 'synth' },
    createdAt: pickNumber(o.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: pickNumber(o.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  return validateSpec(spec).length === 0 ? spec : null;
}

export const CUSTOM_ENGINES_SCHEMA: StoredSchema<CustomEngineSpec[]> = {
  key: 'revline.customEngines.v1',
  version: 1,
  defaults: () => [],
  sanitize: (data) => {
    if (!Array.isArray(data)) return [];
    const out: CustomEngineSpec[] = [];
    for (const raw of data) {
      const s = sanitizeSpec(raw);
      if (s && !out.some((x) => x.id === s.id)) out.push(s);
      if (out.length >= MAX_CUSTOM_ENGINES) break;
    }
    return out;
  },
};

/** Insert or replace by id (newest edit last-modified first is up to the caller's sort). */
export function upsertSpec(list: readonly CustomEngineSpec[], spec: CustomEngineSpec): CustomEngineSpec[] {
  const i = list.findIndex((s) => s.id === spec.id);
  if (i === -1) return [...list, spec];
  const out = [...list];
  out[i] = spec;
  return out;
}
