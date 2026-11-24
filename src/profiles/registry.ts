import type { EngineProfile } from '../types/profile.ts';
import { engineTitle } from './presentation.ts';
import { validateProfile } from './schema.ts';
import { FUN_PROFILES } from './funEngines.ts';

/**
 * Every JSON file in ./engines is an engine profile. Adding an engine = dropping in
 * a new JSON file (and optionally its converted audio). No code changes needed.
 */
const modules = import.meta.glob<{ default: unknown }>('./engines/*.json', { eager: true });

export interface ProfileLoadIssue {
  file: string;
  message: string;
}

function load(): { profiles: EngineProfile[]; issues: ProfileLoadIssue[] } {
  const profiles: EngineProfile[] = [];
  const issues: ProfileLoadIssue[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    try {
      profiles.push(validateProfile(mod.default, file));
    } catch (e) {
      issues.push({ file, message: e instanceof Error ? e.message : String(e) });
      console.warn('[profiles] skipped', file, e);
    }
  }
  for (const p of FUN_PROFILES) {
    try {
      profiles.push(validateProfile(p, `fun:${p.id}`));
    } catch (e) {
      issues.push({ file: `fun:${p.id}`, message: e instanceof Error ? e.message : String(e) });
    }
  }
  // Converted (real audio) banks first, then alphabetical by the name users see.
  profiles.sort((a, b) => Number(b.audio.converted) - Number(a.audio.converted) || engineTitle(a).localeCompare(engineTitle(b)));
  return { profiles, issues };
}

const loaded = load();
export const ENGINE_PROFILES: readonly EngineProfile[] = loaded.profiles;
export const PROFILE_ISSUES: readonly ProfileLoadIssue[] = loaded.issues;

export function getProfile(id: string): EngineProfile | undefined {
  return ENGINE_PROFILES.find((p) => p.id === id);
}

export const DEFAULT_PROFILE_ID = getProfile('gt3flat6')?.id ?? ENGINE_PROFILES[0]?.id ?? '';
