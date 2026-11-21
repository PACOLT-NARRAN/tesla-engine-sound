import type { DrivetrainEvent, DrivetrainState } from '../types/drivetrain.ts';
import type { DriveProfileConfig } from '../drivetrain/driveProfiles.ts';
import type { EngineProfile } from '../types/profile.ts';
import { clamp } from '../utils/math.ts';
import { bandPlaybackRate, bandWeights, engineLevel, loadGains, soundRpm, toneCutoffHz } from './layerMix.ts';
import type { LoopSample, SoundBank } from './types.ts';
import { OutputStage } from './outputStage.ts';

/** Time constants (seconds) for setTargetAtTime: short enough to feel instant, long enough to never click. */
const TC_RATE = 0.025;
const TC_GAIN = 0.03;
const TC_TONE = 0.06;

interface Layer {
  rpm: number;
  onSrc: AudioBufferSourceNode;
  offSrc: AudioBufferSourceNode;
  onGain: GainNode;
  offGain: GainNode;
  lastWeight: number;
  lastRate: number;
}

interface Voice {
  bank: SoundBank;
  layers: Layer[];
  bandRpms: number[];
  onBus: GainNode;
  offBus: GainNode;
  fade: GainNode;
}

export interface AudioDebugInfo {
  contextState: AudioContextState | 'none';
  sampleRate: number;
  baseLatencyMs: number;
  masterGain: number;
  bankKind: SoundBank['kind'] | 'none';
  layers: Array<{ rpm: number; weight: number; rate: number; on: number; off: number }>;
}

/**
 * Web Audio engine: RPM-banded loop layers with equal-power crossfades, an on-load/off-load
 * split, load-dependent tone, ignition-cut on upshifts, limiter flutter and overrun crackle.
 * Every parameter change is ramped (setTargetAtTime), so nothing clicks.
 *
 * Graph:  band loops -> layer gains -> on/off buses -> voice fade -> tone LPF
 *         -> shift duck -> limiter -> engine level -> output stage (volume, bass boost, drive,
 *            compressor, limiter, soft clip; see outputStage.ts) -> out
 */
/** NITRO purge hiss levels (before the output stage). */
const NITRO_BURST = 0.5;
const NITRO_LEVEL = 0.32;

export class EngineAudioEngine {
  private ctx: AudioContext | null = null;
  private tone!: BiquadFilterNode;
  private duck!: GainNode;
  private limiterGain!: GainNode;
  private level!: GainNode;
  private master!: GainNode;
  private popBus!: GainNode;
  private voice: Voice | null = null;
  private profile: EngineProfile | null = null;
  private volume = 0.8;
  private volumeBoost = false;
  private bassBoost = 0;
  private treble = 0;
  private width = 0;
  private output: OutputStage | null = null;
  private readonly weights: number[] = [];
  private limiterToggle = 0;
  private lastPopAt = 0;
  private lastHighLoadAt = -10;
  private lastBlowoffAt = -10;
  private lastLevel = 0;
  private turboGain!: GainNode;
  private turboOsc!: OscillatorNode;
  private turboOsc2!: OscillatorNode;
  private turboNoise!: BiquadFilterNode;
  private boost = 0;
  private nitroGain!: GainNode;
  private scGain!: GainNode;
  private scOsc!: OscillatorNode;
  private scFilter!: BiquadFilterNode;
  private scOn = false;
  private lastUpdateAt = 0;
  private stateListener: ((s: AudioContextState) => void) | null = null;
  /** Drive Profile: multiplier on parameter smoothing, and off-throttle (engine braking) level. */
  private smoothing = 1;
  private offLevel = 1;

  /** Drive Profile sound behaviour: transition smoothing and engine-braking loudness. */
  setDriveTuning(d: Pick<DriveProfileConfig, 'audioTransitionSmoothing' | 'engineBraking'>): void {
    this.smoothing = clamp(d.audioTransitionSmoothing, 0.5, 2.5);
    // SPORT (0.65) = 1.0, the level used before Drive Profiles existed.
    this.offLevel = 0.53 + 0.72 * clamp(d.engineBraking, 0, 1);
  }

