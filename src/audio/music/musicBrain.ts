import { clamp, createRng } from '../../utils/math.ts';
import { chordDegrees, degreeToMidi, type MusicStyle } from './musicStyles.ts';
import { parseSong, type Chord, type ParsedSong } from './songs.ts';

/**
 * The composer of the music packs. Pure logic (no Web Audio), unit tested.
 *
 * How the driving plays the music:
 *  - SPEED   -> tempo and how many layers play: standstill = pad only, then bass, drums, hats,
 *               the full groove and finally a double-time arpeggio on the motorway.
 *  - GEARS   -> every gear adds an instrument: 2nd = a sustained counter-line, 3rd = sparkling
 *               bells, 4th = a choir, 5th = a harmony voice under the melody, 6th+ = faster
 *               sparkle. An upshift plays a short rising fanfare (and starts a new section),
 *               a downshift a drum fill.
 *  - THROTTLE (acceleration) -> intensity: brighter filter, arpeggio and a lead melody,
 *               louder notes. Holding REV or NITRO builds a riser; releasing REV drops the beat.
 *  - BRAKING -> the music "sinks": the filter closes, the drums go half-time (metalcore: a
 *               breakdown), more reverb.
 *  - STEERING -> the arpeggio and melody move to the side you turn to, bells sparkle there.
 * Songs (carols, classical themes) play their written melody and chords; the driving arranges.
 * Layer changes happen on bar lines, so the music never stumbles.
 */

export type MusicInst =
  | 'pad' | 'bass' | 'arp' | 'lead' | 'bell' | 'kick' | 'snare' | 'hat' | 'tom' | 'crash'
  | 'jingle' | 'guitar' | 'power' | 'rbass' | 'counter' | 'choir' | 'harmony' | 'fanfare';

export interface MusicNote {
  /** Absolute AudioContext time, seconds. */
  time: number;
  inst: MusicInst;
  midi: number;
  /** Seconds. */
  dur: number;
  /** 0..1 */
  vel: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
}

export interface MusicInputs {
  /** m/s */
  speed: number;
  /** m/s², negative = braking. */
  accel: number;
  /** deg/s, positive = turning right. */
  turnRate: number;
  revPedal: boolean;
  nitro: boolean;
  /** Current gear of the virtual gearbox (0 = neutral). */
  gear?: number;
}

export interface MusicLayers {
  pad: boolean;
  bass: boolean;
  kick: boolean;
  hat: boolean;
  snare: boolean;
  arp: boolean;
  lead: boolean;
  busy: boolean;
  halfTime: boolean;
  guitar: boolean;
  /** Instruments added by the gears (0..5). */
  gearVoices: number;
}

/** Continuous sound-shaping values for the Web Audio side. */
export interface MusicMix {
  /** Master low-pass cutoff of the music, Hz. */
  cutoff: number;
  /** Riser (build-up noise) level 0..1. */
  riser: number;
  /** Stereo position of arp / melody, -1..1. */
  pan: number;
  /** Echo feedback 0..0.7. */
  echo: number;
  /** Reverb send 0..1. */
  space: number;
  /** Overall level 0..1. */
  level: number;
}

const KMH = 3.6;
/** Speed (km/h) where the music reaches its full motorway form. */
const FULL_KMH = 120;

function approach(cur: number, target: number, dt: number, tauUp: number, tauDown: number): number {
  const tau = target > cur ? tauUp : tauDown;
  return cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
}

/** Pitch class of `midi` moved into [lo, lo + 11]. */
function inRange(midi: number, lo: number): number {
  return lo + ((((midi - lo) % 12) + 12) % 12);
}

