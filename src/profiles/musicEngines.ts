import type { EngineCatalogEntry } from '../types/catalog.ts';
import type { EngineProfile } from '../types/profile.ts';

/**
 * DRIVE MUSIC pack: generative music instead of an engine (src/audio/music/). The drivetrain
 * still runs underneath, because its gear shifts become musical events (upshift = new section,
 * downshift = drum fill) and the REV pedal builds a riser.
 */
interface MusicRow {
  id: string;
  style: string;
  name: string;
  en: string;
  cs: string;
  tags: readonly string[];
}

const ROWS: readonly MusicRow[] = [
  { id: 'music-synthwave', style: 'synthwave', name: 'NIGHT DRIVE SYNTHWAVE',
    en: '80s synthwave that grows with speed: pads at the lights, bass and beat in town, a racing arpeggio on the motorway.',
    cs: 'Synthwave z osmdesátek, který roste s rychlostí: na semaforu plochy, ve městě basa a beat, na dálnici hnaný arpeggiátor.', tags: ['music', 'synthwave'] },
  { id: 'music-techno', style: 'techno', name: 'MOTORWAY TECHNO',
    en: 'Four-on-the-floor techno with an acid bass that screams when you accelerate.',
    cs: 'Techno na čtyři doby s acid basou, která zakvílí, když zrychlíš.', tags: ['music', 'techno'] },
  { id: 'music-lofi', style: 'lofi', name: 'LO-FI CITY CRUISE',
    en: 'Relaxed lo-fi beat with electric piano and vinyl crackle for slow city cruising.',
    cs: 'Pohodový lo-fi beat s elektrickým pianem a praskáním desky na pomalé projížďky městem.', tags: ['music', 'lofi', 'chill'] },
  { id: 'music-ambient', style: 'ambient', name: 'AMBIENT LANDSCAPE',
    en: 'Floating ambient for long trips: slow chords, glassy bells in the bends and soft drums only at speed.',
    cs: 'Vznášivý ambient na dlouhé cesty: pomalé akordy, skleněné zvonky v zatáčkách a jemné bicí jen v rychlosti.', tags: ['music', 'ambient', 'chill'] },
  { id: 'music-epic', style: 'epic', name: 'EPIC FILM SCORE',
    en: 'Film-trailer score: strings and cellos, taiko drums when you cruise and brass when you floor it.',
    cs: 'Hudba jako z filmového traileru: smyčce a violoncella, taiko bubny při jízdě a žestě, když šlápneš na plyn.', tags: ['music', 'epic', 'cinematic'] },
];

const TIRE = 0.32;
const RATIOS = [3.6, 2.2, 1.5, 1.15, 0.92, 0.78];

function toProfile(r: MusicRow): EngineProfile {
  return {
    id: r.id,
    name: r.name,
    description: r.en,
    category: 'Unknown',
    aspiration: 'unknown',
    cylinders: 1,
    displacementL: null,
    source: { configLabel: 'REVLINE drive music', soundName: `music:${r.style}`, awc: '', audioConfig: [] },
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
      music: r.style,
      placeholderTone: { brightness: 0.5, roughness: 0 },
    },
  };
}

export const MUSIC_PROFILES: readonly EngineProfile[] = ROWS.map(toProfile);

export const MUSIC_CATALOG: readonly EngineCatalogEntry[] = ROWS.map((r) => ({
  id: r.id, displayName: r.name, origin: 'music', shortDescription: { en: r.en, cs: r.cs }, tags: r.tags, tier: 'pack', packId: 'drive-music',
}));