  /** Updated tuning of the engine that is already playing (same id), without restarting it. */
  setProfile(p: EngineProfile): void {
    if (this.profile && this.profile.id === p.id) this.profile = p;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get running(): boolean {
    return this.voice !== null;
  }

  onStateChange(cb: (s: AudioContextState) => void): void {
    this.stateListener = cb;
  }

  /**
   * Must be called synchronously inside a user gesture (START ENGINE tap): creates or
   * resumes the AudioContext so autoplay policies allow sound.
   */
  unlock(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.buildGraph(ctx);
      ctx.addEventListener('statechange', () => this.stateListener?.(ctx.state));
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.output?.apply(this.outputSettings());
  }

  /** VOLUME BOOST switch and the bass / treble / stereo width sliders (0..1). */
  setSoundBoost(o: { volumeBoost?: boolean; bassBoost?: number; treble?: number; width?: number }): void {
    if (o.volumeBoost !== undefined) this.volumeBoost = o.volumeBoost;
    if (o.bassBoost !== undefined) this.bassBoost = clamp(o.bassBoost, 0, 1);
    if (o.treble !== undefined) this.treble = clamp(o.treble, 0, 1);
    if (o.width !== undefined) this.width = clamp(o.width, 0, 1);
    this.output?.apply(this.outputSettings());
  }

  private outputSettings() {
    return { volume: this.volume, boost: this.volumeBoost, bass: this.bassBoost, treble: this.treble, width: this.width };
  }

  /** Start (or hot-swap to) the given bank. Swaps crossfade over ~0.35 s. */
  start(bank: SoundBank, profile: EngineProfile, opts: { ignition?: boolean } = {}): void {
    const ctx = this.ctx;
    if (!ctx) throw new Error('AudioContext not unlocked');
    this.profile = profile;
    const old = this.voice;
    const voice = this.createVoice(ctx, bank);
    const now = ctx.currentTime;
    voice.fade.gain.setValueAtTime(0, now);
    if (opts.ignition && bank.startup) {
      // Play the recorded start-up; bring the running engine in as the start-up settles.
      this.playOneShot(bank.startup, 0.6);
      voice.fade.gain.setTargetAtTime(1, now + bank.startup.duration * 0.45, 0.15);
    } else {
      voice.fade.gain.setTargetAtTime(1, now, old ? 0.12 : 0.05);
    }
    if (old) this.retireVoice(old, 0.12);
    this.voice = voice;
    this.master.gain.setTargetAtTime(this.volume, now, 0.05);
  }

  /** Play the bank's recorded shut-down (if any) as the ignition is switched off. */
  playShutdown(): void {
    const b = this.voice?.bank.shutdown;
    if (b) this.playOneShot(b, 0.6);
  }

  /** NITRO button held / released: the gas purge hiss bursts in and tails off. */
  setNitro(on: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.nitroGain.gain.cancelScheduledValues(now);
    if (on) {
      // A sharp burst, then a steady hiss.
      this.nitroGain.gain.setTargetAtTime(NITRO_BURST, now, 0.012);
      this.nitroGain.gain.setTargetAtTime(NITRO_LEVEL, now + 0.12, 0.15);
    } else {
      this.nitroGain.gain.setTargetAtTime(0, now, 0.16);
    }
  }

  stop(): void {
    if (this.ctx) this.nitroGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (!this.ctx || !this.voice) return;
    this.boost = 0;
    this.turboGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.scGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.scOn = false;
    this.retireVoice(this.voice, 0.12);
    this.voice = null;
  }

  /** Called ~50x per second from the simulation loop. */
  update(s: DrivetrainState, events: readonly DrivetrainEvent[]): void {
    const ctx = this.ctx;
    const v = this.voice;
    const p = this.profile;
    if (!ctx || !v || !p) return;
    const now = ctx.currentTime;
    const k = this.smoothing;

    // RPM bands: crossfade + pitch (in the bank's own RPM scale).
    const bankRpm = soundRpm(s.rpm, p);
    bandWeights(bankRpm, v.bandRpms, this.weights);
    for (let i = 0; i < v.layers.length; i++) {
      const layer = v.layers[i] as Layer;
      const w = this.weights[i] ?? 0;
      if (Math.abs(w - layer.lastWeight) > 0.002 || (w === 0 && layer.lastWeight !== 0)) {
        layer.onGain.gain.setTargetAtTime(w, now, TC_GAIN * k);
        layer.offGain.gain.setTargetAtTime(w, now, TC_GAIN * k);
        layer.lastWeight = w;
      }
      // Only retune audible layers (and those about to become audible).
      if (w > 0 || layer.lastRate === 0) {
        const rate = bandPlaybackRate(bankRpm, layer.rpm, p.audio.pitch);
        if (Math.abs(rate - layer.lastRate) > 0.0005) {
          layer.onSrc.playbackRate.setTargetAtTime(rate, now, TC_RATE * k);
          layer.offSrc.playbackRate.setTargetAtTime(rate, now, TC_RATE * k);
          layer.lastRate = rate;
        }
      }
    }

    // Load: on-throttle vs. overrun layers, tone, level.
    const lg = loadGains(s.load, s.overrun);
    v.onBus.gain.setTargetAtTime(lg.on, now, TC_GAIN * 1.5 * k);
    v.offBus.gain.setTargetAtTime(lg.off * this.offLevel * clamp(p.audio.offLoad ?? 1, 0, 2), now, TC_GAIN * 1.5 * k);
    // Treble opens the load-dependent tone filter up to twice as far (capped below 16 kHz, the
    // upper limit of the 32 kHz source recordings).
    const cutoff = Math.min(15500, toneCutoffHz(s.rpm, p.idleRPM, p.redlineRPM, s.load, s.overrun) * (1 + this.treble));
    this.tone.frequency.setTargetAtTime(cutoff, now, TC_TONE * k);
    const level = s.running ? engineLevel(s.rpm, p.idleRPM, p.redlineRPM, s.load, s.overrun) * p.audio.volume : 0;
    if (Math.abs(level - this.lastLevel) > 0.003) {
      this.level.gain.setTargetAtTime(level, now, s.running ? 0.08 : 0.35);
      this.lastLevel = level;
    }

    this.updateTurbo(s, p, now);
    this.updateSupercharger(s, p, now);

    // Rev limiter: fuel cut flutter.
    if (s.limiter) {
      this.limiterToggle = (this.limiterToggle + 1) % 3;
      this.limiterGain.gain.setTargetAtTime(this.limiterToggle === 0 ? 0.3 : 1, now, 0.008);
    } else if (this.limiterToggle !== -1) {
      this.limiterGain.gain.setTargetAtTime(1, now, 0.02);
      this.limiterToggle = -1;
    }

    if (s.load > 0.6 && !s.overrun) this.lastHighLoadAt = now;
    for (const e of events) {
      if (e.type === 'shift') this.onShift(e.direction, e.throttle, p);
      if (e.type === 'overrun-start') this.maybeBlowoff(e.rpm, p);
    }

    // Overrun crackle: random pops while lifting off from high RPM.
    if (s.overrun && p.audio.overrunPops > 0 && v.bank.pops.length > 0) {
      const rpmNorm = (s.rpm - p.idleRPM) / (p.redlineRPM - p.idleRPM);
      const chance = p.audio.overrunPops * clamp((rpmNorm - 0.3) * 1.6, 0, 1) * 0.22;
      if (now - this.lastPopAt > 0.045 && Math.random() < chance) this.firePop(0.25 + Math.random() * 0.5);
    }
  }

  debugInfo(): AudioDebugInfo {
    const ctx = this.ctx;
    const v = this.voice;
    return {
      contextState: ctx ? ctx.state : 'none',
      sampleRate: ctx?.sampleRate ?? 0,
      baseLatencyMs: ctx ? (ctx.baseLatency ?? 0) * 1000 : 0,
      masterGain: ctx ? this.master.gain.value * this.level.gain.value : 0,
      bankKind: v?.bank.kind ?? 'none',
      layers: v
        ? v.layers
            .map((l) => ({ rpm: Math.round(l.rpm), weight: l.lastWeight, rate: l.lastRate, on: v.onBus.gain.value * l.lastWeight, off: v.offBus.gain.value * l.lastWeight }))
            .filter((l) => l.weight > 0.01)
        : [],
    };
  }

  async close(): Promise<void> {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }

  // ---------------------------------------------------------------------------

  private buildGraph(ctx: AudioContext): void {
    this.tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4000, Q: 0.7 });
    this.duck = new GainNode(ctx, { gain: 1 });
    this.limiterGain = new GainNode(ctx, { gain: 1 });
    this.level = new GainNode(ctx, { gain: 0 });
    this.output = new OutputStage(ctx, ctx.destination, this.outputSettings());
    this.master = this.output.input;
    this.popBus = new GainNode(ctx, { gain: 0.9 });
    this.tone.connect(this.duck).connect(this.limiterGain).connect(this.level).connect(this.master);
    this.popBus.connect(this.master);

