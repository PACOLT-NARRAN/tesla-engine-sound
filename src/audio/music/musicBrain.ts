import { clamp, createRng } from '../../utils/math.ts';
import { chordDegrees, degreeToMidi, type MusicStyle } from './musicStyles.ts';

/**
 * The composer of the DRIVE MUSIC pack. Pure logic (no Web Audio), unit tested.
 *
 * How the driving plays the music:
 *  - SPEED   -> tempo and how many layers play: standstill = pad only, then bass, drums, hats,
 *               the full groove and finally a double-time arpeggio on the motorway.
 *  - THROTTLE (acceleration) -> intensity: brighter filter, arpeggio and a lead melody,
 *               louder notes. Holding REV or NITRO builds a riser; releasing REV drops the beat.
 *  - BRAKING -> the music "sinks": the filter closes, the drums go half-time, more reverb.
 *  - STEERING -> the arpeggio and melody move to the side you turn to, sparkling bells
 *               appear in the turn and the echo swirls.
 *  - GEAR SHIFTS -> upshift = new section (crash, other chord progression), downshift = drum fill.
 * Layer changes happen on bar lines, so the music never stumbles.
 */

export type MusicInst = 'pad' | 'bass' | 'arp' | 'lead' | 'bell' | 'kick' | 'snare' | 'hat' | 'tom' | 'crash';

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

const STEPS = 16;
const KMH = 3.6;
/** Speed (km/h) where the music reaches its full motorway form. */
const FULL_KMH = 120;

function approach(cur: number, target: number, dt: number, tauUp: number, tauDown: number): number {
  const tau = target > cur ? tauUp : tauDown;
  return cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
}

export class MusicBrain {
  readonly style: MusicStyle;
  private readonly rng: () => number;
  /** Smoothed controls, 0..1 (turn -1..1). */
  cruise = 0;
  push = 0;
  brake = 0;
  turn = 0;
  riser = 0;
  bpm: number;
  layers: MusicLayers = { pad: true, bass: false, kick: false, hat: false, snare: false, arp: false, lead: false, busy: false, halfTime: false };
  private nextTime = 0;
  private step = 0;
  bar = 0;
  private section = 0;
  private chordIdx = 0;
  private chordBar = 0;
  private running = false;
  private revHeld = false;
  private dropBars = 0;
  private pendingCrash = false;
  private pendingSection = false;
  private pendingFill = false;
  private lastSectionBar = -99;
  private lastFillBar = -99;
  private motif: Array<number | null> = [];
  private arpPos = 0;
  /** Notes produced so far (diagnostics). */
  produced = 0;

  constructor(style: MusicStyle, seed = 1) {
    this.style = style;
    this.rng = createRng(seed);
    this.bpm = style.bpm[0];
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
    this.bar = 0;
    this.chordIdx = 0;
    this.chordBar = 0;
    this.decideLayers();
  }

  end(): void {
    this.running = false;
  }

  /** Feed the latest motion (called every simulation tick). */
  setInputs(i: MusicInputs, dt: number): void {
    const kmh = Math.max(0, i.speed) * KMH;
    const cruiseTarget = clamp(kmh / FULL_KMH, 0, 1);
    this.cruise = approach(this.cruise, cruiseTarget, dt, 2.2, 3.5);
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
    const [lo, hi] = this.style.bpm;
    const target = lo + (hi - lo) * Math.pow(this.cruise, 0.8) + 4 * this.push - 6 * this.brake;
    this.bpm = approach(this.bpm, clamp(target, lo - 6, hi + 4), dt, 4, 3);
  }

  shift(direction: 'up' | 'down'): void {
    if (direction === 'up') {
      if (this.bar - this.lastSectionBar >= 4) this.pendingSection = true;
    } else if (this.bar - this.lastFillBar >= 2 && this.layers.kick) {
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
      this.playStep(this.step, this.nextTime, out);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % STEPS;
    }
    this.produced += out.length;
    return out;
  }

  // ---------------------------------------------------------------------------

  private onBar(): void {
    if (this.bar > 0) {
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
      this.chordIdx = 0;
      this.chordBar = 0;
      this.pendingCrash = true;
      this.lastSectionBar = this.bar;
      this.makeMotif();
    }
    this.decideLayers();
    if (this.dropBars > 0) this.dropBars--;
    this.bar++;
  }

  private progression(): readonly number[] {
    return this.style.progressions[this.section % this.style.progressions.length] ?? [0];
  }

