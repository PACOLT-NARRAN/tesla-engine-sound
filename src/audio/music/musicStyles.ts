import type { Song } from './songs.ts';
import { TRACKS } from './tracks.ts';

/**
 * DRIVE MUSIC packs: the musical "styles" the generative music engine can play.
 * A style is pure data (key, chords, tempo range, drum grooves, instrument colours); the
 * driving decides WHICH layers of it play and HOW (see musicBrain.ts). Everything is generated
 * in code: no samples, no recordings, no third-party music.
 */

export type PadTimbre = 'saw' | 'warm' | 'strings' | 'epiano' | 'glass' | 'organ' | 'choir' | 'none';
export type BassTimbre = 'saw' | 'acid' | 'sub' | 'pluck' | 'cello' | 'reese' | 'chip' | 'dist';
export type LeadTimbre = 'saw' | 'square' | 'bell' | 'brass' | 'flute' | 'supersaw' | 'screech' | 'guitar' | 'piano' | 'harpsichord' | 'organ' | 'chip' | 'strings';
export type ArpShape = 'up' | 'updown' | 'random' | 'pulse' | 'alberti';
export type ArpVoice = 'saw' | 'square' | 'triangle' | 'bell' | 'piano' | 'harpsichord' | 'pluck';
export type BassPattern = 'eighths' | 'offbeat' | 'acid' | 'lofi' | 'drone' | 'ostinato' | 'rolling' | 'walking' | 'reverse' | 'dnb' | 'chug' | 'alberti';
export type KickKind = 'punch' | 'hard' | 'tekno' | 'rock' | 'chip' | 'soft';
/** Instrument that joins with the higher gears (sustained counter-line, fanfare colour). */
export type GearTimbre = 'strings' | 'organ' | 'choir' | 'brass' | 'flute' | 'saw' | 'glass';

/** 16-step grooves (12 in 3/4); 'x' = hit, 'o' = soft hit, '.' = rest. */
export interface DrumKit {
  kick: string;
  snare: string;
  hat: string;
  /** Busier hat line used at high energy. */
  hatBusy: string;
  /** Low toms / taiko line (optional). */
  tom?: string;
  /** Double-bass kick line used at high energy (metal). */
  kickBusy?: string;
  /** Sleigh bells (Christmas). */
  jingle?: string;
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
  /** Drums start only above this cruise level (0..1); above 1 = never (classical). */
  drumThreshold: number;
  pad: PadTimbre;
  bass: BassTimbre;
  bassPattern: BassPattern;
  lead: LeadTimbre;
  arp: ArpShape;
  /** Sound of the arpeggio (default: from the style's character). */
  arpVoice?: ArpVoice;
  /** Master brightness: 0 = dark, 1 = bright. */
  brightness: number;
  /** Reverb and echo amounts 0..1. */
  space: number;
  echo: number;
  /** Lo-fi vinyl crackle bed. */
  vinyl?: boolean;
  /** Beats per bar (default 4). */
  meter?: 3 | 4;
  kick?: KickKind;
  /** Distortion amount 0..1 for guitars, hard kicks, screech leads and distorted bass. */
  dist?: number;
  /** Guitar riff (one char per 16th): 'x' palm-muted chug, 'P' power chord, '-' hold, '.' rest. */
  riff?: string;
  /** Riff while braking (metalcore breakdown); the kick doubles it. */
  breakdown?: string;
  /** Rock'n'roll boogie guitar (root + fifth / sixth). */
  boogie?: boolean;
  /** Lowest note of the bass register (MIDI, default 33 = A1). */
  bassLow?: number;
  /** Instrument that joins as the gears go up. */
  gearVoice?: GearTimbre;
  /** Orchestral percussion: timpani instead of a crash cymbal. */
  orchestral?: boolean;
  /** A written melody (carols, classical themes) instead of improvised motifs. */
  song?: Song;
}

/** Every playable style: one per track of every music pack. */
export const MUSIC_STYLES: readonly MusicStyle[] = TRACKS.map((t) => t.style);
const BY_ID = new Map(MUSIC_STYLES.map((s) => [s.id, s]));

export function getMusicStyle(id: string | undefined): MusicStyle | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
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