    // Turbo whistle (synthesised, like the game does): two tones + a narrow band of air noise.
    this.turboGain = new GainNode(ctx, { gain: 0 });
    this.turboOsc = new OscillatorNode(ctx, { type: 'sine', frequency: 2000 });
    this.turboOsc2 = new OscillatorNode(ctx, { type: 'sine', frequency: 3000 });
    const osc2Gain = new GainNode(ctx, { gain: 0.25 });
    const noiseBuf = new AudioBuffer({ length: ctx.sampleRate * 2, numberOfChannels: 1, sampleRate: ctx.sampleRate });
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuf, loop: true });
    this.turboNoise = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2000, Q: 6 });
    const noiseGain = new GainNode(ctx, { gain: 0.9 });
    this.turboOsc.connect(this.turboGain);
    this.turboOsc2.connect(osc2Gain).connect(this.turboGain);
    noise.connect(this.turboNoise).connect(noiseGain).connect(this.turboGain);
    this.turboGain.connect(this.master);
    this.turboOsc.start();
    this.turboOsc2.start();
    noise.start();

    // NITRO purge: a loud, airy hiss of escaping gas (high-passed noise with a bright peak and a
    // fast flutter), plus a low whoosh. Silent until the NITRO button is held.
    this.nitroGain = new GainNode(ctx, { gain: 0 });
    const purge = new AudioBufferSourceNode(ctx, { buffer: noiseBuf, loop: true, loopStart: 0.37, loopEnd: 1.93 });
    const purgeHp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1100, Q: 0.5 });
    const purgePeak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 5200, Q: 0.9, gain: 7 });
    const purgeLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 12500, Q: 0.5 });
    const whoosh = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 420, Q: 1.2 });
    const whooshGain = new GainNode(ctx, { gain: 0.5 });
    const flutter = new OscillatorNode(ctx, { type: 'sine', frequency: 17 });
    const flutterDepth = new GainNode(ctx, { gain: 0.18 });
    // Flutter modulates a unity gain AFTER the noise and BEFORE the on/off gain, so silence stays silent.
    const flutterAmp = new GainNode(ctx, { gain: 1 });
    purge.connect(purgeHp).connect(purgePeak).connect(purgeLp).connect(flutterAmp);
    purge.connect(whoosh).connect(whooshGain).connect(flutterAmp);
    flutter.connect(flutterDepth).connect(flutterAmp.gain);
    flutterAmp.connect(this.nitroGain).connect(this.master);
    purge.start();
    flutter.start();

    // Supercharger whine (Sound Studio engines): a belt-driven tone locked to engine RPM.
    this.scGain = new GainNode(ctx, { gain: 0 });
    this.scOsc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 800 });
    this.scFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800, Q: 4 });
    this.scOsc.connect(this.scFilter).connect(this.scGain).connect(this.master);
    this.scOsc.start();
  }

  private createVoice(ctx: AudioContext, bank: SoundBank): Voice {
    const fade = new GainNode(ctx, { gain: 0 });
    const onBus = new GainNode(ctx, { gain: 0.6 });
    const offBus = new GainNode(ctx, { gain: 0.4 });
    onBus.connect(fade);
    offBus.connect(fade);
    fade.connect(this.tone);
    const start = ctx.currentTime + 0.02;
    const mk = (l: LoopSample, bus: GainNode): [AudioBufferSourceNode, GainNode] => {
      const src = new AudioBufferSourceNode(ctx, { buffer: l.buffer, loop: true, loopStart: l.loopStart, loopEnd: l.loopEnd });
      const g = new GainNode(ctx, { gain: 0 });
      src.connect(g).connect(bus);
      // Random start offsets decorrelate layers so the crossfade never phases.
      const span = Math.max(0.001, l.loopEnd - l.loopStart);
      src.start(start, l.loopStart + Math.random() * span);
      return [src, g];
    };
    const layers: Layer[] = bank.bands.map((b) => {
      const [onSrc, onGain] = mk(b.on, onBus);
      const [offSrc, offGain] = mk(b.off, offBus);
      return { rpm: b.rpm, onSrc, offSrc, onGain, offGain, lastWeight: 0, lastRate: 0 };
    });
    return { bank, layers, bandRpms: bank.bands.map((b) => b.rpm), onBus, offBus, fade };
  }

  private retireVoice(v: Voice, tc: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    v.fade.gain.cancelScheduledValues(now);
    v.fade.gain.setTargetAtTime(0, now, tc);
    const stopAt = now + tc * 8;
    for (const l of v.layers) {
      l.onSrc.stop(stopAt);
      l.offSrc.stop(stopAt);
    }
    setTimeout(() => v.fade.disconnect(), (tc * 8 + 0.2) * 1000);
  }

  /** Turbo whistle: plays continuously above a threshold RPM and rises in pitch and level with RPM. */
  private updateTurbo(s: DrivetrainState, p: EngineProfile, now: number): void {
    const amount = turboAmount(p);
    const dt = clamp(now - this.lastUpdateAt, 0, 0.25);
    this.lastUpdateAt = now;
    if (amount <= 0) {
      if (this.boost !== 0) this.turboGain.gain.setTargetAtTime(0, now, 0.05);
      this.boost = 0;
      return;
    }
    const rpmNorm = clamp((s.rpm - p.idleRPM) / (p.redlineRPM - p.idleRPM), 0, 1);
    // Continuous whistle from ~25 % of the RPM range, full from ~65 %; a bit quieter off-throttle.
    const target = s.running ? clamp((rpmNorm - 0.25) / 0.4, 0, 1) * (s.overrun ? 0.6 : 1) : 0;
    const tau = target > this.boost ? 0.35 : 0.3;
    this.boost += (target - this.boost) * (1 - Math.exp(-dt / tau));
    const b = this.boost;
    const f = 2200 + 3800 * rpmNorm;
    this.turboOsc.frequency.setTargetAtTime(f, now, 0.05);
    this.turboOsc2.frequency.setTargetAtTime(f * 1.51, now, 0.05);
    this.turboNoise.frequency.setTargetAtTime(f, now, 0.05);
    this.turboGain.gain.setTargetAtTime(amount * 0.07 * b * this.volume, now, 0.05);
  }

  /** Supercharger whine: pitch follows RPM directly (no spool lag), louder under load. */
  private updateSupercharger(s: DrivetrainState, p: EngineProfile, now: number): void {
    const amount = clamp(p.audio.supercharger ?? 0, 0, 1);
    if (amount <= 0 || !s.running) {
      if (this.scOn) this.scGain.gain.setTargetAtTime(0, now, 0.06);
      this.scOn = false;
      return;
    }
    this.scOn = true;
    const f = superchargerHz(s.rpm);
    this.scOsc.frequency.setTargetAtTime(f, now, 0.03);
    this.scFilter.frequency.setTargetAtTime(f, now, 0.03);
    const loadK = s.overrun ? 0.25 : 0.35 + 0.65 * clamp(s.load, 0, 1);
    this.scGain.gain.setTargetAtTime(amount * 0.045 * loadK * this.volume, now, 0.06);
  }

  private onShift(direction: 'up' | 'down', throttle: number, p: EngineProfile): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (direction === 'up') {
      // Ignition cut: quick dip, recover as the next gear engages.
      const depth = 0.75 - 0.4 * throttle;
      const dur = p.gearbox.shiftDuration * (1.1 - 0.5 * throttle);
      g.setTargetAtTime(depth, now, 0.012);
      g.setTargetAtTime(1, now + dur * 0.75, 0.04);
    } else {
      // Rev-match blip: slight swell.
      g.setTargetAtTime(1.12, now, 0.02);
      g.setTargetAtTime(1, now + 0.12, 0.06);
    }
    // Exhaust crack on downshifts only (rev-match blip); upshifts stay clean.
    if (direction === 'down' && p.audio.shiftBark > 0) this.firePop(p.audio.shiftBark * (0.6 + 0.4 * clamp(throttle, 0, 1)));
  }

  /** Dump-valve blow-off when the driver lifts right after a high-load pull. */
  private maybeBlowoff(rpm: number, p: EngineProfile): void {
    const ctx = this.ctx;
    const v = this.voice;
    const level = p.audio.blowoff ?? 0.7;
    if (!ctx || !v || v.bank.blowoff.length === 0 || level <= 0) return;
    const now = ctx.currentTime;
    const rpmNorm = (rpm - p.idleRPM) / (p.redlineRPM - p.idleRPM);
    if (now - this.lastHighLoadAt > 1.0 || rpmNorm < 0.3 || now - this.lastBlowoffAt < 1.5) return;
    this.lastBlowoffAt = now;
    const buf = v.bank.blowoff[Math.floor(Math.random() * v.bank.blowoff.length)] as AudioBuffer;
    this.playOneShot(buf, level * (0.6 + 0.4 * clamp(rpmNorm, 0, 1)));
  }

  private playOneShot(buf: AudioBuffer, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    const g = new GainNode(ctx, { gain: clamp(gain, 0, 1) });
    src.connect(g).connect(this.popBus);
    src.onended = () => g.disconnect();
    src.start(ctx.currentTime + 0.01);
  }

  private firePop(gain: number): void {
    const ctx = this.ctx;
    const v = this.voice;
    if (!ctx || !v || v.bank.pops.length === 0) return;
    const now = ctx.currentTime;
    this.lastPopAt = now;
    const buf = v.bank.pops[Math.floor(Math.random() * v.bank.pops.length)] as AudioBuffer;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: 0.8 + Math.random() * 0.5 });
    const g = new GainNode(ctx, { gain: clamp(gain, 0, 1) });
    src.connect(g).connect(this.popBus);
    src.onended = () => g.disconnect();
    src.start(now + Math.random() * 0.02);
  }
}

/** Turbo whistle level for a profile: explicit setting, else on for turbocharged engines. */
export function turboAmount(p: EngineProfile): number {
  if (typeof p.audio.turbo === 'number') return clamp(p.audio.turbo, 0, 1);
  return ['turbo', 'twin-turbo', 'twin-charged'].includes(p.aspiration) ? 0.5 : 0;
}

/** Supercharger whine frequency: belt-driven, so it rises in proportion to engine RPM. */
export function superchargerHz(rpm: number): number {
  return 400 + Math.max(0, rpm) * 0.55;
}
