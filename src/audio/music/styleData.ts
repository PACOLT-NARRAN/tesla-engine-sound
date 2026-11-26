import type { MusicStyle } from './musicStyles.ts';

/** Scales and the five original DRIVE MUSIC styles (update 31). */
// Scales (semitones from the tonic).
export const MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
export const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
export const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
export const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10] as const;
export const HARMONIC = [0, 2, 3, 5, 7, 8, 11] as const;

/** The five original DRIVE MUSIC styles (update 31). */
export const BASE_STYLES: readonly MusicStyle[] = [
  {
    // Night drive: 80s synthwave, A minor.
    id: 'synthwave',
    root: 57,
    scale: MINOR,
    progressions: [[0, 5, 2, 6], [3, 5, 0, 6]],
    barsPerChord: 1,
    sevenths: false,
    bpm: [86, 118],
    swing: 0,
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', hatBusy: 'x.x.x.x.x.x.x.xx', clap: true },
    drumThreshold: 0.12,
    pad: 'saw',
    bass: 'saw',
    bassPattern: 'eighths',
    lead: 'saw',
    arp: 'up',
    arpVoice: 'saw',
    brightness: 0.65,
    space: 0.7,
    echo: 0.55,
  },
  {
    // Motorway techno: F minor, four-on-the-floor, acid bass that opens with the throttle.
    id: 'techno',
    root: 53,
    scale: MINOR,
    progressions: [[0, 0, 5, 3], [0, 6, 5, 6]],
    barsPerChord: 2,
    sevenths: false,
    bpm: [112, 134],
    swing: 0,
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', hatBusy: 'xxx.xxx.xxx.xxxx', clap: true },
    drumThreshold: 0.08,
    pad: 'glass',
    bass: 'acid',
    bassPattern: 'acid',
    lead: 'square',
    arp: 'pulse',
    arpVoice: 'square',
    brightness: 0.75,
    space: 0.45,
    echo: 0.6,
  },
  {
    // Lo-fi city cruising: Eb major sevenths, swung beat, electric piano and vinyl crackle.
    id: 'lofi',
    root: 63,
    scale: MAJOR,
    progressions: [[1, 4, 0, 5], [3, 2, 1, 4]],
    barsPerChord: 1,
    sevenths: true,
    bpm: [72, 92],
    swing: 0.28,
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'x.xxx.x.x.xxx.xo' },
    drumThreshold: 0.1,
    pad: 'epiano',
    bass: 'pluck',
    bassPattern: 'lofi',
    lead: 'flute',
    arp: 'random',
    arpVoice: 'triangle',
    brightness: 0.4,
    space: 0.5,
    echo: 0.35,
    vinyl: true,
  },
  {
    // Ambient landscape: D lydian, slow chords, glassy bells; drums only at speed.
    id: 'ambient',
    root: 62,
    scale: LYDIAN,
    progressions: [[0, 1, 4, 5], [3, 0, 1, 4]],
    barsPerChord: 2,
    sevenths: true,
    bpm: [64, 88],
    swing: 0,
    drums: { kick: 'x.......x.......', snare: '................', hat: '..o...o...o...o.', hatBusy: 'o.o.o.o.o.o.o.o.' },
    drumThreshold: 0.45,
    pad: 'warm',
    bass: 'sub',
    bassPattern: 'drone',
    lead: 'bell',
    arp: 'updown',
    arpVoice: 'bell',
    brightness: 0.5,
    space: 1,
    echo: 0.7,
  },
  {
    // Epic film score: D minor (dorian colour), strings, taiko drums and brass when you push.
    id: 'epic',
    root: 62,
    scale: DORIAN,
    progressions: [[0, 5, 2, 6], [0, 3, 5, 4]],
    barsPerChord: 1,
    sevenths: false,
    bpm: [78, 108],
    swing: 0,
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: '................', hatBusy: '..x...x...x...x.', tom: 'x..x..x.x..x.xx.' },
    drumThreshold: 0.15,
    pad: 'strings',
    bass: 'cello',
    bassPattern: 'ostinato',
    lead: 'brass',
    arp: 'updown',
    arpVoice: 'saw',
    gearVoice: 'brass',
    orchestral: true,
    brightness: 0.55,
    space: 0.85,
    echo: 0.25,
  },
];