export class MusicBrain {
  readonly style: MusicStyle;
  readonly song: ParsedSong | null;
  /** 16th notes per bar. */
  readonly steps: number;
  private readonly rng: () => number;
  /** Smoothed controls, 0..1 (turn -1..1). */
  cruise = 0;
  push = 0;
  brake = 0;
  turn = 0;
  riser = 0;
  gear = 0;
  bpm: number;
  layers: MusicLayers = { pad: true, bass: false, kick: false, hat: false, snare: false, arp: false, lead: false, busy: false, halfTime: false, guitar: false, gearVoices: 0 };
  private nextTime = 0;
  private step = 0;
  /** 16th notes since the start of the song (loops). */
  private pos = 0;
  bar = 0;
  private section = 0;
  private chordIdx = 0;
  private chordBar = 0;
  private chord: Chord;
  private chordDeg = 0;
  private lastPadKey = '';
  private running = false;
  private revHeld = false;
  private dropBars = 0;
  private pendingCrash = false;
  private pendingSection = false;
  private pendingFill = false;
  private fanfare = 0;
  private lastSectionBar = -99;
  private lastFillBar = -99;
  private motif: Array<number | null> = [];
  private arpPos = 0;
  private sparklePos = 0;
  /** Notes produced so far (diagnostics). */
  produced = 0;