  private chordRoot(): number {
    const prog = this.progression();
    return prog[this.chordIdx % prog.length] ?? 0;
  }

  private decideLayers(): void {
    const c = this.cruise;
    const p = this.push;
    const s = this.style;
    const drop = this.dropBars > 0;
    const L = this.layers;
    const hyst = (on: boolean, upAt: number, downAt: number, v: number): boolean => (on ? v > downAt : v > upAt);
    const energy = Math.max(c, p * 0.9);
    L.pad = true;
    L.bass = drop || hyst(L.bass, 0.04, 0.015, Math.max(c, p));
    L.kick = drop || hyst(L.kick, s.drumThreshold, s.drumThreshold * 0.6, energy);
    L.hat = drop || hyst(L.hat, s.drumThreshold + 0.15, s.drumThreshold + 0.08, energy);
    L.snare = drop || hyst(L.snare, s.drumThreshold + 0.3, s.drumThreshold + 0.2, energy);
    L.arp = drop || hyst(L.arp, 0.55, 0.45, Math.max(c, p * 1.2));
    L.lead = hyst(L.lead, 0.5, 0.3, p) || (c > 0.7 && this.bar % 8 >= 4);
    L.busy = drop || hyst(L.busy, 0.8, 0.7, Math.max(c, p));
    L.halfTime = this.brake > 0.35;
  }

