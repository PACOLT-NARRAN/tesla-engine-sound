import type { Song } from './songs.ts';

/**
 * Traditional and public-domain melodies (carols from the 16th–19th century, classical themes by
 * composers who died more than 100 years ago). Typed from memory as note text, see songs.ts.
 * One bar per line; the melody length always equals the number of chord bars.
 */
export const SONGS: Record<string, Song> = {
  // ===================================== CHRISTMAS ===========================================
  jingleBells: {
    shift: 12,
    melody: `E4.2 E4.2 E4.4 E4.2 E4.2 E4.4
      E4.2 G4.2 C4.3 D4.1 E4.8
      F4.2 F4.2 F4.3 F4.1 F4.2 E4.2 E4.2 E4.1 E4.1
      E4.2 D4.2 D4.2 E4.2 D4.4 G4.4
      E4.2 E4.2 E4.4 E4.2 E4.2 E4.4
      E4.2 G4.2 C4.3 D4.1 E4.8
      F4.2 F4.2 F4.2 F4.2 F4.2 E4.2 E4.2 E4.1 E4.1
      G4.2 G4.2 F4.2 D4.2 C4.8`,
    chords: 'C C F,C D7,G7 C C F,C G7,C',
  },
  weWish: {
    meter: 3,
    shift: 0,
    melody: `R.8 D4.4
      G4.4 G4.2 A4.2 G4.2 F#4.2
      E4.4 E4.4 E4.4
      A4.4 A4.2 B4.2 A4.2 G4.2
      F#4.4 D4.4 D4.4
      B4.4 B4.2 C5.2 B4.2 A4.2
      G4.4 E4.4 D4.2 D4.2
      E4.4 A4.4 F#4.4
      G4.12`,
    chords: 'G G C A7 D B7 Em C,D7 G',
  },
  silentNight: {
    meter: 3,
    shift: 0,
    melody: `G4.6 A4.2 G4.4 E4.12 G4.6 A4.2 G4.4 E4.12
      D5.8 D5.4 B4.12 C5.8 C5.4 G4.12
      A4.8 A4.4 C5.6 B4.2 A4.4 G4.6 A4.2 G4.4 E4.12
      A4.8 A4.4 C5.6 B4.2 A4.4 G4.6 A4.2 G4.4 E4.12
      D5.8 D5.4 F5.6 D5.2 B4.4 C5.12 E5.12
      C5.6 G4.2 E4.4 G4.6 F4.2 D4.4 C4.12 R.12`,
    chords: 'C C C C G7 G7 C C F F C C F F C C G7 G7 C C C G7 C C',
  },
  tannenbaum: {
    meter: 3,
    shift: 0,
    melody: `R.10 D4.2
      G4.3 G4.1 G4.6 A4.2
      B4.3 B4.1 B4.6 B4.2
      A4.2 B4.2 C5.4 F#4.4
      A4.4 G4.4 R.2 D5.2
      D5.2 B4.2 E5.6 D5.2
      D5.2 C5.2 C5.6 C5.2
      C5.2 A4.2 D5.6 C5.2
      C5.2 B4.2 B4.6 D4.2
      G4.3 G4.1 G4.6 A4.2
      B4.3 B4.1 B4.6 B4.2
      A4.2 B4.2 C5.4 F#4.4
      A4.4 G4.8`,
    chords: 'G G G Am,D D7,G G,C D7 D7 G G G Am,D D7,G',
  },
  deckTheHalls: {
    shift: 12,
    melody: `G4.6 F4.2 E4.4 D4.4 C4.4 D4.4 E4.4 C4.4
      D4.2 E4.2 F4.2 D4.2 E4.6 D4.2 C4.4 B3.4 C4.8
      G4.6 F4.2 E4.4 D4.4 C4.4 D4.4 E4.4 C4.4
      D4.2 E4.2 F4.2 D4.2 E4.6 D4.2 C4.4 B3.4 C4.8
      D4.6 E4.2 F4.4 D4.4 E4.6 F4.2 G4.4 D4.4
      E4.2 F#4.2 G4.4 A4.2 B4.2 C5.4 B4.4 A4.4 G4.8
      G4.6 F4.2 E4.4 D4.4 C4.4 D4.4 E4.4 C4.4
      A4.2 A4.2 A4.2 A4.2 G4.6 F4.2 E4.4 D4.4 C4.8`,
    chords: 'C C G7,C G7,C C C G7,C G7,C G C,G Em,D D7,G C C F,C G7,C',
  },
  joyToTheWorld: {
    shift: 12,
    melody: `C5.4 B4.3 A4.1 G4.6 F4.2
      E4.4 D4.4 C4.6 G4.2
      A4.6 A4.2 B4.6 B4.2
      C5.14 C5.2
      C5.2 B4.2 A4.2 G4.2 G4.3 F4.1 E4.2 C5.2
      C5.2 B4.2 A4.2 G4.2 G4.3 F4.1 E4.4
      E4.2 E4.2 E4.2 E4.2 E4.3 F4.1 G4.4
      F4.1 E4.1 D4.2 D4.2 D4.2 D4.3 E4.1 F4.4
      E4.2 C5.4 A4.2 G4.3 F4.1 E4.2 F4.2
      E4.4 D4.4 C4.8`,
    chords: 'C G7,C F,G C C C C G7 C,F G7,C',
  },
  harkTheHerald: {
    shift: 0,
    melody: `G4.4 C5.4 C5.6 B4.2 C5.4 E5.4 E5.4 D5.4
      G5.4 G5.4 G5.6 F5.2 E5.4 D5.4 E5.8
      G4.4 C5.4 C5.6 B4.2 C5.4 E5.4 E5.4 D5.4
      G5.4 D5.4 D5.6 B4.2 B4.4 A4.4 G4.8
      G5.4 G5.4 G5.4 C5.4 F5.6 E5.2 E5.8
      G5.4 G5.4 G5.4 C5.4 F5.6 E5.2 E5.8
      A5.4 A5.4 A5.4 G5.4 F5.4 E5.4 F5.8
      D5.4 E5.2 F5.2 G5.6 C5.2 C5.4 D5.4 E5.8
      A5.6 A5.2 A5.4 G5.4 F5.4 E5.4 F5.8
      D5.4 E5.2 F5.2 G5.6 C5.2 C5.4 D5.4 C5.8`,
    chords: 'C C,G C,G7 G,C C C,G G,D D7,G C F,C C F,C F C,F Dm,G C F C,F Dm,G G7,C',
  },
  oComeAllYe: {
    shift: 0,
    melody: `R.12 G4.4
      G4.8 D4.4 G4.4 A4.8 D4.8
      B4.4 A4.4 B4.4 C5.4 B4.8 A4.4 G4.4
      G4.8 F#4.4 E4.4 F#4.4 G4.4 A4.4 B4.4
      F#4.6 E4.2 D4.8 D5.8 C5.4 B4.4
      C5.8 B4.8 A4.4 B4.4 G4.4 A4.4
      F#4.6 E4.2 D4.4 G4.4 G4.4 F#4.4 G4.4 A4.4
      G4.8 D4.4 B4.4 B4.4 A4.4 B4.4 C5.4
      B4.8 A4.4 B4.4 C5.4 B4.4 A4.4 G4.4
      F#4.8 G4.4 C5.4 B4.8 A4.6 G4.2
      G4.16`,
    chords: 'G G D G,C G,D G,C D G,D D,G G,C G,D G,D G,C G D G,C G,D C,G D7,G G',
  },
  firstNoel: {
    meter: 3,
    shift: 12,
    melody: `R.8 E4.2 D4.2
      C4.6 D4.2 E4.2 F4.2 G4.8 A4.2 B4.2 C5.4 B4.4 A4.4 G4.8 A4.2 B4.2
      C5.4 B4.4 A4.4 G4.4 A4.4 B4.4 C5.4 G4.4 F4.4 E4.8 E4.2 D4.2
      C4.6 D4.2 E4.2 F4.2 G4.8 A4.2 B4.2 C5.4 B4.4 A4.4 G4.8 A4.2 B4.2
      C5.4 B4.4 A4.4 G4.4 A4.4 B4.4 C5.4 G4.4 F4.4 E4.8 E4.2 D4.2
      C4.6 D4.2 E4.2 F4.2 G4.8 C5.2 B4.2 A4.8 A4.4 G4.12
      C5.4 B4.4 A4.4 G4.4 A4.4 B4.4 C5.4 G4.4 F4.4 E4.12`,
    chords: 'C C C F C F C F,G C C C F C F C F,G C C C F C F C F,G C',
  },
  wenceslas: {
    shift: 0,
    melody: `G4.4 G4.4 G4.4 A4.4 G4.4 G4.4 D4.8
      E4.4 D4.4 E4.4 F#4.4 G4.8 G4.8
      G4.4 G4.4 G4.4 A4.4 G4.4 G4.4 D4.8
      E4.4 D4.4 E4.4 F#4.4 G4.8 G4.8
      D5.4 C5.4 B4.4 A4.4 B4.4 A4.4 G4.8
      E4.4 D4.4 E4.4 F#4.4 G4.8 G4.8
      D4.4 D4.4 E4.4 F#4.4 G4.4 G4.4 A4.8
      D5.4 C5.4 B4.4 A4.4 G4.8 C5.8
      G4.16`,
    chords: 'G G C,D G G G C,D G G,D G C,D G G,D G,D G,D G,C G',
  },
  carolOfTheBells: {
    meter: 3,
    shift: 0,
    melody: `Bb4.4 A4.2 Bb4.2 G4.4 Bb4.4 A4.2 Bb4.2 G4.4 Bb4.4 A4.2 Bb4.2 G4.4 Bb4.4 A4.2 Bb4.2 G4.4
      D5.4 C5.2 D5.2 Bb4.4 D5.4 C5.2 D5.2 Bb4.4 D5.4 C5.2 D5.2 Bb4.4 D5.4 C5.2 D5.2 Bb4.4
      G5.4 F5.2 G5.2 Eb5.4 G5.4 F5.2 G5.2 Eb5.4 G5.4 F5.2 G5.2 Eb5.4 G5.4 F5.2 G5.2 Eb5.4
      G5.2 G5.2 G5.2 F5.2 Eb5.2 D5.2 C5.2 C5.2 C5.2 Bb4.2 A4.2 G4.2
      Bb4.2 Bb4.2 Bb4.2 A4.2 G4.2 F4.2 G4.4 A4.4 G4.4
      Bb4.4 A4.2 Bb4.2 G4.4 Bb4.4 A4.2 Bb4.2 G4.4`,
    chords: 'Gm Gm Gm Gm Gm Gm Eb Eb Cm Cm D D Gm Cm Eb D Gm Gm',
  },
  godRestYe: {
    shift: 0,
    melody: `R.12 E4.4
      E4.4 B4.4 B4.4 A4.4 G4.4 F#4.4 E4.4 D4.4
      E4.4 F#4.4 G4.4 A4.4 B4.12 E4.4
      E4.4 B4.4 B4.4 A4.4 G4.4 F#4.4 E4.4 D4.4
      E4.4 F#4.4 G4.4 A4.4 B4.12 B4.4
      C5.4 A4.4 B4.4 C5.4 D5.4 E5.4 B4.4 A4.4
      G4.4 E4.4 F#4.4 G4.4 A4.8 G4.4 A4.4
      B4.8 C5.4 B4.4 B4.4 A4.4 G4.4 F#4.4
      E4.8 G4.2 F#4.2 E4.4 A4.8 G4.4 A4.4
      B4.4 C5.4 D5.4 E5.4 B4.4 A4.4 G4.4 F#4.4
      E4.16`,
    chords: 'Em Em Em,D Em,D Em,B Em Em,D Em,D G,B C,G Em,D Am,D G Em,D Em,Am Am,G C,D Em,B Em Em',
  },
  greensleeves: {
    meter: 3,
    shift: 0,
    melody: `R.8 A4.4
      C5.8 D5.4 E5.6 F5.2 E5.4 D5.8 B4.4 G4.6 A4.2 B4.4
      C5.8 A4.4 A4.6 G#4.2 A4.4 B4.8 G#4.4 E4.8 A4.4
      C5.8 D5.4 E5.6 F5.2 E5.4 D5.8 B4.4 G4.6 A4.2 B4.4
      C5.6 B4.2 A4.4 G#4.6 F#4.2 G#4.4 A4.12 A4.12
      G5.12 G5.6 F#5.2 E5.4 D5.8 B4.4 G4.6 A4.2 B4.4
      C5.8 A4.4 A4.6 G#4.2 A4.4 B4.8 G#4.4 E4.12
      G5.12 G5.6 F#5.2 E5.4 D5.8 B4.4 G4.6 A4.2 B4.4
      C5.6 B4.2 A4.4 G#4.6 F#4.2 G#4.4 A4.12`,
    chords: 'Am Am C G Em Am E E Am Am C G Em Am,E E Am Am C C G Em Am E E E C C G Em Am,E E Am',
  },
  auldLangSyne: {
    shift: 0,
    melody: `R.12 G4.4
      C5.6 C5.2 C5.4 E5.4 D5.6 C5.2 D5.4 E5.2 D5.2
      C5.6 C5.2 E5.4 G5.4 A5.12 A5.4
      G5.6 E5.2 E5.4 C5.4 D5.6 C5.2 D5.4 E5.2 D5.2
      C5.6 A4.2 A4.4 G4.4 C5.12 A5.4
      G5.6 E5.2 E5.4 C5.4 D5.6 C5.2 D5.4 A5.4
      G5.6 E5.2 E5.4 G5.4 A5.12 C6.4
      G5.6 E5.2 E5.4 C5.4 D5.6 C5.2 D5.4 E5.2 D5.2
      C5.6 A4.2 A4.4 G4.4 C5.12 R.4`,
    chords: 'C C G C F C G Am,G C C G C F C G Am,G C',
  },

  weThreeKings: {
    meter: 3,
    shift: 0,
    melody: `B4.4 A4.2 G4.4 E4.2 F#4.2 G4.2 F#4.2 E4.6
      B4.4 A4.2 G4.4 E4.2 F#4.2 G4.2 F#4.2 E4.6
      G4.4 G4.2 A4.4 A4.2 B4.4 B4.2 D5.2 C5.2 B4.2
      A4.2 B4.2 A4.2 G4.4 F#4.2 E4.12`,
    chords: 'Em D,Em Em D,Em C,D G Am,B Em',
  },

  // ===================================== CLASSICAL ===========================================
  odeToJoy: {
    shift: 12,
    melody: `F#4.4 F#4.4 G4.4 A4.4 A4.4 G4.4 F#4.4 E4.4
      D4.4 D4.4 E4.4 F#4.4 F#4.6 E4.2 E4.8
      F#4.4 F#4.4 G4.4 A4.4 A4.4 G4.4 F#4.4 E4.4
      D4.4 D4.4 E4.4 F#4.4 E4.6 D4.2 D4.8
      E4.4 E4.4 F#4.4 D4.4 E4.4 F#4.2 G4.2 F#4.4 D4.4
      E4.4 F#4.2 G4.2 F#4.4 E4.4 D4.4 E4.4 A3.8
      F#4.4 F#4.4 G4.4 A4.4 A4.4 G4.4 F#4.4 E4.4
      D4.4 D4.4 E4.4 F#4.4 E4.6 D4.2 D4.8`,
    chords: 'D D,A D A D D,A D A,D A,D A,D A,D D,A D D,A D A,D',
  },
  canonInD: {
    shift: 0,
    melody: `F#5.8 E5.8 D5.8 C#5.8 B4.8 A4.8 B4.8 C#5.8
      F#5.4 D5.4 E5.4 C#5.4 D5.4 B4.4 C#5.4 A4.4 B4.4 G4.4 A4.4 F#4.4 G4.4 B4.4 A4.4 C#5.4
      D5.2 C#5.2 D5.2 F#5.2 A5.4 E5.4 F#5.2 E5.2 D5.2 C#5.2 B4.4 C#5.4 D5.4 B4.4 A4.4 F#4.4 G4.4 B4.4 A4.4 C#5.4
      F#5.8 E5.8 D5.8 C#5.8 B4.8 A4.8 B4.8 C#5.8`,
    chords: 'D,A Bm,F#m G,D G,A D,A Bm,F#m G,D G,A D,A Bm,F#m G,D G,A D,A Bm,F#m G,D G,A',
  },
  furElise: {
    meter: 3,
    shift: 0,
    melody: `E5.2 D#5.2 E5.2 B4.2 D5.2 C5.2
      A4.4 R.2 C4.2 E4.2 A4.2
      B4.4 R.2 E4.2 G#4.2 B4.2
      C5.4 R.2 E4.2 E5.2 D#5.2
      E5.2 D#5.2 E5.2 B4.2 D5.2 C5.2
      A4.4 R.2 C4.2 E4.2 A4.2
      B4.4 R.2 E4.2 C5.2 B4.2
      A4.4 R.2 B4.2 C5.2 D5.2
      E5.6 G4.2 F5.2 E5.2
      D5.6 F4.2 E5.2 D5.2
      C5.6 E4.2 D5.2 C5.2
      B4.4 R.2 E4.2 E5.2 D#5.2`,
    chords: 'Am Am E Am Am Am E Am C G Am E',
  },
  mountainKing: {
    shift: 0,
    melody: `B3.2 C#4.2 D4.2 E4.2 F#4.2 D4.2 F#4.4
      F4.2 C#4.2 F4.4 E4.2 C4.2 E4.4
      B3.2 C#4.2 D4.2 E4.2 F#4.2 D4.2 F#4.2 B4.2
      A4.2 F#4.2 D4.2 F#4.2 A4.8
      F#4.2 G#4.2 A#4.2 B4.2 C#5.2 A#4.2 C#5.4
      D5.2 A#4.2 D5.4 C#5.2 A#4.2 C#5.4
      F#4.2 G#4.2 A#4.2 B4.2 C#5.2 A#4.2 C#5.2 D5.2
      C#5.2 A#4.2 F#4.2 A#4.2 C#5.8`,
    chords: 'Bm C#7,C Bm D,F# F# F#,F# F# F#',
  },
  nachtmusik: {
    shift: 0,
    melody: `G4.4 R.2 D4.2 G4.4 R.2 D4.2
      G4.2 D4.2 G4.2 B4.2 D5.8
      C5.4 R.2 A4.2 C5.4 R.2 A4.2
      C5.2 A4.2 F#4.2 A4.2 D4.8
      G4.4 R.2 D4.2 G4.4 R.2 D4.2
      G4.2 D4.2 G4.2 B4.2 D5.8
      C5.4 R.2 A4.2 C5.4 R.2 A4.2
      C5.2 A4.2 F#4.2 A4.2 G4.8`,
    chords: 'G G D D7 G G D D7,G',
  },
  vltava: {
    meter: 3,
    shift: 0,
    melody: `E4.2 F#4.2 G4.2 A4.2 B4.4
      B4.6 C5.6 C5.6 B4.6 B4.6 A4.6 A4.6 G4.6 G4.6 F#4.6 F#4.6 E4.6 E4.12
      E4.2 F#4.2 G#4.2 A4.2 B4.4
      B4.6 C#5.6 C#5.6 B4.6 B4.6 A4.6 A4.6 G#4.6 G#4.6 F#4.6 F#4.6 E4.6 E4.12`,
    chords: 'Em Em,Am Am,Em Em,D D,Em Em,B B,Em Em E E,A A,E E,A A,E E,B B,E E',
  },
  largo: {
    shift: 12,
    melody: `E4.6 G4.2 G4.8 E4.6 D4.2 C4.8
      D4.4 E4.4 G4.4 E4.4 D4.16
      E4.6 G4.2 G4.8 E4.6 D4.2 C4.8
      D4.4 E4.4 D4.4 C4.4 C4.16`,
    chords: 'C F,C C,G G C F,C G,G7 C',
  },
  blueDanube: {
    meter: 3,
    shift: 0,
    melody: `D4.4 D4.4 F#4.4 A4.12 R.4 A5.4 A5.4 R.4 F#5.4 F#5.4
      D4.4 D4.4 F#4.4 A4.12 R.4 A5.4 A5.4 R.4 G5.4 G5.4
      C#4.4 C#4.4 E4.4 B4.12 R.4 B5.4 B5.4 R.4 G5.4 G5.4
      C#4.4 C#4.4 E4.4 B4.12 R.4 B5.4 B5.4 R.4 F#5.4 F#5.4`,
    chords: 'D D D D D D A7 A7 A7 A7 A7 A7 A7 A7 A7 D',
  },
  toccata: {
    shift: 0,
    melody: `A5.1 G5.1 A5.6 R.8
      G5.1 F5.1 E5.1 D5.1 C#5.4 D5.8
      R.16
      A4.1 G4.1 A4.6 R.8
      G4.1 F4.1 E4.1 D4.1 C#4.4 D4.8
      R.16
      A3.1 G3.1 A3.6 R.8
      G3.1 F3.1 E3.1 D3.1 C#3.4 D3.8
      C#4.2 E4.2 G4.2 Bb4.2 C#5.2 E5.2 G5.4
      D5.16`,
    chords: 'Dm A,Dm Dm Dm A,Dm Dm Dm A,Dm A7 Dm',
  },
  minuetG: {
    meter: 3,
    shift: 0,
    melody: `D5.4 G4.2 A4.2 B4.2 C5.2 D5.4 G4.4 G4.4
      E5.4 C5.2 D5.2 E5.2 F#5.2 G5.4 G4.4 G4.4
      C5.4 D5.2 C5.2 B4.2 A4.2 B4.4 C5.2 B4.2 A4.2 G4.2
      F#4.4 G4.2 A4.2 B4.2 G4.2 A4.12
      D5.4 G4.2 A4.2 B4.2 C5.2 D5.4 G4.4 G4.4
      E5.4 C5.2 D5.2 E5.2 F#5.2 G5.4 G4.4 G4.4
      C5.4 D5.2 C5.2 B4.2 A4.2 B4.4 C5.2 B4.2 A4.2 G4.2
      A4.4 B4.2 A4.2 G4.2 F#4.2 G4.12`,
    chords: 'G G C G C G D D G G C G C G D,D7 G',
  },
};
