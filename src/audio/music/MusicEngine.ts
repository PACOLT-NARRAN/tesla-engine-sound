import type { DrivetrainEvent, DrivetrainState } from '../../types/drivetrain.ts';
import { clamp } from '../../utils/math.ts';
import { MusicBrain, type MusicLayers, type MusicNote } from './musicBrain.ts';
import { getMusicStyle, midiToHz, type MusicStyle } from './musicStyles.ts';

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
}

const ARP_WAVE: Record<string, OscillatorType> = { synthwave: 'sawtooth', techno: 'square', lofi: 'triangle', ambient: 'sine', epic: 'sawtooth' };

/**
 * DRIVE MUSIC: plays what MusicBrain composes, with small Web Audio synths (pads, bass, arp,
 * melody, bells, drums), an echo, a reverb and a master filter driven by the car.
 * Works with an AudioContext (driving) and an OfflineAudioContext (render tests).
 *
 * Graph: instrument buses -> master low-pass -> level -> destination (the output stage)
 *        arp/lead/bell -> echo;  pad/arp/lead/bell/snare -> reverb;  riser + vinyl beds.
 */
export class MusicEngine {
  readonly style: MusicStyle;
  readonly brain: MusicBrain;
  private readonly ctx: BaseAudioContext;
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly padFilter: BiquadFilterNode;
  private readonly buses: Record<'pad' | 'bass' | 'arp' | 'lead' | 'bell' | 'drum', GainNode>;
  private readonly reverbSend: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly riserGain: GainNode;
  private readonly riserFilter: BiquadFilterNode;
  private readonly noise: AudioBuffer;
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