  private makeMotif(): void {
    // A 2-bar melodic idea (scale steps relative to the chord), repeated with variation.
    const m: Array<number | null> = [];
    let deg = 0;
    for (let i = 0; i < STEPS * 2; i++) {
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
    const sd = this.stepDur;
    const t = t0 + (step % 2 === 1 ? s.swing * sd : 0);
    const root = this.chordRoot();
    const chord = chordDegrees(s, root);
    const barDur = sd * STEPS;
    const p = this.push;
    const c = this.cruise;
    const vel = (base: number) => clamp(base * (0.75 + 0.25 * Math.max(c, p)), 0, 1);
    const panSide = clamp(this.turn * 0.75, -0.8, 0.8);
    const hit = (pattern: string | undefined, i: number): number => {
      const ch = pattern?.[i];
      return ch === 'x' ? 1 : ch === 'o' ? 0.55 : 0;
    };

    // Pad: the chord, re-struck when it changes.
    if (step === 0 && this.chordBar === 0) {
      const len = barDur * s.barsPerChord;
      for (const d of chord) out.push({ time: t, inst: 'pad', midi: degreeToMidi(s, d), dur: len, vel: 0.6, pan: 0 });
    }
    if (this.pendingCrash && step === 0) {
      out.push({ time: t, inst: 'crash', midi: 0, dur: 2.2, vel: 0.8, pan: 0 });
      this.pendingCrash = false;
    }

    // Bass.
    if (L.bass) {
      const b = degreeToMidi(s, root) - 24;
      const fifth = degreeToMidi(s, root + 4) - 24;
      const note = (m: number, dur: number, v: number) => out.push({ time: t, inst: 'bass', midi: m, dur, vel: vel(v), pan: 0 });
      switch (s.bassPattern) {
        case 'eighths':
          if (step % 2 === 0) note(step % 8 === 6 && c > 0.5 ? b + 12 : b, sd * 1.7, step % 4 === 0 ? 0.85 : 0.65);
          break;
        case 'offbeat':
          if (step % 4 === 2) note(b, sd * 1.6, 0.85);
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
          if (step === 0 && this.chordBar === 0) note(b, barDur * s.barsPerChord * 0.95, 0.8);
          break;
        case 'ostinato':
          if (c > 0.35 || p > 0.4 ? step % 2 === 0 : step === 0 || step === 8) note(step % 8 === 4 ? fifth : b, sd * 1.8, step % 4 === 0 ? 0.9 : 0.6);
          break;
      }
    }

    // Drums.
    const half = L.halfTime;
    if (L.kick) {
      const k = half ? (step === 0 ? 1 : 0) : hit(s.drums.kick, step);
      if (k > 0) out.push({ time: t0, inst: 'kick', midi: 0, dur: 0.4, vel: vel(0.95 * k), pan: 0 });
      const tom = half ? 0 : hit(s.drums.tom, step);
      if (tom > 0) out.push({ time: t, inst: 'tom', midi: step % 3 === 0 ? 0 : 1, dur: 0.5, vel: vel(0.8 * tom), pan: step % 2 ? 0.25 : -0.25 });
    }
    if (L.snare) {
      const sn = half ? (step === 8 ? 1 : 0) : hit(s.drums.snare, step);
      if (sn > 0) out.push({ time: t, inst: 'snare', midi: 0, dur: 0.25, vel: vel(0.8 * sn), pan: 0 });
    }
    if (L.hat && !half) {
      const h = hit(L.busy ? s.drums.hatBusy : s.drums.hat, step);
      if (h > 0) out.push({ time: t, inst: 'hat', midi: step % 4 === 2 && !L.busy ? 1 : 0, dur: 0.05, vel: vel(0.55 * h * (step % 4 === 0 ? 1 : 0.8)), pan: (step % 2 ? 0.2 : -0.1) });
    }
    // Downshift fill on the last beat; REV build-up = snare roll that gets denser.
    if (this.pendingFill && step >= 12) {
      out.push({ time: t, inst: s.drums.tom ? 'tom' : 'snare', midi: step < 14 ? 0 : 1, dur: 0.2, vel: 0.5 + 0.1 * (step - 12), pan: (step - 13.5) * 0.3 });
      if (step === 15) {
        this.pendingFill = false;
        this.lastFillBar = this.bar;
      }
    }
    if (this.riser > 0.3 && this.revHeld) {
      const every = this.riser > 0.75 ? 1 : this.riser > 0.5 ? 2 : 4;
      if (step % every === 0) out.push({ time: t, inst: 'snare', midi: 0, dur: 0.12, vel: 0.25 + 0.45 * this.riser, pan: 0 });
    }

    // Arpeggio over the chord.
    if (L.arp) {
      const rate = L.busy || p > 0.65 ? 1 : 2;
      if (step % rate === 0) {
        const tones = [...chord, ...chord.map((d) => d + 7)];
        let idx: number;
        if (s.arp === 'up') idx = this.arpPos % tones.length;
        else if (s.arp === 'updown') {
          const n = tones.length * 2 - 2;
          const k = this.arpPos % n;
          idx = k < tones.length ? k : n - k;
        } else if (s.arp === 'pulse') idx = step % 8 === 0 ? 0 : 1 + (this.arpPos % 2) * 1;
        else idx = Math.floor(this.rng() * tones.length);
        this.arpPos++;
        const d = tones[idx] ?? root;
        out.push({ time: t, inst: 'arp', midi: degreeToMidi(s, d) + 12, dur: sd * rate * 0.9, vel: vel(0.5 + 0.3 * p), pan: panSide * (0.6 + 0.4 * Math.sin(this.arpPos)) });
      }
    }

    // Lead melody: the motif, played over the current chord.
    if (L.lead) {
      const i = ((this.bar - 1) % 2) * STEPS + step;
      const m = this.motif[(i + STEPS * 2) % (STEPS * 2)];
      if (m !== null && m !== undefined) {
        let deg = root + m + 7;
        // Prefer chord tones on strong beats.
        if (step % 4 === 0 && !chord.some((cd) => (cd - deg) % 7 === 0)) deg += 1;
        let len = 1;
        while (len < 6 && this.motif[(i + len) % (STEPS * 2)] === null) len++;
        out.push({ time: t, inst: 'lead', midi: degreeToMidi(s, deg), dur: sd * len * 0.95, vel: vel(0.55 + 0.35 * p), pan: panSide });
      }
    }

    // Steering: sparkling bells on the side you turn to.
    const turnAmt = Math.abs(this.turn);
    if (turnAmt > 0.25 && step % 2 === 0 && this.rng() < 0.25 + 0.5 * turnAmt) {
      const d = (chord[Math.floor(this.rng() * chord.length)] ?? root) + 14;
      out.push({ time: t, inst: 'bell', midi: degreeToMidi(s, d), dur: 1.2, vel: 0.3 + 0.4 * turnAmt, pan: Math.sign(this.turn) * (0.5 + 0.4 * turnAmt) });
    }
    // Standing still: an occasional soft bell so the silence is never empty.
    if (c < 0.03 && p < 0.1 && step === 8 && this.bar % 2 === 1 && this.rng() < 0.6) {
      const d = (chord[Math.floor(this.rng() * chord.length)] ?? root) + 7;
      out.push({ time: t, inst: 'bell', midi: degreeToMidi(s, d), dur: 1.6, vel: 0.3, pan: this.rng() * 1.2 - 0.6 });
    }
  }
}
