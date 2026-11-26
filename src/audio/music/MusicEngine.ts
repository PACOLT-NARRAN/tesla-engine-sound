import type { DrivetrainEvent, DrivetrainState } from '../../types/drivetrain.ts';
import { clamp } from '../../utils/math.ts';
import { MusicBrain, type MusicLayers, type MusicNote } from './musicBrain.ts';
import { getMusicStyle, midiToHz, type GearTimbre, type MusicStyle } from './musicStyles.ts';

/** Notes are scheduled this far ahead of the audio clock (covers timer jitter in the car). */
const LOOKAHEAD_S = 0.35;
/** Overall level of the music into the output stage. */
const LEVEL = 0.85;

export interface MusicDebugInfo {
  style: string;
  bpm: number;
  layers: MusicLayers;
  notes: number;
  cruise: number;
  push: number;
  brake: number;
  turn: number;
  gear: number;
}

type Bus = 'pad' | 'bass' | 'arp' | 'lead' | 'bell' | 'drum' | 'gear' | 'gtr';

/**
 * Music packs: plays what MusicBrain composes, with small Web Audio synths (pads, bass, arp,
 * melody, bells, drums, guitars), an echo, a reverb and a master filter driven by the car.
 * Works with an AudioContext (driving) and an OfflineAudioContext (render tests).
 *
 * Graph: instrument buses -> master low-pass -> level -> destination (the output stage)
 *        guitars / hard kicks / screech -> distortion -> cabinet filter -> master low-pass
 *        arp/lead/bell -> echo;  pad/arp/lead/bell/snare -> reverb;  riser + vinyl beds.
 */
export class MusicEngine {
  readonly style: MusicStyle;
  readonly brain: MusicBrain;
  private readonly ctx: BaseAudioContext;
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly padFilter: BiquadFilterNode;
  private readonly buses: Record<Bus, GainNode>;
  /** Input of the distortion chain (guitars, hard kicks, distorted bass). */
  private readonly drive: AudioNode;
  private readonly reverbSend: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly riserGain: GainNode;
  private readonly riserFilter: BiquadFilterNode;
  private readonly noise: AudioBuffer;
  /** Pre-rendered one-shots for the busiest percussion (one buffer source per hit). */
  private readonly hits: Record<'hat' | 'hatOpen' | 'jingle' | 'crash', AudioBuffer>;
  private readonly beds: AudioScheduledSourceNode[] = [];
  private lastUpdate = -1;
  private stopped = false;
  /** Last value sent to each automated parameter (only real changes are scheduled). */
  private readonly sent = new Map<string, number>();
  /** Panner hanging after a note's envelope gain (disconnected with it). */
  private readonly tails = new WeakMap<GainNode, AudioNode>();

