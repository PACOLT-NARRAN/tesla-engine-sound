import type { EngineProfile } from '../types/profile.ts';

export class ProfileError extends Error {}

const num = (o: Record<string, unknown>, k: string, path: string): number => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ProfileError(`${path}.${k} must be a number`);
  return v;
};
const obj = (v: unknown, path: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ProfileError(`${path} must be an object`);
  return v as Record<string, unknown>;
};

/**
 * Validates an engine profile loaded from JSON. Throws ProfileError with a precise path,
 * so a broken profile file is reported instead of breaking the app.
 */
export function validateProfile(input: unknown, file = 'profile'): EngineProfile {
  const p = obj(input, file);
  if (typeof p.id !== 'string' || !/^[a-z0-9_-]+$/.test(p.id)) throw new ProfileError(`${file}.id must be a lowercase slug`);
  if (typeof p.name !== 'string' || !p.name) throw new ProfileError(`${file}.name is required`);
  const idle = num(p, 'idleRPM', file);
  const red = num(p, 'redlineRPM', file);
  const lim = num(p, 'limiterRPM', file);
  if (!(idle > 300 && red > idle && lim >= red)) throw new ProfileError(`${file}: require 300 < idleRPM < redlineRPM <= limiterRPM`);
  const gb = obj(p.gearbox, `${file}.gearbox`);
  const ratios = gb.gearRatios;
  if (!Array.isArray(ratios) || ratios.length < 1 || ratios.some((r) => typeof r !== 'number' || r <= 0)) {
    throw new ProfileError(`${file}.gearbox.gearRatios must be positive numbers`);
  }
  for (let i = 1; i < ratios.length; i++) {
    if ((ratios[i] as number) >= (ratios[i - 1] as number)) throw new ProfileError(`${file}.gearbox.gearRatios must be descending`);
  }
  num(gb, 'finalDrive', `${file}.gearbox`);
  num(gb, 'tireRadiusM', `${file}.gearbox`);
  const up = obj(gb.shiftUpRPM, `${file}.gearbox.shiftUpRPM`);
  const down = obj(gb.shiftDownRPM, `${file}.gearbox.shiftDownRPM`);
  if (num(up, 'hard', 'shiftUpRPM') <= num(down, 'hard', 'shiftDownRPM') ||
      num(up, 'gentle', 'shiftUpRPM') <= num(down, 'gentle', 'shiftDownRPM')) {
    throw new ProfileError(`${file}: upshift RPM must be above downshift RPM`);
  }
  obj(p.dynamics, `${file}.dynamics`);
  const audio = obj(p.audio, `${file}.audio`);
  if (typeof audio.manifest !== 'string') throw new ProfileError(`${file}.audio.manifest is required`);
  return p as unknown as EngineProfile;
}