  constructor(style: MusicStyle, seed = 1) {
    this.style = style;
    this.song = style.song ? parseSong(style.song) : null;
    this.steps = this.song ? this.song.stepsPerBar : (style.meter ?? 4) * 4;
    this.rng = createRng(seed);
    this.bpm = style.bpm[0];
    this.chord = this.degreeChord(0);
    this.makeMotif();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Start playing at AudioContext time `t`. */
  begin(t: number): void {
    this.running = true;
    this.nextTime = t + 0.05;
    this.step = 0;
    this.pos = 0;
    this.bar = 0;
    this.chordIdx = 0;
    this.chordBar = 0;
    this.lastPadKey = '';
    this.updateChord(0);
    this.decideLayers();
  }

  end(): void {
    this.running = false;
  }

  /** Feed the latest motion (called every simulation tick). */
  setInputs(i: MusicInputs, dt: number): void {
    const kmh = Math.max(0, i.speed) * KMH;
    this.cruise = approach(this.cruise, clamp(kmh / FULL_KMH, 0, 1), dt, 2.2, 3.5);
    const pushTarget = Math.max(clamp((i.accel - 0.35) / 2.2, 0, 1), i.revPedal ? 0.9 : 0, i.nitro ? 1 : 0);
    this.push = approach(this.push, pushTarget, dt, 0.25, 0.9);
    const brakeTarget = kmh > 3 ? clamp((-i.accel - 0.7) / 2.8, 0, 1) : 0;
    this.brake = approach(this.brake, brakeTarget, dt, 0.2, 0.7);
    const turnTarget = kmh > 8 ? clamp(i.turnRate / 28, -1, 1) : 0;
    this.turn = approach(this.turn, turnTarget, dt, 0.35, 0.8);
    const riserTarget = i.nitro ? 1 : i.revPedal ? 0.85 : 0;
    this.riser = approach(this.riser, riserTarget, dt, i.revPedal ? 1.6 : 0.4, 0.15);
    // Releasing REV after a build-up drops the full beat for two bars.
    if (this.revHeld && !i.revPedal && this.riser > 0.35) {
      this.dropBars = 2;
      this.pendingCrash = true;
    }
    this.revHeld = i.revPedal;
    this.gear = Math.max(0, Math.round(i.gear ?? 0));
    const [lo, hi] = this.style.bpm;
    const target = lo + (hi - lo) * Math.pow(this.cruise, 0.8) + 4 * this.push - 6 * this.brake;
    this.bpm = approach(this.bpm, clamp(target, lo - 6, hi + 4), dt, 4, 3);
  }

  shift(direction: 'up' | 'down'): void {
    if (direction === 'up') {
      this.fanfare = 1;
      if (this.bar - this.lastSectionBar >= 4) this.pendingSection = true;
    } else if (this.bar - this.lastFillBar >= 2 && (this.layers.kick || this.style.orchestral)) {
      this.pendingFill = true;
    }
  }

  mix(): MusicMix {
    const s = this.style;
    const open = 0.25 + 0.45 * this.cruise + 0.3 * this.push;
    const base = 500 + 15000 * Math.pow(clamp(open * (0.6 + 0.6 * s.brightness), 0, 1), 1.6);
    const cutoff = clamp(base * (1 - 0.85 * this.brake), 220, 16000);
    return {
      cutoff,
      riser: this.riser,
      pan: clamp(this.turn * 0.75, -0.8, 0.8),
      echo: clamp(0.18 + 0.32 * s.echo + 0.25 * Math.abs(this.turn), 0, 0.7),
      space: clamp(0.3 * s.space + 0.35 * this.brake + (this.cruise < 0.03 ? 0.25 : 0), 0, 1),
      level: this.running ? 1 : 0,
    };
  }

  /** Seconds per 16th note at the current tempo. */
  get stepDur(): number {
    return 60 / this.bpm / 4;
  }

  /**
   * Every note that starts before `until`. `now` = current AudioContext time; if the scheduler
   * fell behind (browser throttling) it skips ahead instead of playing a burst of late notes.
   */
  schedule(now: number, until: number): MusicNote[] {
    const out: MusicNote[] = [];
    if (!this.running) return out;
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.02;
    while (this.nextTime < until) {
      if (this.step === 0) this.onBar();
      if (this.song && this.step === this.steps / 2) this.updateChord(this.step);
      this.playStep(this.step, this.nextTime, out);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % this.steps;
      this.pos++;
      if (this.song && this.pos >= this.song.length) this.pos = 0;
    }
    this.produced += out.length;
    return out;
  }

  // ---------------------------------------------------------------------------

  private onBar(): void {
    if (this.bar > 0 && !this.song) {
      this.chordBar++;
      if (this.chordBar >= this.style.barsPerChord) {
        this.chordBar = 0;
        const prog = this.progression();
        this.chordIdx = (this.chordIdx + 1) % prog.length;
        if (this.chordIdx === 0 && this.rng() < 0.35) this.makeMotif();
      }
    }
    if (this.pendingSection) {
      this.pendingSection = false;
      this.section = (this.section + 1) % this.style.progressions.length;
      if (!this.song) {
        this.chordIdx = 0;
        this.chordBar = 0;
      }
      this.pendingCrash = true;
      this.lastSectionBar = this.bar;
      this.makeMotif();
    }
    this.updateChord(0);
    this.decideLayers();
    if (this.dropBars > 0) this.dropBars--;
    this.bar++;
  }

  private progression(): readonly number[] {
    return this.style.progressions[this.section % this.style.progressions.length] ?? [0];
  }

  private degreeChord(deg: number): Chord {
    const tones = chordDegrees(this.style, deg).map((d) => inRange(degreeToMidi(this.style, d), 55)).sort((a, b) => a - b);
    return { root: inRange(degreeToMidi(this.style, deg), 60), tones, key: `d${deg}` };
  }

  private updateChord(stepInBar: number): void {
    if (this.song) {
      const bar = Math.floor(this.pos / this.steps) % this.song.bars.length;
      const pair = this.song.bars[bar] ?? this.song.bars[0];
      if (pair) this.chord = stepInBar >= this.steps / 2 ? pair[1] : pair[0];
      return;
    }
    const prog = this.progression();
    this.chordDeg = prog[this.chordIdx % prog.length] ?? 0;
    this.chord = this.degreeChord(this.chordDeg);
  }

  private decideLayers(): void {
    const c = this.cruise;
    const p = this.push;
    const s = this.style;
    const drop = this.dropBars > 0;
    const L = this.layers;
    const hyst = (on: boolean, upAt: number, downAt: number, v: number): boolean => (on ? v > downAt : v > upAt);
    const energy = Math.max(c, p * 0.9);
    const drumsOk = s.drumThreshold <= 1;
    L.pad = true;
    L.bass = drop || hyst(L.bass, 0.04, 0.015, Math.max(c, p));
    L.kick = drumsOk && (drop || hyst(L.kick, s.drumThreshold, s.drumThreshold * 0.6, energy));
    L.hat = drumsOk && (drop || hyst(L.hat, s.drumThreshold + 0.15, s.drumThreshold + 0.08, energy));
    L.snare = drumsOk && (drop || hyst(L.snare, s.drumThreshold + 0.3, s.drumThreshold + 0.2, energy));
    L.guitar = !!(s.riff || s.boogie) && (drop || hyst(L.guitar, 0.1, 0.05, energy));
    // Styles without a pad (metal, minimal techno) play their arpeggio softly while standing.
    L.arp = drop || hyst(L.arp, 0.55, 0.45, Math.max(c, p * 1.2)) || (s.pad === 'none' && !this.song && c < 0.04);
    L.lead = this.song !== null || hyst(L.lead, 0.5, 0.3, p) || (c > 0.7 && this.bar % 8 >= 4);
    L.busy = drop || hyst(L.busy, 0.8, 0.7, Math.max(c, p));
    L.halfTime = this.brake > 0.35;
    L.gearVoices = clamp(this.gear - 1, 0, 5);
  }

  private makeMotif(): void {
    // A 2-bar melodic idea (scale steps relative to the chord), repeated with variation.
    const m: Array<number | null> = [];
    let deg = 0;
    for (let i = 0; i < this.steps * 2; i++) {
      const strong = i % 4 === 0;
      if (this.rng() < (strong ? 0.6 : 0.22)) {
        const r = this.rng();
        deg += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
        deg = clamp(deg, -3, 6);
        m.push(deg);
      } else m.push(null);
    }
    this.motif = m;
  }

  private playStep(step: number, t0: number, out: MusicNote[]): void {
    const s = this.style;
    const L = this.layers;
    const S = this.steps;
    const sd = this.stepDur;
    const t = t0 + (step % 2 === 1 ? s.swing * sd : 0);
    const chord = this.chord;
    const tones = chord.tones;
    const barDur = sd * S;
    const p = this.push;
    const c = this.cruise;
    const vel = (base: number) => clamp(base * (0.75 + 0.25 * Math.max(c, p)), 0, 1);
    const panSide = clamp(this.turn * 0.75, -0.8, 0.8);
    const hit = (pattern: string | undefined, i: number): number => {
      const ch = pattern?.[i];
      return ch === 'x' ? 1 : ch === 'o' ? 0.55 : 0;
    };
    const chordChanged = chord.key !== this.lastPadKey;
    const chordLen = this.song ? barDur / 2 : barDur * s.barsPerChord;

    // Pad: the chord, re-struck when it changes.
    if (chordChanged && (step === 0 || (this.song !== null && step === S / 2))) {
      this.lastPadKey = chord.key;
      if (s.pad !== 'none') for (const m of tones) out.push({ time: t, inst: 'pad', midi: m, dur: chordLen, vel: 0.6, pan: 0 });
      // Gear 2+: a sustained counter-line; gear 4+: a choir.
      if (L.gearVoices >= 1) out.push({ time: t, inst: 'counter', midi: (tones[tones.length - 1] ?? chord.root) + 12, dur: chordLen, vel: 0.55, pan: -0.3 });
      if (L.gearVoices >= 3) for (const m of tones.slice(-2)) out.push({ time: t, inst: 'choir', midi: m + 12, dur: chordLen, vel: 0.6, pan: 0.25 });
    }
    if (this.pendingCrash && step === 0) {
      out.push({ time: t, inst: 'crash', midi: 0, dur: 2.2, vel: 0.8, pan: 0 });
      this.pendingCrash = false;
    }

    // Upshift fanfare: a quick rising run of the chord in the gear instrument.
    if (this.fanfare > 0) {
      const k = this.fanfare - 1;
      const run = [...tones, (tones[0] ?? chord.root) + 12];
      out.push({ time: t, inst: 'fanfare', midi: (run[k] ?? chord.root) + 12, dur: sd * (k === 3 ? 4 : 1.2), vel: 0.5 + 0.1 * k, pan: (k - 1.5) * 0.3 });
      this.fanfare = this.fanfare >= 4 ? 0 : this.fanfare + 1;
    }

    // Bass.
    const b = inRange(chord.root, s.bassLow ?? 33);
    const fifth = b + 7;
    if (L.bass) {
      const note = (m: number, dur: number, v: number) => out.push({ time: t, inst: 'bass', midi: m, dur, vel: vel(v), pan: 0 });
      switch (s.bassPattern) {
        case 'eighths':
          if (step % 2 === 0) note(step % 8 === 6 && c > 0.5 ? b + 12 : b, sd * 1.7, step % 4 === 0 ? 0.85 : 0.65);
          break;
        case 'offbeat':
          if (step % 4 === 2) note(b, sd * 1.6, 0.85);
          break;
        case 'rolling':
          if (step % 4 !== 0) note(b, sd * 0.85, step % 4 === 2 ? 0.85 : 0.6);
          break;
        case 'acid':
          if (step % 4 === 2 || (p > 0.3 && this.rng() < 0.35 + 0.4 * p && step % 2 === 1)) {
            const r = this.rng();
            note(r < 0.15 ? b + 12 : r < 0.25 ? b + 7 : b, sd * 0.9, 0.6 + 0.4 * this.rng());
          }
          break;
        case 'lofi':
          if (step === 0) note(b, sd * 5, 0.9);
          else if (step === 6) note(fifth, sd * 3, 0.6);
          else if (step === 10) note(b, sd * 4, 0.75);
          break;
        case 'drone':
          if (chordChanged && (step === 0 || step === S / 2)) note(b, chordLen * 0.95, 0.8);
          else if (step === 0 && this.bar % 2 === 0) note(b, barDur * 0.95, 0.7);
          break;
        case 'ostinato':
          if (c > 0.35 || p > 0.4 ? step % 2 === 0 : step === 0 || step === S / 2) note(step % 8 === 4 ? fifth : b, sd * 1.8, step % 4 === 0 ? 0.9 : 0.6);
          break;
        case 'walking': {
          // Boogie-woogie: root, third, fifth, sixth, flat seventh, sixth, fifth, third.
          const line = [0, 4, 7, 9, 10, 9, 7, 4];
          if (step % 2 === 0) note(b + (line[(step / 2) % line.length] ?? 0), sd * 1.8, step % 4 === 0 ? 0.9 : 0.7);
          break;
        }
        case 'reverse':
          if (step % 4 === 2) out.push({ time: t, inst: 'rbass', midi: b + 12, dur: sd * 2, vel: vel(0.9), pan: 0 });
          break;
        case 'dnb':
          if (step === 0) note(b, sd * 6, 0.9);
          else if (step === 10) note(b, sd * 3, 0.75);
          else if (step === 14 && p > 0.3) note(fifth, sd * 2, 0.6);
          break;
        case 'chug': {
          const riff = L.halfTime && s.breakdown ? s.breakdown : s.riff;
          const ch = riff ? riff[step % riff.length] : step % 4 === 0 ? 'x' : '.';
          if (ch === 'x' || ch === 'P') note(b, ch === 'P' ? sd * 3.5 : sd * 0.8, 0.85);
          break;
        }
        case 'alberti':
          if (S === 12) {
            // Waltz: root on one, the fifth on two and three.
            if (step === 0) note(b, sd * 3.5, 0.9);
            else if (step === 4 || step === 8) note(fifth + 12, sd * 2.5, 0.5);
          } else if (step % 2 === 0) {
            note([b, fifth + 12, b + 16, fifth + 12][(step / 2) % 4] ?? b, sd * 1.8, step % 8 === 0 ? 0.8 : 0.5);
          }
          break;
      }
    }

    // Guitar: riffs (metal), boogie (rock and roll).
    if (L.guitar) {
      const g = b + 12;
      if (s.riff) {
        const riff = L.halfTime && s.breakdown ? s.breakdown : s.riff;
        const n = riff.length;
        const ch = riff[step % n];
        if (ch === 'x') out.push({ time: t, inst: 'guitar', midi: g, dur: sd * 0.8, vel: vel(0.85), pan: -0.35 });
        else if (ch === 'P') {
          let len = 1;
          while (len < n && riff[(step + len) % n] === '-') len++;
          out.push({ time: t, inst: 'power', midi: g, dur: sd * len, vel: vel(0.9), pan: 0.35 });
        }
      } else if (s.boogie && step % 2 === 0) {
        const six = (step / 2) % 2 === 1;
        out.push({ time: t, inst: 'guitar', midi: g, dur: sd * 1.6, vel: vel(0.7), pan: -0.3 });
        out.push({ time: t, inst: 'guitar', midi: g + (six ? 9 : 7), dur: sd * 1.6, vel: vel(0.55), pan: -0.3 });
      }
    }

    // Drums.
    const half = L.halfTime;
    const breakdown = half && !!s.breakdown;
    if (L.kick) {
      const kickLine = breakdown ? s.breakdown : L.busy && s.drums.kickBusy ? s.drums.kickBusy : s.drums.kick;
      const k = half && !breakdown ? (step === 0 ? 1 : 0) : hit(kickLine, step);
      if (k > 0) out.push({ time: t0, inst: 'kick', midi: 0, dur: 0.4, vel: vel(0.95 * k), pan: 0 });
      const tom = half ? 0 : hit(s.drums.tom, step);
      if (tom > 0) out.push({ time: t, inst: 'tom', midi: step % 3 === 0 ? 0 : 1, dur: 0.5, vel: vel(0.8 * tom), pan: step % 2 ? 0.25 : -0.25 });
    }
    if (L.snare) {
      const sn = half ? (step === S / 2 ? 1 : 0) : hit(s.drums.snare, step);
      if (sn > 0) out.push({ time: t, inst: 'snare', midi: 0, dur: 0.25, vel: vel(0.8 * sn), pan: 0 });
    }
    if (L.hat && !half) {
      const h = hit(L.busy ? s.drums.hatBusy : s.drums.hat, step);
      if (h > 0) out.push({ time: t, inst: 'hat', midi: step % 4 === 2 && !L.busy ? 1 : 0, dur: 0.05, vel: vel(0.55 * h * (step % 4 === 0 ? 1 : 0.8)), pan: (step % 2 ? 0.2 : -0.1) });
    }
    // Sleigh bells come in with the bass (Christmas).
    if (L.bass && !half && s.drums.jingle) {
      const j = hit(s.drums.jingle, step);
      if (j > 0) out.push({ time: t, inst: 'jingle', midi: 0, dur: 0.12, vel: vel(0.6 * j), pan: 0.3 });
    }
    // Downshift fill on the last beat; REV build-up = snare roll that gets denser.
    if (this.pendingFill && step >= S - 4) {
      out.push({ time: t, inst: s.drums.tom || s.orchestral ? 'tom' : 'snare', midi: step < S - 2 ? 0 : 1, dur: 0.2, vel: 0.5 + 0.1 * (step - S + 4), pan: (step - S + 2.5) * 0.3 });
      if (step === S - 1) {
        this.pendingFill = false;
        this.lastFillBar = this.bar;
      }
    }
    if (this.riser > 0.3 && this.revHeld) {
      const every = this.riser > 0.75 ? 1 : this.riser > 0.5 ? 2 : 4;
      if (step % every === 0) out.push({ time: t, inst: s.drumThreshold > 1 ? 'tom' : 'snare', midi: 0, dur: 0.12, vel: 0.25 + 0.45 * this.riser, pan: 0 });
    }

    // Arpeggio over the chord.
    if (L.arp) {
      const rate = L.busy || p > 0.65 ? 1 : 2;
      if (step % rate === 0) {
        const pool = [...tones, ...tones.map((m) => m + 12)];
        let idx: number;
        if (s.arp === 'up') idx = this.arpPos % pool.length;
        else if (s.arp === 'updown') {
          const n = pool.length * 2 - 2;
          const k = this.arpPos % n;
          idx = k < pool.length ? k : n - k;
        } else if (s.arp === 'pulse') idx = step % 8 === 0 ? 0 : 1 + (this.arpPos % 2);
        else if (s.arp === 'alberti') idx = [0, 2, 1, 2][this.arpPos % 4] ?? 0;
        else idx = Math.floor(this.rng() * pool.length);
        this.arpPos++;
        out.push({ time: t, inst: 'arp', midi: (pool[idx] ?? chord.root) + 12, dur: sd * rate * 0.9, vel: vel(0.5 + 0.3 * p), pan: panSide * (0.6 + 0.4 * Math.sin(this.arpPos)) });
      }
    }

    // Lead: the song's melody, or the improvised motif over the current chord.
    if (L.lead) {
      let note: { midi: number; len: number } | null = null;
      if (this.song) {
        const n = this.song.byStep.get(this.pos % this.song.length);
        if (n) note = { midi: n.midi, len: n.len };
      } else {
        const i = ((this.bar - 1) % 2) * S + step;
        const m = this.motif[(i + S * 2) % (S * 2)];
        if (m !== null && m !== undefined) {
          let deg = this.chordDeg + m + 7;
          if (step % 4 === 0 && !chordDegrees(s, this.chordDeg).some((cd) => (cd - deg) % 7 === 0)) deg += 1;
          let len = 1;
          while (len < 6 && this.motif[(i + len) % (S * 2)] === null) len++;
          note = { midi: degreeToMidi(s, deg), len };
        }
      }
      if (note) {
        // Songs are heard from the start: softer while standing, fuller as you drive.
        const v = this.song ? 0.55 + 0.3 * Math.max(c, p) : 0.55 + 0.35 * p;
        const top = note.midi;
        out.push({ time: t, inst: 'lead', midi: top, dur: sd * note.len * 0.95, vel: vel(v), pan: panSide });
        // Gear 5+: a harmony voice (a chord tone a third or more below the melody).
        if (L.gearVoices >= 4) {
          const below = [...tones, ...tones.map((m) => m + 12), ...tones.map((m) => m + 24)].filter((m) => m <= top - 3).pop();
          if (below !== undefined) out.push({ time: t, inst: 'harmony', midi: below, dur: sd * note.len * 0.95, vel: vel(v * 0.7), pan: -panSide * 0.5 });
        }
      }
    }

    // Gear 3+: sparkling bells (faster from 6th gear).
    const sparkleEvery = L.gearVoices >= 5 ? 2 : 4;
    if (L.gearVoices >= 2 && step % sparkleEvery === sparkleEvery / 2) {
      const m = (tones[this.sparklePos % Math.max(1, tones.length)] ?? chord.root) + 24;
      this.sparklePos++;
      out.push({ time: t, inst: 'bell', midi: m, dur: 0.8, vel: 0.28, pan: this.sparklePos % 2 ? 0.55 : -0.55 });
    }

    // Steering: sparkling bells on the side you turn to.
    const turnAmt = Math.abs(this.turn);
    if (turnAmt > 0.25 && step % 2 === 0 && this.rng() < 0.25 + 0.5 * turnAmt) {
      const m = (tones[Math.floor(this.rng() * tones.length)] ?? chord.root) + 24;
      out.push({ time: t, inst: 'bell', midi: m, dur: 1.2, vel: 0.3 + 0.4 * turnAmt, pan: Math.sign(this.turn) * (0.5 + 0.4 * turnAmt) });
    }
    // Standing still (generative styles): an occasional soft bell so the silence is never empty.
    if (!this.song && c < 0.03 && p < 0.1 && step === S / 2 && this.bar % 2 === 1 && this.rng() < 0.6) {
      const m = (tones[Math.floor(this.rng() * tones.length)] ?? chord.root) + 12;
      out.push({ time: t, inst: 'bell', midi: m, dur: 1.6, vel: 0.3, pan: this.rng() * 1.2 - 0.6 });
    }
  }
}
