/**
 * Output stage: volume → bass boost → treble → drive → stereo width → glue compressor → limiter
 * → soft clipper → speakers.
 *
 * The engine has to stay audible next to music in the car, so the stage drives the signal into a
 * compressor and a fast limiter: the result is much louder (higher average level) without the
 * peaks clipping. VOLUME BOOST adds even more drive and a harder soft clip (denser, louder sound).
 * The soft clipper is the last node, so the output never exceeds full scale.
 * Bass boost is a low shelf plus a sub-bass peak, applied before the limiter.
 *
 * Stereo width: the engine recordings are mono. A delayed, high-passed copy is added to the left
 * channel and subtracted from the right one (mid/side). Left + right still sum to the plain mono
 * signal, so nothing cancels out, and everything below widthHpfHz stays mono for the subwoofer.
 */
export interface OutputSettings {
  /** Volume slider 0..1. */
  volume: number;
  /** Extra loudness switch. */
  boost: boolean;
  /** Bass boost slider 0..1. */
  bass: number;
  /** Treble (brightness) slider 0..1. */
  treble?: number;
  /** Stereo width slider 0..1. */
  width?: number;
}

export const OUTPUT_TUNING = {
  /** Drive into the compressor at normal volume (×2.5 ≈ +8 dB). */
  baseDrive: 2.5,
  /** Extra drive with VOLUME BOOST on (×2 ≈ +6 dB). */
  boostDrive: 2,
  /** Low shelf: corner frequency and gain at full bass boost. */
  shelfHz: 110,
  shelfMaxDb: 12,
  /** Sub-bass peak (exhaust boom). */
  subHz: 55,
  subMaxDb: 6,
  /** High shelf for treble (the engine's own tone filter also opens up, see EngineAudioEngine). */
  trebleHz: 3500,
  trebleMaxDb: 6,
  /** Stereo width: side signal delay, its high-pass (bass stays mono) and level at full width. */
  widthDelayS: 0.013,
  widthHpfHz: 280,
  widthMax: 0.6,
  /** Glue compressor: evens out the level so quiet parts are heard too. */
  glue: { threshold: -20, knee: 12, ratio: 3.5, attack: 0.008, release: 0.25 },
  /** Fast limiter: keeps the louder signal from clipping. */
  limiter: { threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.12 },
  /** Soft clipper drive (tanh): normal / VOLUME BOOST. */
  clip: { normal: 1.2, boost: 2.2 },
} as const;

/**
 * tanh soft-clip curve; ±1 in gives ±CLIP_CEILING out (headroom for the oversampling filter's
 * overshoot), inputs beyond ±1 are held there.
 */
export const CLIP_CEILING = 0.94;

export function softClipCurve(k: number, size = 2049): Float32Array<ArrayBuffer> {
  const c = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    c[i] = (CLIP_CEILING * Math.tanh(k * x)) / norm;
  }
  return c;
}

export interface OutputGains {
  master: number;
  drive: number;
  shelfDb: number;
  subDb: number;
  trebleDb: number;
  side: number;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function outputGains(s: OutputSettings): OutputGains {
  const bass = clamp01(s.bass);
  return {
    master: clamp01(s.volume),
    drive: OUTPUT_TUNING.baseDrive * (s.boost ? OUTPUT_TUNING.boostDrive : 1),
    shelfDb: bass * OUTPUT_TUNING.shelfMaxDb,
    subDb: bass * OUTPUT_TUNING.subMaxDb,
    trebleDb: clamp01(s.treble ?? 0) * OUTPUT_TUNING.trebleMaxDb,
    side: clamp01(s.width ?? 0) * OUTPUT_TUNING.widthMax,
  };
}

/** Web Audio nodes of the output stage. `input` replaces the old master gain. */
export class OutputStage {
  readonly input: GainNode;
  private readonly shelf: BiquadFilterNode;
  private readonly sub: BiquadFilterNode;
  private readonly drive: GainNode;
  private readonly treble: BiquadFilterNode;
  private readonly sideL: GainNode;
  private readonly sideR: GainNode;
  private readonly clipper: WaveShaperNode;
  private readonly ctx: BaseAudioContext;
  private boost: boolean;

  constructor(ctx: BaseAudioContext, destination: AudioNode, s: OutputSettings) {
    this.ctx = ctx;
    this.boost = s.boost;
    const g = outputGains(s);
    const t = OUTPUT_TUNING;
    this.input = new GainNode(ctx, { gain: g.master });
    this.shelf = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: t.shelfHz, gain: g.shelfDb });
    this.sub = new BiquadFilterNode(ctx, { type: 'peaking', frequency: t.subHz, Q: 1.1, gain: g.subDb });
    this.drive = new GainNode(ctx, { gain: g.drive });
    this.treble = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: t.trebleHz, gain: g.trebleDb });
    // Mid/side widening: mid = mono, side = delayed + high-passed copy; L = mid + side, R = mid − side.
    const mono = { channelCount: 1, channelCountMode: 'explicit' as const, channelInterpretation: 'speakers' as const };
    const mid = new GainNode(ctx, { gain: 1, ...mono });
    const sideDelay = new DelayNode(ctx, { delayTime: t.widthDelayS, maxDelayTime: 0.05, ...mono });
    const sideHpf = new BiquadFilterNode(ctx, { type: 'highpass', frequency: t.widthHpfHz, Q: 0.7, ...mono });
    this.sideL = new GainNode(ctx, { gain: g.side, ...mono });
    this.sideR = new GainNode(ctx, { gain: -g.side, ...mono });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    const glue = new DynamicsCompressorNode(ctx, { ...t.glue });
    const limiter = new DynamicsCompressorNode(ctx, { ...t.limiter });
    this.clipper = new WaveShaperNode(ctx, { curve: softClipCurve(s.boost ? t.clip.boost : t.clip.normal), oversample: '2x' });
    this.input.connect(this.shelf).connect(this.sub).connect(this.treble).connect(this.drive).connect(mid);
    this.drive.connect(sideDelay).connect(sideHpf);
    sideHpf.connect(this.sideL);
    sideHpf.connect(this.sideR);
    mid.connect(merger, 0, 0);
    mid.connect(merger, 0, 1);
    this.sideL.connect(merger, 0, 0);
    this.sideR.connect(merger, 0, 1);
    merger.connect(glue).connect(limiter).connect(this.clipper).connect(destination);
  }

  apply(s: OutputSettings): void {
    const g = outputGains(s);
    const now = this.ctx.currentTime;
    this.input.gain.setTargetAtTime(g.master, now, 0.05);
    this.drive.gain.setTargetAtTime(g.drive, now, 0.08);
    this.shelf.gain.setTargetAtTime(g.shelfDb, now, 0.08);
    this.sub.gain.setTargetAtTime(g.subDb, now, 0.08);
    this.treble.gain.setTargetAtTime(g.trebleDb, now, 0.08);
    this.sideL.gain.setTargetAtTime(g.side, now, 0.08);
    this.sideR.gain.setTargetAtTime(-g.side, now, 0.08);
    if (s.boost !== this.boost) {
      this.boost = s.boost;
      this.clipper.curve = softClipCurve(s.boost ? OUTPUT_TUNING.clip.boost : OUTPUT_TUNING.clip.normal);
    }
  }
}