    this.out = new GainNode(ctx, { gain: 0 });
    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3000, Q: 0.9 });
    this.filter.connect(this.out).connect(dest);

    const bus = (g: number) => new GainNode(ctx, { gain: g });
    this.buses = { pad: bus(0.18), bass: bus(0.34), arp: bus(0.11), lead: bus(0.12), bell: bus(0.1), drum: bus(0.62) };
    this.padFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800, Q: 0.5 });
    this.buses.pad.connect(this.padFilter).connect(this.filter);
    for (const k of ['bass', 'arp', 'lead', 'bell', 'drum'] as const) this.buses[k].connect(this.filter);

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
    for (const k of ['arp', 'lead', 'bell'] as const) this.buses[k].connect(this.reverbSend);

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
    b.setInputs({ speed: s.speed, accel: s.accel, turnRate, revPedal: s.revPedal, nitro }, dt);
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
    return { style: this.style.id, bpm: Math.round(b.bpm), layers: { ...b.layers }, notes: b.produced, cruise: b.cruise, push: b.push, brake: b.brake, turn: b.turn };
  }

  // --- Instruments ---------------------------------------------------------------

  private play(n: MusicNote): void {
    switch (n.inst) {
      case 'pad': return this.pad(n);
      case 'bass': return this.bass(n);
      case 'arp': return this.arp(n);
      case 'lead': return this.lead(n);
      case 'bell': return this.bell(n, this.buses.bell);
      case 'kick': return this.kick(n);
      case 'snare': return this.snare(n);
      case 'hat': return this.hat(n);
      case 'tom': return this.tom(n);
      case 'crash': return this.crash(n);
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

  /** Attack / hold / exponential release envelope. Returns the time the sound is gone. */
  private env(p: AudioParam, t: number, attack: number, peak: number, hold: number, release: number): number {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    p.setTargetAtTime(0, t + Math.max(attack, hold), release);
    return t + Math.max(attack, hold) + release * 6;
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
    const spec: Record<string, { w: OscillatorType; det: number[]; a: number; r: number; lvl: number }> = {
      saw: { w: 'sawtooth', det: [-9, 0, 9], a: 0.25, r: 0.5, lvl: 0.55 },
      warm: { w: 'triangle', det: [-6, 6, 1200], a: 1.1, r: 1.2, lvl: 0.9 },
      strings: { w: 'sawtooth', det: [-12, -4, 5, 13], a: 0.45, r: 0.7, lvl: 0.45 },
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

  private bass(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const kind = this.style.bass;
    const g = this.voiceOut(this.buses.bass, 0);
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
    } else {
      lp.frequency.setValueAtTime(1600 + 1400 * push, t);
      lp.frequency.setTargetAtTime(500, t, 0.08);
      end = this.env(g.gain, t, 0.005, 0.6 * n.vel, n.dur * 0.7, 0.06);
      this.osc('sawtooth', f, 0, lp, t, end);
      this.osc('square', f / 2, 0, lp, t, end);
    }
  }

  private arp(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const wave = ARP_WAVE[this.style.id] ?? 'sawtooth';
    if (wave === 'sine') return this.bell({ ...n, vel: n.vel * 0.8, dur: 0.9 }, this.buses.arp);
    const g = this.voiceOut(this.buses.arp, n.pan);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 4000, Q: 2 });
    lp.frequency.setValueAtTime(1500 + 4000 * n.vel, t);
    lp.frequency.setTargetAtTime(700, t, 0.08);
    lp.connect(g);
    const end = this.env(g.gain, t, 0.003, n.vel, 0.01, Math.max(0.05, n.dur * 0.5));
    this.osc(wave, f, 0, lp, t, end);
    if (wave === 'sawtooth') this.osc(wave, f, 8, lp, t, end);
  }

  private lead(n: MusicNote): void {
    const f = midiToHz(n.midi);
    const t = n.time;
    const kind = this.style.lead;
    if (kind === 'bell') return this.bell({ ...n, dur: Math.max(n.dur, 1) }, this.buses.lead);
    const g = this.voiceOut(this.buses.lead, n.pan);
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 3000, Q: 1 });
    lp.connect(g);
    const vib = new OscillatorNode(this.ctx, { frequency: 5.2 });
    const vibAmt = new GainNode(this.ctx, { gain: 0 });
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(kind === 'flute' ? 9 : 14, t + 0.35);
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
    const g = this.voiceOut(this.buses.drum, 0);
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: 150 });
    o.frequency.setValueAtTime(this.style.id === 'techno' ? 170 : 140, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    o.connect(g);
    const end = this.env(g.gain, t, 0.002, n.vel, 0.04, 0.09);
    o.start(t);
    o.stop(end);
    this.release(o, g);
    this.noiseHit(t, { type: 'highpass', frequency: 2500 }, 0.15 * n.vel, 0.004, this.buses.drum);
  }

  private snare(n: MusicNote): void {
    const t = n.time;
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

  private hat(n: MusicNote): void {
    const open = n.midi === 1;
    this.noiseHit(n.time, { type: 'highpass', frequency: this.style.vinyl ? 6000 : 7500 }, n.vel * 0.7, open ? 0.06 : 0.014, this.buses.drum, n.pan);
  }

  private tom(n: MusicNote): void {
    const t = n.time;
    const base = n.midi === 0 ? 72 : 98;
    const g = this.voiceOut(this.buses.drum, n.pan);
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: base * 1.6 });
    o.frequency.setValueAtTime(base * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.08);
    o.connect(g);
    const end = this.env(g.gain, t, 0.002, n.vel, 0.03, 0.14);
    o.start(t);
    o.stop(end);
    this.release(o, g);
    this.noiseHit(t, { type: 'lowpass', frequency: 500 }, 0.6 * n.vel, 0.05, this.buses.drum, n.pan);
  }

  private crash(n: MusicNote): void {
    this.noiseHit(n.time, { type: 'highpass', frequency: 4200 }, 0.45 * n.vel, 0.45, this.buses.drum, -0.2);
    this.noiseHit(n.time, { type: 'bandpass', frequency: 6500, Q: 3 }, 0.3 * n.vel, 0.6, this.buses.drum, 0.2);
  }
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