  constructor(ctx: BaseAudioContext, dest: AudioNode, styleId: string, seed = 7) {
    const style = getMusicStyle(styleId);
    if (!style) throw new Error(`unknown music style ${styleId}`);
    this.style = style;
    this.ctx = ctx;
    this.brain = new MusicBrain(style, seed);
    this.noise = makeNoise(ctx, 2);
    this.hits = makeHits(ctx, !!style.vinyl);

    this.out = new GainNode(ctx, { gain: 0 });
    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3000, Q: 0.9 });
    this.filter.connect(this.out).connect(dest);

    const bus = (g: number) => new GainNode(ctx, { gain: g });
    this.buses = { pad: bus(0.18), bass: bus(0.34), arp: bus(0.11), lead: bus(0.12), bell: bus(0.1), drum: bus(0.62), gear: bus(0.1), gtr: bus(0.11) };
    this.padFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800, Q: 0.5 });
    this.buses.pad.connect(this.padFilter).connect(this.filter);
    for (const k of ['bass', 'arp', 'lead', 'bell', 'drum', 'gear'] as const) this.buses[k].connect(this.filter);

    // Distortion: soft-clipping waveshaper + guitar-cabinet filtering. The guitar bus always
    // goes through it; drums / bass / lead join per note when the style asks for it.
    const amount = clamp(style.dist ?? 0.5, 0, 1);
    const pre = new GainNode(ctx, { gain: 1 + 6 * amount });
    const shaper = new WaveShaperNode(ctx, { curve: driveCurve(2 + 30 * amount), oversample: '2x' });
    const cabHp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 90 });
    const cabLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4800, Q: 0.8 });
    const post = new GainNode(ctx, { gain: 0.5 / (1 + amount) });
    pre.connect(shaper).connect(cabHp).connect(cabLp).connect(post).connect(this.filter);
    this.drive = pre;
    this.buses.gtr.connect(pre);

    // Echo (dotted eighth, follows the tempo) for arp, melody and bells.
    this.delay = new DelayNode(ctx, { maxDelayTime: 2, delayTime: 0.4 });
    this.feedback = new GainNode(ctx, { gain: 0.3 });
    const delayIn = new GainNode(ctx, { gain: 0.5 });
    const delayTone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3500 });
    delayIn.connect(this.delay).connect(delayTone).connect(this.feedback).connect(this.delay);
    delayTone.connect(this.filter);
    for (const k of ['arp', 'lead', 'bell'] as const) this.buses[k].connect(delayIn);

    // Reverb: generated impulse response (no files).
    this.reverbSend = new GainNode(ctx, { gain: 0.3 });
    const conv = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 1.6 + 1.8 * style.space) });
    const reverbOut = new GainNode(ctx, { gain: 0.9 });
    this.reverbSend.connect(conv).connect(reverbOut).connect(this.filter);
    this.padFilter.connect(this.reverbSend);
    for (const k of ['arp', 'lead', 'bell', 'gear'] as const) this.buses[k].connect(this.reverbSend);

    // Riser (build-up while REV / NITRO is held): band-passed noise that sweeps up.
    this.riserGain = new GainNode(ctx, { gain: 0 });
    this.riserFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500, Q: 2.5 });
    const riserSrc = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
    riserSrc.connect(this.riserFilter).connect(this.riserGain).connect(this.filter);
    riserSrc.start();
    this.beds.push(riserSrc);

    if (style.vinyl) {
      const vinyl = new AudioBufferSourceNode(ctx, { buffer: makeVinyl(ctx), loop: true });
      const vg = new GainNode(ctx, { gain: 0.16 });
      vinyl.connect(vg).connect(this.out);
      vinyl.start();
      this.beds.push(vinyl);
    }
  }

  /** Begin playing (fades in; ignition = a soft swell). */
  start(now: number): void {
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.setTargetAtTime(LEVEL, now, 0.4);
    this.brain.begin(now);
    this.lastUpdate = now;
  }

  /** Fade out and release everything. */
  stop(now: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.brain.end();
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.setTargetAtTime(0, now, 0.5);
    for (const b of this.beds) b.stop(now + 4);
    setTimeout(() => this.out.disconnect(), 4500);
  }

  /** Called every simulation tick (and by the offline render test with explicit times). */
  update(now: number, s: DrivetrainState, events: readonly DrivetrainEvent[], turnRate: number, nitro: boolean): void {
    if (this.stopped) return;
    const dt = clamp(this.lastUpdate < 0 ? 0.02 : now - this.lastUpdate, 0, 0.5);
    this.lastUpdate = now;
    const b = this.brain;
    b.setInputs({ speed: s.speed, accel: s.accel, turnRate, revPedal: s.revPedal, nitro, gear: s.gear }, dt);
    for (const e of events) if (e.type === 'shift') b.shift(e.direction);
    for (const n of b.schedule(now, now + LOOKAHEAD_S)) this.play(n);

    const m = b.mix();
    const set = (key: string, param: AudioParam, v: number, tc: number) => {
      const last = this.sent.get(key);
      if (last !== undefined && Math.abs(v - last) <= Math.max(1e-4, Math.abs(last) * 0.02)) return;
      this.sent.set(key, v);
      param.setTargetAtTime(v, now, tc);
    };
    const lastCut = this.sent.get('cut') ?? m.cutoff;
    set('cut', this.filter.frequency, m.cutoff, m.cutoff < lastCut ? 0.12 : 0.08);
    set('pad', this.padFilter.frequency, clamp(m.cutoff * 0.45, 300, 6000), 0.2);
    set('rg', this.riserGain.gain, 0.22 * m.riser * m.riser, 0.1);
    set('rf', this.riserFilter.frequency, 400 + 7000 * m.riser * m.riser, 0.15);
    set('fb', this.feedback.gain, m.echo, 0.3);
    set('dl', this.delay.delayTime, clamp(b.stepDur * 3, 0.1, 1.5), 0.5);
    set('rv', this.reverbSend.gain, 0.15 + 0.6 * m.space, 0.3);
  }

  debugInfo(): MusicDebugInfo {
    const b = this.brain;
    return { style: this.style.id, bpm: Math.round(b.bpm), layers: { ...b.layers }, notes: b.produced, cruise: b.cruise, push: b.push, brake: b.brake, turn: b.turn, gear: b.gear };
  }

  // --- Instruments ---------------------------------------------------------------

  private play(n: MusicNote): void {
    const s = this.style;
    switch (n.inst) {
      case 'pad': return this.pad(n);
      case 'bass': return this.bass(n);
      case 'arp': return this.arp(n);
      case 'lead': return this.lead(n, this.buses.lead);
      case 'harmony': return this.lead({ ...n, vel: n.vel * 0.8 }, this.buses.gear);
      case 'bell': return this.bell(n, this.buses.bell);
      case 'counter': return this.sustain(n, s.gearVoice ?? 'strings', this.buses.gear);
      case 'choir': return this.sustain(n, 'choir', this.buses.gear);
      case 'fanfare': return s.gearVoice === 'brass' ? this.sustain(n, 'brass', this.buses.gear) : this.bell({ ...n, dur: 1 }, this.buses.gear);
      case 'kick': return this.kick(n);
      case 'snare': return this.snare(n);
      case 'hat': return this.hat(n);
      case 'tom': return this.tom(n);
      case 'crash': return this.crash(n);
      case 'jingle': return this.jingle(n);
      case 'guitar': return this.guitar(n, false);
      case 'power': return this.guitar(n, true);
      case 'rbass': return this.reverseBass(n);
    }
  }

  /** Output chain of one note: envelope gain -> optional pan -> bus. Returns the envelope gain. */
  private voiceOut(bus: AudioNode, pan: number): GainNode {
    const g = new GainNode(this.ctx, { gain: 0 });
    if (Math.abs(pan) > 0.02) {
      const p = new StereoPannerNode(this.ctx, { pan: clamp(pan, -1, 1) });
      g.connect(p).connect(bus);
      this.tails.set(g, p);
    } else g.connect(bus);
    return g;
  }

  private osc(type: OscillatorType, f: number, detune: number, to: AudioNode, t: number, end: number): OscillatorNode {
    const o = new OscillatorNode(this.ctx, { type, frequency: f, detune });
    o.connect(to);
    o.start(t);
    o.stop(end);
    this.release(o, to);
    return o;
  }

  /** When a note's source ends, unhook it and its chain so finished notes cost nothing. */
  private release(src: AudioScheduledSourceNode, ...chain: AudioNode[]): void {
    src.onended = () => {
      src.disconnect();
      for (const n of chain) {
        n.disconnect();
        const tail = n instanceof GainNode ? this.tails.get(n) : undefined;
        if (tail) tail.disconnect();
      }
    };
  }

  /** Also unhook these nodes when `src` ends (keeps any earlier onended cleanup). */
  private after(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    const prev = src.onended;
    src.onended = (e) => {
      if (typeof prev === 'function') prev.call(src, e);
      for (const n of nodes) {
        n.disconnect();
        const tail = n instanceof GainNode ? this.tails.get(n) : undefined;
        if (tail) tail.disconnect();
      }
    };
  }

  /** Attack / hold / exponential release envelope. Returns the time the sound is gone. */
  private env(p: AudioParam, t: number, attack: number, peak: number, hold: number, release: number): number {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    p.setTargetAtTime(0, t + Math.max(attack, hold), release);
    // Stop once the tail is ~35 dB down: long pad tails were the biggest CPU cost.
    return t + Math.max(attack, hold) + release * 4;
  }

  private pad(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const kind = this.style.pad;
    if (kind === 'epiano') {
      const g = this.voiceOut(this.buses.pad, 0);
      const end = this.env(g.gain, t, 0.006, n.vel * 1.1, 0.05, 0.9);
      this.osc('sine', f, 0, g, t, end);
      const h = new GainNode(this.ctx, { gain: 0 });
      h.connect(g);
      this.env(h.gain, t, 0.004, 0.35, 0.02, 0.12);
      this.osc('sine', f * 4.01, 0, h, t, t + 1);
      return;
    }
    if (kind === 'organ' || kind === 'choir') return this.sustain({ ...n, vel: n.vel * 1.3 }, kind, this.buses.pad);
    const spec: Record<string, { w: OscillatorType; det: number[]; a: number; r: number; lvl: number }> = {
      // Two detuned voices per note (was 3–4): pads were the biggest CPU cost in the car.
      saw: { w: 'sawtooth', det: [-9, 9], a: 0.25, r: 0.45, lvl: 0.66 },
      warm: { w: 'triangle', det: [-6, 6, 1200], a: 1.1, r: 0.9, lvl: 0.9 },
      strings: { w: 'sawtooth', det: [-11, 11], a: 0.45, r: 0.55, lvl: 0.62 },
      glass: { w: 'triangle', det: [-4, 4, 1902], a: 0.04, r: 0.9, lvl: 0.7 },
    };
    const sp = spec[kind] ?? (spec.saw as { w: OscillatorType; det: number[]; a: number; r: number; lvl: number });
    const hold = Math.max(sp.a, n.dur - 0.05);
    sp.det.forEach((d, i) => {
      const pan = sp.det.length > 1 ? -0.5 + i / (sp.det.length - 1) : 0;
      const g = this.voiceOut(this.buses.pad, pan);
      const end = this.env(g.gain, t, sp.a, n.vel * sp.lvl * (d >= 1200 ? 0.35 : 1), hold, sp.r);
      this.osc(sp.w, f, d, g, t, end);
    });
  }

  /** Long notes: strings, organ, choir, brass, flute, saw, glass (gear voices, organ/choir pads). */
  private sustain(n: MusicNote, kind: GearTimbre, bus: GainNode): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const g = this.voiceOut(bus, n.pan);
    const hold = Math.max(0.05, n.dur - 0.05);
    let end: number;
    if (kind === 'organ') {
      end = this.env(g.gain, t, 0.01, n.vel * 0.45, hold, 0.06);
      this.osc('sine', f, 0, g, t, end);
      this.osc('sine', f * 2, 0, g, t, end);
      const h = new GainNode(this.ctx, { gain: 0.5 });
      h.connect(g);
      this.osc('sine', f * 3, 0, h, t, end);
    } else if (kind === 'choir') {
      // "Aah": two detuned saws through vowel formants.
      end = this.env(g.gain, t, 0.35, n.vel * 0.9, hold, 0.5);
      const f1 = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 750, Q: 4 });
      const f2 = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 1200, Q: 5 });
      f1.connect(g);
      f2.connect(g);
      const o = this.osc('sawtooth', f, (n.midi % 2 ? 6 : -6), f1, t, end);
      o.connect(f2);
      this.after(o, f2, g);
    } else if (kind === 'brass') {
      const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 600, Q: 1 });
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(2400, t + 0.08);
      lp.frequency.setTargetAtTime(1400, t + 0.1, 0.3);
      lp.connect(g);
      end = this.env(g.gain, t, 0.05, n.vel * 0.6, hold, 0.12);
      this.osc('sawtooth', f, -6, lp, t, end);
      this.after(this.osc('sawtooth', f, 6, lp, t, end), g);
    } else if (kind === 'flute') {
      end = this.env(g.gain, t, 0.08, n.vel * 0.7, hold, 0.15);
      this.osc('sine', f, 0, g, t, end);
      this.osc('triangle', f * 2, 0, g, t, end);
    } else if (kind === 'glass') {
      end = this.env(g.gain, t, 0.02, n.vel * 0.7, hold * 0.5, 0.6);
      this.osc('triangle', f, -4, g, t, end);
      this.osc('sine', f * 2.01, 0, g, t, end);
    } else {
      // strings / saw ensemble
      const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: kind === 'saw' ? 2600 : 1800, Q: 0.5 });
      lp.connect(g);
      end = this.env(g.gain, t, kind === 'saw' ? 0.05 : 0.3, n.vel * 0.45, hold, 0.4);
      this.osc('sawtooth', f, -10, lp, t, end);
      this.after(this.osc('sawtooth', f, 10, lp, t, end), g);
    }
  }

  private bass(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const kind = this.style.bass;
    const g = this.voiceOut(kind === 'dist' ? this.drive : this.buses.bass, 0);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 600, Q: kind === 'acid' ? 13 : 1 });
    lp.connect(g);
    const push = this.brain.push;
    let end: number;
    if (kind === 'acid') {
      const peak = 380 + 2600 * (0.3 + 0.7 * push) * n.vel;
      lp.frequency.setValueAtTime(peak, t);
      lp.frequency.setTargetAtTime(220, t + 0.01, 0.09);
      end = this.env(g.gain, t, 0.004, 0.55 * n.vel, n.dur, 0.04);
      this.osc('sawtooth', f, 0, lp, t, end);
    } else if (kind === 'sub') {
      lp.frequency.value = 300;
      end = this.env(g.gain, t, 0.3, 0.9 * n.vel, n.dur, 0.6);
      this.osc('sine', f, 0, lp, t, end);
      this.osc('triangle', f * 2, 0, lp, t, end);
    } else if (kind === 'pluck') {
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.setTargetAtTime(350, t, 0.12);
      end = this.env(g.gain, t, 0.005, 0.9 * n.vel, 0.02, Math.min(0.5, n.dur * 0.4));
      this.osc('triangle', f, 0, lp, t, end);
      this.osc('sine', f / 2, 0, lp, t, end);
    } else if (kind === 'cello') {
      lp.frequency.value = 900;
      end = this.env(g.gain, t, 0.03, 0.6 * n.vel, n.dur * 0.8, 0.12);
      this.osc('sawtooth', f, -6, lp, t, end);
      this.osc('sawtooth', f, 6, lp, t, end);
    } else if (kind === 'reese') {
      // Drum & bass: two detuned saws, the filter breathes with the throttle.
      lp.frequency.value = 280 + 900 * push;
      lp.Q.value = 3;
      end = this.env(g.gain, t, 0.02, 0.6 * n.vel, n.dur, 0.08);
      this.osc('sawtooth', f, -18, lp, t, end);
      this.osc('sawtooth', f, 18, lp, t, end);
      this.osc('sine', f / 2, 0, g, t, end);
    } else if (kind === 'chip') {
      lp.frequency.value = 5000;
      end = this.env(g.gain, t, 0.002, 0.5 * n.vel, n.dur * 0.8, 0.02);
      this.osc('triangle', f, 0, lp, t, end);
    } else if (kind === 'dist') {
      lp.frequency.value = 1200 + 2000 * push;
      end = this.env(g.gain, t, 0.004, 0.55 * n.vel, n.dur * 0.8, 0.04);
      this.osc('sawtooth', f, 0, lp, t, end);
      this.osc('square', f / 2, 0, lp, t, end);
    } else {
      lp.frequency.setValueAtTime(1600 + 1400 * push, t);
      lp.frequency.setTargetAtTime(500, t, 0.08);
      end = this.env(g.gain, t, 0.005, 0.6 * n.vel, n.dur * 0.7, 0.06);
      this.osc('sawtooth', f, 0, lp, t, end);
      this.osc('square', f / 2, 0, lp, t, end);
    }
    this.cleanupAt(end, g);
  }

  /** A silent timer source that unhooks `nodes` once the note is over. */
  private cleanupAt(end: number, ...nodes: AudioNode[]): void {
    const c = new ConstantSourceNode(this.ctx, { offset: 0 });
    c.start(end);
    c.stop(end + 0.01);
    this.after(c, ...nodes);
  }

  private arp(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const voice = this.style.arpVoice ?? 'saw';
    if (voice === 'bell') return this.bell({ ...n, vel: n.vel * 0.8, dur: 0.6 }, this.buses.arp);
    if (voice === 'piano' || voice === 'harpsichord') return this.keys({ ...n, vel: n.vel * 0.9 }, voice, this.buses.arp);
    const g = this.voiceOut(this.buses.arp, n.pan);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 4000, Q: 2 });
    lp.frequency.setValueAtTime(1500 + 4000 * n.vel, t);
    lp.frequency.setTargetAtTime(voice === 'pluck' ? 500 : 700, t, voice === 'pluck' ? 0.05 : 0.08);
    lp.connect(g);
    const end = this.env(g.gain, t, 0.003, n.vel, 0.01, Math.max(0.05, n.dur * 0.5));
    const wave: OscillatorType = voice === 'square' ? 'square' : voice === 'triangle' || voice === 'pluck' ? 'triangle' : 'sawtooth';
    this.after(this.osc(wave, f, 0, lp, t, end), g);
    if (wave === 'sawtooth') this.osc(wave, f, 8, lp, t, end);
  }

  /** Piano / harpsichord: struck strings with a quick decay. */
  private keys(n: MusicNote, kind: 'piano' | 'harpsichord', bus: GainNode): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const g = this.voiceOut(bus, n.pan);
    if (kind === 'harpsichord') {
      const hp = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: f * 1.5 });
      hp.connect(g);
      const end = this.env(g.gain, t, 0.002, n.vel * 0.7, 0.01, Math.min(0.6, 0.15 + n.dur * 0.3));
      this.osc('sawtooth', f, 0, hp, t, end);
      this.after(this.osc('square', f * 2, 3, hp, t, end), g);
    } else {
      const end = this.env(g.gain, t, 0.004, n.vel * 0.9, 0.02, Math.min(1.2, 0.3 + n.dur * 0.4));
      this.osc('triangle', f, 0, g, t, end);
      const h = new GainNode(this.ctx, { gain: 0 });
      h.connect(g);
      this.env(h.gain, t, 0.003, 0.4, 0.01, 0.15);
      this.osc('sine', f * 2, 2, h, t, end);
      this.osc('sine', f * 3, -2, h, t, end);
    }
  }

  private lead(n: MusicNote, bus: GainNode): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const kind = this.style.lead;
    if (kind === 'bell') return this.bell({ ...n, dur: Math.max(n.dur, 1) }, bus);
    if (kind === 'piano' || kind === 'harpsichord') return this.keys(n, kind, bus);
    if (kind === 'organ' || kind === 'strings') return this.sustain(n, kind, bus);
    const g = this.voiceOut(kind === 'screech' || kind === 'guitar' ? this.drive : bus, n.pan);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 3000, Q: 1 });
    lp.connect(g);
    const vib = new OscillatorNode(this.ctx, { frequency: kind === 'screech' ? 7.5 : 5.2 });
    const vibAmt = new GainNode(this.ctx, { gain: 0 });
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(kind === 'flute' ? 9 : kind === 'screech' ? 90 : 14, t + (kind === 'screech' ? 0.05 : 0.35));
    vib.connect(vibAmt);
    let end: number;
    const oscs: OscillatorNode[] = [];
    if (kind === 'brass') {
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(2600 * (0.6 + 0.4 * n.vel), t + 0.09);
      lp.frequency.setTargetAtTime(1500, t + 0.1, 0.3);
      end = this.env(g.gain, t, 0.05, 0.6 * n.vel, n.dur, 0.12);
      oscs.push(this.osc('sawtooth', f, -7, lp, t, end), this.osc('sawtooth', f, 7, lp, t, end), this.osc('sawtooth', f / 2, 0, lp, t, end));
    } else if (kind === 'flute') {
      lp.frequency.value = 2400;
      end = this.env(g.gain, t, 0.06, 0.7 * n.vel, n.dur, 0.1);
      oscs.push(this.osc('sine', f, 0, lp, t, end), this.osc('triangle', f * 2, 0, lp, t, end));
    } else if (kind === 'supersaw') {
      lp.frequency.value = 5000;
      end = this.env(g.gain, t, 0.01, 0.32 * n.vel, n.dur, 0.12);
      for (const d of [-24, -11, 0, 11, 24]) oscs.push(this.osc('sawtooth', f, d, lp, t, end));
    } else if (kind === 'screech') {
      lp.type = 'bandpass';
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.linearRampToValueAtTime(3200, t + Math.max(0.05, n.dur));
      end = this.env(g.gain, t, 0.005, 0.5 * n.vel, n.dur, 0.05);
      oscs.push(this.osc('sawtooth', f, 0, lp, t, end), this.osc('square', f * 1.01, 0, lp, t, end));
    } else if (kind === 'guitar') {
      lp.frequency.value = 2600;
      end = this.env(g.gain, t, 0.005, 0.45 * n.vel, n.dur, 0.15);
      oscs.push(this.osc('sawtooth', f, -4, lp, t, end), this.osc('sawtooth', f, 4, lp, t, end));
    } else if (kind === 'chip') {
      lp.frequency.value = 6000;
      end = this.env(g.gain, t, 0.002, 0.35 * n.vel, n.dur, 0.03);
      oscs.push(this.osc('square', f, 0, lp, t, end));
    } else {
      lp.frequency.value = kind === 'square' ? 2200 : 3200;
      end = this.env(g.gain, t, 0.01, 0.5 * n.vel, n.dur, 0.08);
      oscs.push(this.osc(kind === 'square' ? 'square' : 'sawtooth', f, -5, lp, t, end), this.osc(kind === 'square' ? 'square' : 'sawtooth', f, 5, lp, t, end));
    }
    for (const o of oscs) vibAmt.connect(o.detune);
    vib.start(t);
    vib.stop(end);
    this.release(vib, vibAmt, lp, g);
  }

  /** FM bell: a sine carrier with a decaying inharmonic modulator. */
  private bell(n: MusicNote, bus: GainNode): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const g = this.voiceOut(bus, n.pan);
    const end = this.env(g.gain, t, 0.003, n.vel, 0.01, n.dur * 0.35);
    const car = this.osc('sine', f, 0, g, t, end);
    const mod = new OscillatorNode(this.ctx, { frequency: f * 3.5 });
    const idx = new GainNode(this.ctx, { gain: f * 1.6 });
    idx.gain.setValueAtTime(f * 1.6, t);
    idx.gain.setTargetAtTime(f * 0.1, t, 0.25);
    mod.connect(idx).connect(car.frequency);
    mod.start(t);
    mod.stop(end);
    this.release(mod, idx);
  }

  /** Distorted guitar: palm-muted chug (one note) or power chord (root, fifth, octave). */
  private guitar(n: MusicNote, power: boolean): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const g = this.voiceOut(this.buses.gtr, n.pan);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: power ? 3200 : 900, Q: 0.7 });
    lp.connect(g);
    const end = power ? this.env(g.gain, t, 0.004, n.vel, n.dur, 0.12) : this.env(g.gain, t, 0.002, n.vel, n.dur * 0.6, 0.04);
    this.osc('sawtooth', f, -6, lp, t, end);
    this.after(this.osc('sawtooth', f, 6, lp, t, end), g);
    if (power) {
      this.osc('sawtooth', f * 1.498, 0, lp, t, end);
      this.osc('sawtooth', f * 2, 4, lp, t, end);
    }
  }

  /** Hardstyle reverse bass: swells up over the off-beat, then cuts off before the next kick. */
  private reverseBass(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const g = this.voiceOut(this.drive, 0);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 300, Q: 4 });
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.linearRampToValueAtTime(1800, t + n.dur * 0.85);
    lp.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7 * n.vel, t + n.dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t + n.dur);
    const end = t + n.dur + 0.02;
    this.osc('sawtooth', f, -8, lp, t, end);
    this.after(this.osc('sawtooth', f, 8, lp, t, end), g);
  }

  private noiseHit(t: number, filter: BiquadFilterOptions, peak: number, decay: number, bus: AudioNode, pan = 0): GainNode {
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const f = new BiquadFilterNode(this.ctx, filter);
    const g = this.voiceOut(bus, pan);
    src.connect(f).connect(g);
    const end = this.env(g.gain, t, 0.001, peak, 0.001, decay);
    src.start(t, Math.random() * 1.5);
    src.stop(end);
    this.release(src, f, g);
    return g;
  }

  private kick(n: MusicNote): void {
    const t = n.time;
    const kind = this.style.kick ?? 'punch';
    const distorted = kind === 'hard' || kind === 'tekno';
    const g = this.voiceOut(distorted ? this.drive : this.buses.drum, 0);
    const o = new OscillatorNode(this.ctx, { type: kind === 'chip' ? 'square' : 'sine', frequency: 150 });
    const startHz = kind === 'hard' ? 260 : kind === 'tekno' ? 200 : kind === 'rock' ? 120 : kind === 'chip' ? 180 : this.style.id === 'techno' ? 170 : 140;
    const endHz = kind === 'hard' ? 52 : kind === 'rock' ? 55 : 46;
    const drop = kind === 'hard' ? 0.18 : kind === 'chip' ? 0.06 : 0.11;
    o.frequency.setValueAtTime(startHz, t);
    o.frequency.exponentialRampToValueAtTime(endHz, t + drop);
    o.connect(g);
    // Hard kicks ring on (the "tail"); rock / chip kicks are short.
    const hold = kind === 'hard' ? 0.16 : kind === 'tekno' ? 0.08 : kind === 'rock' || kind === 'chip' ? 0.02 : 0.04;
    const rel = kind === 'hard' ? 0.07 : kind === 'soft' ? 0.15 : 0.09;
    const end = this.env(g.gain, t, 0.002, n.vel * (distorted ? 0.8 : kind === 'soft' ? 0.7 : 1), hold, rel);
    o.start(t);
    o.stop(end);
    this.release(o, g);
    if (kind !== 'soft') this.noiseHit(t, { type: 'highpass', frequency: kind === 'rock' ? 1800 : 2500 }, (kind === 'rock' ? 0.3 : 0.15) * n.vel, 0.004, this.buses.drum);
  }

  private snare(n: MusicNote): void {
    const t = n.time;
    if (this.style.kick === 'chip') {
      this.noiseHit(t, { type: 'highpass', frequency: 1500 }, 0.6 * n.vel, 0.04, this.buses.drum);
      return;
    }
    if (this.style.drums.clap) {
      for (const dt of [0, 0.011, 0.022]) this.noiseHit(t + dt, { type: 'bandpass', frequency: 1300, Q: 1.1 }, 0.9 * n.vel, dt === 0.022 ? 0.07 : 0.006, this.buses.drum);
    } else {
      this.noiseHit(t, { type: 'bandpass', frequency: 2200, Q: 0.7 }, 0.7 * n.vel, 0.05, this.buses.drum);
      const g = this.voiceOut(this.buses.drum, 0);
      const end = this.env(g.gain, t, 0.001, 0.5 * n.vel, 0.005, 0.03);
      this.osc('triangle', 190, 0, g, t, end);
    }
    // A touch of reverb on the backbeat.
    const s = new GainNode(this.ctx, { gain: 0.3 });
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const f = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 1800 });
    src.connect(f).connect(s).connect(this.reverbSend);
    const end = this.env(s.gain, t, 0.001, 0.25 * n.vel, 0.001, 0.04);
    src.start(t);
    src.stop(end);
    this.release(src, f, s);
  }

  /** Plays a pre-rendered one-shot. */
  private oneShot(buf: AudioBuffer, t: number, vel: number, pan: number): void {
    const src = new AudioBufferSourceNode(this.ctx, { buffer: buf });
    const g = this.voiceOut(this.buses.drum, pan);
    g.gain.value = vel;
    src.connect(g);
    src.start(t);
    this.release(src, g);
  }

  private hat(n: MusicNote): void {
    this.oneShot(n.midi === 1 ? this.hits.hatOpen : this.hits.hat, n.time, n.vel * 0.7, n.pan);
  }

  /** Sleigh bells: a cluster of tiny bright metallic hits. */
  private jingle(n: MusicNote): void {
    this.oneShot(this.hits.jingle, n.time, n.vel * 0.9, n.pan);
  }

  private tom(n: MusicNote): void {
    const t = n.time;
    // Orchestral styles: timpani (lower, longer); otherwise toms / taiko.
    const timp = !!this.style.orchestral;
    const base = timp ? (n.midi === 0 ? 55 : 73) : n.midi === 0 ? 72 : 98;
    const g = this.voiceOut(this.buses.drum, n.pan);
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: base * 1.6 });
    o.frequency.setValueAtTime(base * (timp ? 1.15 : 1.6), t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.08);
    o.connect(g);
    const end = this.env(g.gain, t, 0.002, n.vel, timp ? 0.1 : 0.03, timp ? 0.35 : 0.14);
    o.start(t);
    o.stop(end);
    this.release(o, g);
    this.noiseHit(t, { type: 'lowpass', frequency: timp ? 300 : 500 }, 0.6 * n.vel, 0.05, this.buses.drum, n.pan);
  }

  private crash(n: MusicNote): void {
    if (this.style.orchestral) {
      // Timpani roll + a soft suspended cymbal.
      for (let i = 0; i < 6; i++) this.tom({ ...n, time: n.time + i * 0.045, midi: 0, vel: 0.35 + 0.08 * i });
      this.noiseHit(n.time, { type: 'highpass', frequency: 5000 }, 0.18 * n.vel, 0.5, this.buses.drum);
      return;
    }
    this.oneShot(this.hits.crash, n.time, 0.5 * n.vel, 0);
  }
}

