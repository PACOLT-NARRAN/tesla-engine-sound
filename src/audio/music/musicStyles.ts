/**
 * DRIVE MUSIC pack: the musical "styles" the generative music engine can play.
 * A style is pure data (key, chords, tempo range, drum grooves, instrument colours); the
 * driving decides WHICH layers of it play and HOW (see musicBrain.ts). Everything is generated
 * in code: no samples, no recordings, no third-party music.
 */

export type PadTimbre = 'saw' | 'warm' | 'strings' | 'epiano' | 'glass';
export type BassTimbre = 'saw' | 'acid' | 'sub' | 'pluck' | 'cello';
export type LeadTimbre = 'saw' | 'square' | 'bell' | 'brass' | 'flute';
export type ArpShape = 'up' | 'updown' | 'random' | 'pulse';
export type BassPattern = 'eighths' | 'offbeat' | 'acid' | 'lofi' | 'drone' | 'ostinato';

/** 16-step grooves; 'x' = hit, 'o' = soft hit, '.' = rest. */
export interface DrumKit {
  kick: string;
  snare: string;
  hat: string;
  /** Busier hat line used at high energy. */
  hatBusy: string;
  /** Low toms / taiko line (optional). */
  tom?: string;
  /** Snare is a clap (synthwave, techno) rather than a snare drum. */
  clap?: boolean;
}

export interface MusicStyle {
  id: string;
  /** MIDI note of the tonic (bass register is derived). */
  root: number;
  /** Seven semitone offsets of the scale. */
  scale: readonly number[];
  /** Chord roots as scale degrees (0-based), one per `barsPerChord` bars. Two variations (A/B sections). */
  progressions: readonly (readonly number[])[];
  barsPerChord: number;
  sevenths: boolean;
  /** Tempo at standstill / at motorway speed. */
  bpm: readonly [number, number];
  /** 0 = straight, 0.33 = heavy swing on the off 16ths. */
  swing: number;
  drums: DrumKit;
  /** Drums start only above this cruise level (0..1); ambient styles keep them sparse. */
  drumThreshold: number;
  pad: PadTimbre;
  bass: BassTimbre;
  bassPattern: BassPattern;
  lead: LeadTimbre;
  arp: ArpShape;
  /** Master brightness: 0 = dark, 1 = bright. */
  brightness: number;
  /** Reverb and echo amounts 0..1. */
  space: number;
  echo: number;
  /** Lo-fi vinyl crackle bed. */
  vinyl?: boolean;
}

// Scales (semitones from the tonic).
const MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;

export const MUSIC_STYLES: readonly MusicStyle[] = [
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
    brightness: 0.55,
    space: 0.85,
    echo: 0.25,
  },
];

export function getMusicStyle(id: string | undefined): MusicStyle | undefined {
  return id === undefined ? undefined : MUSIC_STYLES.find((s) => s.id === id);
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** MIDI note of scale degree `deg` (may be negative or above 6) in the style's key. */
export function degreeToMidi(style: MusicStyle, deg: number): number {
  const n = style.scale.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return style.root + (style.scale[idx] as number) + 12 * oct;
}

/** Chord tones (scale degrees) of the chord built on degree `rootDeg`. */
export function chordDegrees(style: MusicStyle, rootDeg: number): number[] {
  const d = [rootDeg, rootDeg + 2, rootDeg + 4];
  if (style.sevenths) d.push(rootDeg + 6);
  return d;
}
