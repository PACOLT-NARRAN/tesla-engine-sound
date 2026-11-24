import { even, harmonics, type ToneSpec, type VoiceRecipe } from './voiceSynth.ts';

/**
 * Recipes of the REVLINE fun-pack voices (see voiceSynth.ts). Every engine of the fun packs
 * names one of these in `audio.voice`. Tune freely: the numbers are sound design, not physics.
 */

/** Harmonic series of f0 shaped by vowel formants [Hz, width Hz, gain] (voice-like timbre). */
function vowel(f0: number, count: number, formants: ReadonlyArray<readonly [number, number, number]>, gain: number, extra: Partial<ToneSpec> = {}): ToneSpec[] {
  const out: ToneSpec[] = [];
  for (let k = 1; k <= count; k++) {
    const f = f0 * k;
    let env = 0.08;
    for (const [c, w, g] of formants) env += g * Math.exp(-(((f - c) / w) ** 2));
    out.push({ hz: f, gain: (gain * env) / Math.sqrt(k), ...extra });
  }
  return out;
}

const TWO_STROKE_OFF = { pulse: 0.55, misfire: 0.3, burble: 0.08, lowpass: 0.75 } as const;
const FOUR_STROKE_OFF = { pulse: 0.5, burble: 0.12, lowpass: 0.65 } as const;

