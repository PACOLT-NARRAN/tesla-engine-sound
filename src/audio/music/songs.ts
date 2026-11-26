/**
 * Written melodies for the music packs (Christmas carols, classical themes). All of them are
 * traditional / public-domain tunes, typed in here as note text:
 *
 *   melody: "E4.2 E4.2 E4.4 R.4"   pitch (or R = rest) + "." + length in 16th notes
 *   chords: "C C F,C G7,C"         one token per bar; "X,Y" = two chords in that bar
 *
 * Pure functions, unit tested.
 */

export interface Song {
  /** Beats per bar (3 = waltz, 4 = common time). */
  meter?: 3 | 4;
  melody: string;
  chords: string;
  /** Semitones to move the melody (keeps every tune in a pleasant register). */
  shift?: number;
}

export interface SongNote {
  /** Start, in 16th notes from the start of the song. */
  start: number;
  /** Length in 16th notes. */
  len: number;
  midi: number;
}

export interface ParsedSong {
  meter: 3 | 4;
  stepsPerBar: number;
  notes: SongNote[];
  /** Melody notes by start step (fast lookup while playing). */
  byStep: Map<number, SongNote>;
  /** Per bar: chord for the first half and the second half. */
  bars: Array<[Chord, Chord]>;
  /** Loop length in 16th notes (whole bars). */
  length: number;
}

export interface Chord {
  /** Root in the C4 octave (60..71). */
  root: number;
  /** Chord tones voiced around middle C (pad register). */
  tones: number[];
  /** Equality key. */
  key: string;
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" → 61, "Bb3" → 58. Returns null for anything else. */
export function noteToMidi(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const base = LETTERS[m[1] as string] as number;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + base + acc;
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], '5': [0, 7, 12], aug: [0, 4, 8],
};

/** "F#m7" → chord. Throws on an unknown symbol (caught by the tests). */
export function parseChord(sym: string): Chord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  const q = m ? QUALITIES[m[3] as string] : undefined;
  if (!m || !q) throw new Error(`bad chord ${sym}`);
  const root = 60 + ((LETTERS[m[1] as string] as number) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  // Voice around G3..F#4 so changes move smoothly.
  const tones = q.map((iv) => {
    let n = root + iv;
    while (n > 67) n -= 12;
    while (n < 55) n += 12;
    return n;
  }).sort((a, b) => a - b);
  return { root, tones, key: sym };
}

export function parseSong(song: Song): ParsedSong {
  const meter = song.meter ?? 4;
  const stepsPerBar = meter * 4;
  const notes: SongNote[] = [];
  let pos = 0;
  for (const tok of song.melody.trim().split(/\s+/)) {
    const [p, l] = tok.split('.');
    const len = Number(l);
    if (!p || !Number.isFinite(len) || len <= 0) throw new Error(`bad note ${tok}`);
    if (p !== 'R') {
      const midi = noteToMidi(p);
      if (midi === null) throw new Error(`bad pitch ${tok}`);
      notes.push({ start: pos, len, midi: midi + (song.shift ?? 0) });
    }
    pos += len;
  }
  const bars = song.chords.trim().split(/\s+/).map((b): [Chord, Chord] => {
    const [a, c] = b.split(',');
    const first = parseChord(a as string);
    return [first, c ? parseChord(c) : first];
  });
  const length = Math.max(Math.ceil(pos / stepsPerBar), bars.length) * stepsPerBar;
  return { meter, stepsPerBar, notes, byStep: new Map(notes.map((n) => [n.start, n])), bars, length };
}
