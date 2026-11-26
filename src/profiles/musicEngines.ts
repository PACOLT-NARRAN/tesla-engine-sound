import type { EngineCatalogEntry } from '../types/catalog.ts';
import type { EngineProfile } from '../types/profile.ts';
import { TRACKS, type MusicTrack } from '../audio/music/tracks.ts';

/**
 * Music packs: generative music and arranged songs instead of an engine (src/audio/music/). The drivetrain
 * still runs underneath, because its gear shifts become musical events (upshift = new section,
 * downshift = drum fill) and the REV pedal builds a riser.
 */
const TIRE = 0.32;
const RATIOS = [3.6, 2.2, 1.5, 1.15, 0.92, 0.78];

function toProfile(r: MusicTrack): EngineProfile {
  return {
    id: `music-${r.id}`,
    name: r.name,
    description: r.en,
    category: 'Unknown',
    aspiration: 'unknown',
    cylinders: 1,
    displacementL: null,
    source: { configLabel: 'REVLINE drive music', soundName: `music:${r.id}`, awc: '', audioConfig: [] },
    idleRPM: 800,
    redlineRPM: 6000,
    limiterRPM: 6200,
    gearbox: {
      gearRatios: RATIOS,
      finalDrive: 3.4,
      tireRadiusM: TIRE,
      shiftUpRPM: { gentle: 2200, hard: 5600 },
      shiftDownRPM: { gentle: 1100, hard: 2800 },
      shiftDuration: 0.25,
      minShiftInterval: 1.2,
      launchRPM: 2200,
    },
    dynamics: { engineResponse: 0.1, throttleSensitivity: 1, fullThrottleAccel: 4 },
    audio: {
      converted: false,
      manifest: '',
      volume: 1,
      pitch: 1,
      overrunPops: 0,
      shiftBark: 0,
      turbo: 0,
      music: r.id,
      placeholderTone: { brightness: 0.5, roughness: 0 },
    },
  };
}

export const MUSIC_PROFILES: readonly EngineProfile[] = TRACKS.map(toProfile);

export const MUSIC_CATALOG: readonly EngineCatalogEntry[] = TRACKS.map((r) => ({
  id: `music-${r.id}`, displayName: r.name, origin: 'music', shortDescription: { en: r.en, cs: r.cs }, tags: ['music', ...r.tags], tier: 'pack', packId: r.pack,
}));