/**
 * Percussion one-shots rendered once in plain JS (cheaper than filtering noise on every hit):
 * closed / open hi-hat (high-passed noise), sleigh bells (noise ring-modulated into three
 * bright metallic bands, three quick shakes) and a crash cymbal.
 */
function makeHits(ctx: BaseAudioContext, dark: boolean): Record<'hat' | 'hatOpen' | 'jingle' | 'crash', AudioBuffer> {
  const sr = ctx.sampleRate;
  const buf = (seconds: number, fill: (d: Float32Array) => void): AudioBuffer => {
    const b = new AudioBuffer({ length: Math.max(1, Math.floor(sr * seconds)), numberOfChannels: 1, sampleRate: sr });
    fill(b.getChannelData(0));
    return b;
  };
  /** High-passed noise (two one-pole stages) with an exponential decay. */
  const hp = (d: Float32Array, cut: number, tau: number, gain: number) => {
    const a = Math.exp((-2 * Math.PI * cut) / sr);
    let l1 = 0;
    let l2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x = Math.random() * 2 - 1;
      l1 = a * l1 + (1 - a) * x;
      const h1 = x - l1;
      l2 = a * l2 + (1 - a) * h1;
      d[i] = (h1 - l2) * gain * Math.exp(-i / sr / tau);
    }
  };
  const hatCut = dark ? 6000 : 7500;
  return {
    hat: buf(0.09, (d) => hp(d, hatCut, 0.014, 1.6)),
    hatOpen: buf(0.38, (d) => hp(d, hatCut, 0.06, 1.4)),
    crash: buf(2.6, (d) => hp(d, 4200, 0.45, 1.2)),
    jingle: buf(0.24, (d) => {
      const bands = [7800, 9400, 8600];
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += ((Math.random() * 2 - 1) - lp) * 0.35;
        let v = 0;
        for (let k = 0; k < 3; k++) {
          const on = t - k * 0.013;
          if (on >= 0) v += Math.sin(2 * Math.PI * (bands[k] as number) * t) * Math.exp(-on / 0.035);
        }
        d[i] = lp * v * 1.6;
      }
    }),
  };
}

/** tanh soft-clip curve (k = drive). */
function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = new AudioBuffer({ length: Math.floor(ctx.sampleRate * seconds), numberOfChannels: 1, sampleRate: ctx.sampleRate });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Stereo exponentially decaying noise, slightly darker at the tail: a smooth hall. */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const b = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.15 + 0.8 * x; // more smoothing (darker) toward the tail
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - x, 2.2) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
    }
  }
  return b;
}

/** Vinyl bed: soft hiss with random crackles (lo-fi style). */
function makeVinyl(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const b = new AudioBuffer({ length: sr * 3, numberOfChannels: 1, sampleRate: sr });
  const d = b.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    lp += ((Math.random() * 2 - 1) - lp) * 0.08;
    d[i] = lp * 0.12;
    if (Math.random() < 6 / sr) {
      const amp = 0.2 + Math.random() * 0.5;
      for (let j = 0; j < 40 && i + j < d.length; j++) d[i + j] = (d[i + j] ?? 0) + amp * Math.exp(-j / 6) * (j % 2 ? -1 : 1);
    }
  }
  return b;
}