export const VOICES: Readonly<Record<string, VoiceRecipe>> = {
  // --- Two-strokes ------------------------------------------------------------------------
  moped50: {
    cycleRevs: 1, events: [0], pulse: { decayMs: 2.5, click: 1, noise: 0.8 },
    formants: [[750, 2, 1], [1900, 3, 0.8], [3300, 4, 0.45]], formantTrack: 0.8, pipe: [1.1, 0.55],
    lowpass: [3800, 7500], noise: { gain: [0.08, 0.18], hz: [3000, 5200], q: 1, pulsed: 0.6 },
    off: TWO_STROKE_OFF, drive: 2.4,
  },
  smoke600: {
    cycleRevs: 1, events: [0, 0.5], eventGains: [1, 0.9], pulse: { decayMs: 3.5, click: 1, noise: 0.7, thumpHz: 90, thump: 0.4 },
    formants: [[360, 1.5, 1], [950, 2.5, 0.7], [2300, 3, 0.35]], formantTrack: 0.6, pipe: [2.2, 0.5],
    lowpass: [2600, 5200], misfire: 0.03, rattle: 0.05, noise: { gain: [0.06, 0.12], hz: [1500, 3000], q: 1, pulsed: 0.6 },
    off: TWO_STROKE_OFF, drive: 2.2,
  },
  triple1000: {
    cycleRevs: 1, events: even(3), pulse: { decayMs: 3.5, click: 1, noise: 0.7, thumpHz: 80, thump: 0.4 },
    formants: [[310, 1.4, 1], [820, 2.5, 0.6], [1950, 3, 0.4]], formantTrack: 0.6, pipe: [2.6, 0.5],
    lowpass: [2400, 5200], misfire: 0.02, noise: { gain: [0.05, 0.12], hz: [1400, 2800], q: 1, pulsed: 0.6 },
    off: TWO_STROKE_OFF, drive: 2.1,
  },
  gp125: {
    cycleRevs: 1, events: [0], pulse: { decayMs: 1.8, click: 1, noise: 0.9 },
    formants: [[1150, 2.5, 1], [2600, 3, 0.85], [4300, 4, 0.45]], formantTrack: 0.9, pipe: [0.8, 0.6],
    lowpass: [5200, 9500], noise: { gain: [0.06, 0.2], hz: [3500, 6000], q: 1, pulsed: 0.7 },
    off: TWO_STROKE_OFF, drive: 2.8,
  },
  kart100: {
    cycleRevs: 1, events: [0], pulse: { decayMs: 2.2, click: 1, noise: 0.8 },
    formants: [[900, 2, 1], [2050, 3, 0.65], [3600, 4, 0.3]], formantTrack: 0.8, pipe: [1, 0.55],
    lowpass: [4500, 8500], rattle: 0.04, off: TWO_STROKE_OFF, drive: 2.5,
  },

  // --- Old cars ---------------------------------------------------------------------------
  tiny650: {
    cycleRevs: 2, events: [0, 0.5], pulse: { decayMs: 4, click: 0.8, noise: 0.7, thumpHz: 70, thump: 0.6 },
    formants: [[280, 1.3, 1], [760, 2, 0.6], [1800, 3, 0.3]], pipe: [3.5, 0.45], lowpass: [1800, 3800],
    misfire: 0.04, rattle: 0.12, noise: { gain: [0.06, 0.14], hz: [1200, 2500], q: 1, pulsed: 0.5 },
    off: { ...FOUR_STROKE_OFF, misfire: 0.15 }, drive: 2,
  },
  hatchDiesel: {
    cycleRevs: 2, events: even(4), pulse: { decayMs: 5, click: 0.6, noise: 0.6, thumpHz: 60, thump: 0.6 },
    formants: [[220, 1.2, 1], [600, 1.8, 0.6], [1500, 2.5, 0.3]], pipe: [4, 0.4], lowpass: [1600, 3200],
    knock: 0.65, rattle: 0.05, off: { pulse: 0.6, lowpass: 0.7 }, drive: 1.8,
  },
  rear12: {
    cycleRevs: 2, events: even(4), pulse: { decayMs: 3.5, click: 0.8, noise: 0.7, thumpHz: 80, thump: 0.4 },
    formants: [[320, 1.4, 1], [900, 2, 0.5], [2100, 3, 0.3]], pipe: [3, 0.5], lowpass: [2200, 4500],
    misfire: 0.02, rattle: 0.07, off: FOUR_STROKE_OFF, drive: 1.9,
  },
  soviet15: {
    cycleRevs: 2, events: even(4), eventGains: [1, 0.8, 1.05, 0.85], pulse: { decayMs: 4, click: 0.8, noise: 0.7, thumpHz: 70, thump: 0.5 },
    formants: [[260, 1.3, 1], [700, 1.8, 0.6], [1700, 2.5, 0.35]], pipe: [4.5, 0.45], lowpass: [2000, 4000],
    misfire: 0.03, rattle: 0.09, tones: (c) => [{ hz: c.fRev * 9.3, gain: 0.03 + 0.05 * c.norm }],
    off: { ...FOUR_STROKE_OFF, misfire: 0.1 }, drive: 2,
  },
  leaky13: {
    cycleRevs: 2, events: even(4), pulse: { decayMs: 3, click: 1, noise: 0.9 },
    formants: [[300, 1.4, 1], [1100, 2, 0.6], [3000, 2, 0.9]], pipe: [2, 0.3], lowpass: [3500, 6000],
    misfire: 0.05, noise: { gain: [0.3, 0.4], hz: [2500, 4000], q: 1.2, pulsed: 0.9 },
    off: { ...FOUR_STROKE_OFF, misfire: 0.2, burble: 0.2 }, drive: 2.6,
  },
  beerVan: {
    cycleRevs: 2, events: even(4), pulse: { decayMs: 6, click: 0.5, noise: 0.6, thumpHz: 50, thump: 0.8 },
    formants: [[180, 1.1, 1], [480, 1.6, 0.6], [1200, 2.2, 0.3]], pipe: [5, 0.4], lowpass: [1300, 2600],
    knock: 0.8, rattle: 0.08, off: { pulse: 0.6, lowpass: 0.7 }, drive: 1.9,
  },

  // --- Motorbikes ------------------------------------------------------------------------
  superbike: {
    cycleRevs: 2, events: even(4), pulse: { decayMs: 1.6, click: 1, noise: 0.8 },
    formants: [[620, 1.6, 1], [1550, 2.2, 0.8], [3300, 3, 0.5]], formantTrack: 0.7, pipe: [1.4, 0.55],
    lowpass: [4000, 9000], noise: { gain: [0.06, 0.22], hz: [1500, 4200], q: 1, pulsed: 0.4 },
    crackle: { perSec: [0, 0], gain: 0 }, off: { pulse: 0.5, burble: 0.12 }, drive: 2.2,
  },
  vtwin: {
    // 45° V-twin: fires at 0° and 315°, then a 405° gap — the "potato-potato" lope.
    cycleRevs: 2, events: [0, 315 / 720], eventGains: [1, 0.92], pulse: { decayMs: 6, click: 0.7, noise: 0.6, thumpHz: 55, thump: 0.9 },
    formants: [[150, 1.1, 1], [420, 1.6, 0.6], [1100, 2.2, 0.3]], pipe: [5, 0.45], lowpass: [1500, 3500],
    off: { pulse: 0.55, burble: 0.15, lowpass: 0.7 }, drive: 2,
  },
  triple900: {
    cycleRevs: 2, events: even(3), pulse: { decayMs: 2.5, click: 1, noise: 0.8, thumpHz: 90, thump: 0.4 },
    formants: [[400, 1.4, 1], [1100, 2, 0.7], [2500, 3, 0.4]], formantTrack: 0.5, pipe: [2, 0.5], lowpass: [3000, 7000],
    off: FOUR_STROKE_OFF, drive: 2.1,
  },
  thumper: {
    cycleRevs: 2, events: [0], pulse: { decayMs: 5, click: 0.8, noise: 0.7, thumpHz: 70, thump: 0.9 },
    formants: [[220, 1.3, 1], [650, 2, 0.6], [1600, 3, 0.35]], pipe: [3, 0.5], lowpass: [2500, 6000],
    off: { pulse: 0.5, burble: 0.18, lowpass: 0.65 }, drive: 2.2,
  },
  boxerTwin: {
    cycleRevs: 2, events: [0, 0.5], pulse: { decayMs: 4.5, click: 0.8, noise: 0.7, thumpHz: 65, thump: 0.7 },
    formants: [[200, 1.2, 1], [550, 1.8, 0.6], [1400, 2.5, 0.3]], pipe: [3.5, 0.45], lowpass: [2200, 4500],
    rattle: 0.04, off: FOUR_STROKE_OFF, drive: 1.9,
  },

  // --- Aircraft ----------------------------------------------------------------------------
  helicopter: {
    // One cycle = one main-rotor turn, four blade slaps.
    cycleRevs: 1, revScale: 15, events: even(4), loopS: 1,
    pulse: { decayMs: 22, click: 0.3, noise: 0.9, thumpHz: 42, thump: 1.1 },
    formants: [[90, 1, 1], [300, 1.5, 0.6], [900, 2, 0.25]], direct: 0.1, lowpass: [900, 1500],
    tones: (c) => [{ hz: 2500 + 2200 * c.norm, gain: 0.05 }, { hz: 5100 + 3000 * c.norm, gain: 0.025 }],
    noise: { gain: [0.1, 0.18], hz: [1200, 2400], q: 0.7 }, level: [0.75, 1], drive: 1.6,
  },
  radial9: {
    cycleRevs: 2, events: even(9), pulse: { decayMs: 3, click: 0.8, noise: 0.7, thumpHz: 80, thump: 0.4 },
    formants: [[200, 1.2, 1], [600, 1.8, 0.6], [1400, 2.5, 0.3]], pipe: [5, 0.4], lowpass: [1600, 3500], misfire: 0.02,
    tones: (c) => harmonics(c.fRev * 0.5 * 3, 4, 0.16, 1.2),
    noise: { gain: [0.04, 0.12], hz: [600, 1200], q: 0.6 }, off: FOUR_STROKE_OFF, drive: 2,
  },
  airliner: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => [
      ...harmonics(c.fRev, 10, 0.05 + 0.12 * c.norm, 0.6), // fan "buzzsaw"
      { hz: c.fRev * 22, gain: 0.08 }, // fan blade pass
      { hz: 4200 + 3200 * c.norm, gain: 0.035 }, // core whine
    ],
    noise: { gain: [0.25, 0.6], hz: [420, 950], q: 0.5 }, rumble: { gain: [0.05, 0.3], hz: 80 },
    level: [0.6, 1], drive: 1.4,
  },
  fighter: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => [{ hz: 2600 + 3000 * c.norm, gain: 0.04 }, ...harmonics(c.fRev, 4, 0.05, 0.8)],
    noise: { gain: [0.4, 0.85], hz: [300, 750], q: 0.5 }, rumble: { gain: [0.2, 0.7], hz: 60 },
    crackle: { perSec: [5, 70], gain: 0.6 }, level: [0.65, 1], drive: 2.5,
  },
  turboprop: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => [...harmonics(c.fRev * 4, 6, 0.22, 1.1), { hz: 5200 + 1500 * c.norm, gain: 0.03 }],
    noise: { gain: [0.08, 0.2], hz: [500, 900], q: 0.6 }, rumble: { gain: [0.05, 0.15], hz: 70 }, drive: 1.5,
  },
  ultralight: {
    cycleRevs: 1, events: [0, 0.5], pulse: { decayMs: 2.8, click: 1, noise: 0.8 },
    formants: [[600, 2, 1], [1500, 3, 0.6], [2800, 4, 0.3]], formantTrack: 0.7, pipe: [1.5, 0.5], lowpass: [3500, 7000],
    tones: (c) => harmonics(c.fRev * 0.4 * 2, 5, 0.18, 1.1), off: TWO_STROKE_OFF, drive: 2.3,
  },

  // --- Locomotives -------------------------------------------------------------------------
  steam: {
    // One cycle = one driving-wheel turn: double-acting two-cylinder = four chuffs.
    cycleRevs: 1, revScale: 20, events: even(4), eventGains: [1, 0.8, 0.95, 0.75], loopS: 1.2,
    pulse: { decayMs: 70, click: 0.1, noise: 1, thumpHz: 50, thump: 0.4 },
    formants: [[500, 0.8, 1], [1400, 1.2, 0.7], [3000, 1.5, 0.4]], formantTrack: 0.2, direct: 0.4,
    lowpass: [6000, 8000], pulseLevel: [0.08, 1], rattle: 0.06,
    noise: { gain: [0.06, 0.1], hz: [3500, 4200], q: 0.8 },
    off: { pulse: 0.3, noise: 1.2, lowpass: 0.8 }, level: [0.55, 1], drive: 1.5,
  },
  singingInverter: {
    // The famous "do-re-mi" electric loco: the inverter steps through a scale while accelerating.
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8, bands: 9,
    tones: (c) => {
      const scale = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4];
      const step = Math.min(scale.length - 1, Math.round(c.norm * (scale.length - 1)));
      const note = 293.66 * (scale[step] as number);
      return [
        { hz: note, gain: 0.3 }, { hz: note * 2, gain: 0.1 }, { hz: note * 3, gain: 0.05 },
        { hz: c.fRev * 6, gain: 0.05 + 0.08 * c.norm }, // traction motor hum
      ];
    },
    noise: { gain: [0.02, 0.1], hz: [900, 1600], q: 0.7 }, level: [0.3, 1], drive: 1.2,
  },
  electricLoco: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => [
      ...harmonics(100, 6, 0.12, 1.3), // rectifier / transformer hum
      { hz: c.fRev * 17, gain: 0.05 + 0.1 * c.norm }, { hz: c.fRev * 34, gain: 0.03 + 0.04 * c.norm }, // gear mesh whine
    ],
    noise: { gain: [0.12, 0.22], hz: [800, 1500], q: 0.7 }, level: [0.4, 1], drive: 1.3,
  },
  dieselLoco: {
    cycleRevs: 1, events: even(8), pulse: { decayMs: 5, click: 0.6, noise: 0.7, thumpHz: 45, thump: 0.8 },
    formants: [[120, 1, 1], [350, 1.5, 0.7], [900, 2, 0.3]], pipe: [6, 0.4], lowpass: [1200, 2500], knock: 0.3,
    tones: (c) => [{ hz: 2800 + 4200 * c.norm, gain: 0.04 * c.norm }],
    noise: { gain: [0.1, 0.25], hz: [300, 600], q: 0.7 }, rumble: { gain: [0.1, 0.25], hz: 50 },
    off: { pulse: 0.6, lowpass: 0.8 }, drive: 1.8,
  },
  tram: {
    // One cycle = one rail length: two bogies click over the joint.
    cycleRevs: 1, revScale: 90, events: [0, 0.06, 0.5, 0.56], loopS: 1.2,
    pulse: { decayMs: 12, click: 1, noise: 0.6, thumpHz: 180, thump: 0.6 },
    formants: [[900, 3, 1], [2500, 4, 0.5]], direct: 0.2, lowpass: [5000, 6000], pulseLevel: [0, 0.8],
    tones: (c) => [{ hz: c.fRev * 90 * 0.4, gain: 0.08 * c.norm + 0.01 }, { hz: c.fRev * 90 * 0.8, gain: 0.04 * c.norm }],
    noise: { gain: [0.03, 0.1], hz: [600, 1200], q: 0.7 }, level: [0.3, 1], drive: 1.3,
  },
  metro: {
    cycleRevs: 1, revScale: 90, events: [0, 0.05, 0.5, 0.55], loopS: 1.2,
    pulse: { decayMs: 10, click: 1, noise: 0.6, thumpHz: 160, thump: 0.5 },
    formants: [[800, 3, 1], [2200, 4, 0.4]], direct: 0.2, lowpass: [4500, 5500], pulseLevel: [0, 0.7],
    tones: (c) => [{ hz: 420 + 1900 * c.norm, gain: 0.12 }, { hz: (420 + 1900 * c.norm) * 2, gain: 0.04 }],
    noise: { gain: [0.04, 0.3], hz: [500, 1000], q: 0.6 }, level: [0.3, 1], drive: 1.3,
  },

  // --- Crazy -------------------------------------------------------------------------------
  nuke: {
    cycleRevs: 1, revScale: 30, events: [0], loopS: 1.5,
    pulse: { decayMs: 250, click: 0.2, noise: 0.6, thumpHz: 34, thump: 1.3 },
    formants: [[80, 0.8, 1], [250, 1, 0.5]], direct: 0.2, lowpass: [400, 900], pulseLevel: [1, 0.6],
    noise: { gain: [0.3, 0.7], hz: [150, 500], q: 0.5 }, rumble: { gain: [0.4, 1], hz: 45 },
    crackle: { perSec: [15, 80], gain: 0.9 }, level: [0.7, 1], drive: 3,
  },
  warp: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 1.2,
    tones: (c) => {
      const f = 42 + 70 * c.norm;
      return [
        ...harmonics(f, 8, 0.35, 1.1, { vib: [0.83, 6] }),
        ...harmonics(f * 1.012, 4, 0.18, 1.2),
        { hz: f * 24, gain: 0.04, trem: [1.25, 0.8] }, { hz: f * 31.5, gain: 0.03, trem: [0.83, 0.9] },
      ];
    },
    noise: { gain: [0.03, 0.08], hz: [2000, 4000], q: 0.6 }, level: [0.65, 1], drive: 1.4,
  },
  ufo: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 1.2,
    tones: (c) => {
      const f = 300 + 520 * c.norm;
      return [{ hz: f, gain: 0.5, vib: [5.8, 90] }, { hz: f * 1.5, gain: 0.15, vib: [5.8, 90], trem: [7.5, 0.6] }, { hz: f * 2, gain: 0.08, vib: [5.8, 90] }];
    },
    noise: { gain: [0.01, 0.03], hz: [3000, 5000], q: 0.8 }, drive: 1.2,
  },
  rocket: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.9,
    noise: { gain: [0.5, 0.9], hz: [200, 600], q: 0.4 }, rumble: { gain: [0.4, 0.9], hz: 50 },
    crackle: { perSec: [40, 130], gain: 0.7 }, drive: 2.5,
  },
  dragon: {
    cycleRevs: 1, revScale: 40, events: [0, 0.45], loopS: 1.2,
    pulse: { decayMs: 120, click: 0, noise: 1 },
    formants: [[600, 4, 1], [1000, 5, 0.7], [2600, 6, 0.3]], direct: 0.05, lowpass: [3500, 5000],
    tones: (c) => harmonics(70 + 45 * c.norm, 6, 0.28, 1.2, { trem: [18, 0.7] }),
    noise: { gain: [0.15, 0.35], hz: [400, 800], q: 0.8 }, crackle: { perSec: [5, 30], gain: 0.4 }, drive: 2.4,
  },
  cartoon: {
    // A kid going "brrrm": a sung voice with a lip trill.
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => vowel(95 + 170 * c.norm, 16, [[650, 220, 1], [1100, 260, 0.6], [2500, 400, 0.25]], 0.5, { trem: [24 + 8 * c.norm, 0.85] }),
    noise: { gain: [0.02, 0.04], hz: [2500, 3500], q: 1 }, drive: 1.6,
  },
  chainsaw: {
    cycleRevs: 1, events: [0], pulse: { decayMs: 1.8, click: 1, noise: 0.9 },
    formants: [[1250, 3, 1], [2800, 4, 0.6]], formantTrack: 0.9, pipe: [0.7, 0.5], lowpass: [5000, 9000],
    rattle: 0.25, off: TWO_STROKE_OFF, drive: 2.8,
  },
  mower: {
    cycleRevs: 2, events: [0], pulse: { decayMs: 4, click: 0.9, noise: 0.8, thumpHz: 90, thump: 0.5 },
    formants: [[300, 1.5, 1], [900, 2, 0.6], [2400, 3, 0.3]], pipe: [1.5, 0.4], lowpass: [3000, 5000],
    rattle: 0.2, misfire: 0.05, off: FOUR_STROKE_OFF, drive: 2.5,
  },
  blender: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => harmonics(c.fRev * 2, 12, 0.2, 0.8),
    noise: { gain: [0.2, 0.4], hz: [1500, 3500], q: 1 }, rattle: 0.1, crackle: { perSec: [5, 20], gain: 0.3 }, drive: 1.8,
  },
  trex: {
    cycleRevs: 1, revScale: 50, events: [0], loopS: 1.4,
    pulse: { decayMs: 160, click: 0, noise: 1 },
    formants: [[300, 3, 1], [700, 4, 0.6], [1600, 5, 0.2]], direct: 0.05, lowpass: [2000, 3000],
    tones: (c) => harmonics(42 + 30 * c.norm, 8, 0.3, 1.1, { trem: [13, 0.6] }),
    noise: { gain: [0.1, 0.25], hz: [250, 500], q: 0.8 }, rumble: { gain: [0.1, 0.3], hz: 60 }, drive: 2.6,
  },
  robot: {
    cycleRevs: 1, events: [], lowpass: [1, 1], formants: [], loopS: 0.8,
    tones: (c) => {
      const notes = [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5];
      const f = notes[Math.min(notes.length - 1, Math.round(c.norm * (notes.length - 1)))] as number;
      return [1, 3, 5, 7, 9].map((k) => ({ hz: f * k, gain: 0.3 / k, trem: [10, 1] as const }));
    },
    noise: { gain: [0.01, 0.02], hz: [4000, 6000], q: 1 }, drive: 2,
  },
};

export type VoiceId = keyof typeof VOICES;
export const VOICE_IDS = Object.keys(VOICES);

export function getVoice(id: string | undefined): VoiceRecipe | undefined {
  return id === undefined ? undefined : VOICES[id];
}
