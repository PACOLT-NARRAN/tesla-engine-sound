import { fromDb, type DecodedAudio } from './recording.ts';

/**
 * Browser side of the recording prototype: decodes with Web Audio and plays the result.
 * It owns a separate AudioContext that is closed when the screen closes, so the engine's
 * audio graph is never touched.
 */
export class RecordingAudio {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private duration = 0;
  private looping = false;

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio not available');
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  /** Decoder for LocalRecordingProcessor. The browser decides which codecs work. */
  readonly decode = async (bytes: ArrayBuffer): Promise<{ audio: DecodedAudio; handle: AudioBuffer }> => {
    const buffer = await this.context().decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    return { audio: { sampleRate: buffer.sampleRate, channels }, handle: buffer };
  };

  get playing(): boolean {
    return this.source !== null;
  }

  /** Plays from `offsetS`; `gainDb` is the optional preview normalisation. */
  async play(buffer: AudioBuffer, opts: { offsetS?: number; loop?: boolean; gainDb?: number; onEnded?: () => void } = {}): Promise<void> {
    this.stop();
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts.loop ?? false;
    const gain = ctx.createGain();
    gain.gain.value = fromDb(opts.gainDb ?? 0);
    src.connect(gain).connect(ctx.destination);
    const offset = Math.max(0, Math.min(buffer.duration - 0.01, opts.offsetS ?? 0));
    src.onended = () => {
      if (this.source !== src) return;
      this.cleanup();
      opts.onEnded?.();
    };
    src.start(0, offset);
    this.source = src;
    this.gain = gain;
    this.startedAt = ctx.currentTime;
    this.offset = offset;
    this.duration = buffer.duration;
    this.looping = src.loop;
  }

  setGainDb(db: number): void {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(fromDb(db), this.ctx.currentTime, 0.02);
  }

  setLoop(on: boolean): void {
    if (this.source) this.source.loop = on;
    this.looping = on;
  }

  /** Current playback position in seconds, or null when stopped. */
  position(): number | null {
    if (!this.source || !this.ctx || this.duration <= 0) return null;
    const p = this.offset + (this.ctx.currentTime - this.startedAt);
    return this.looping ? p % this.duration : Math.min(p, this.duration);
  }

  stop(): void {
    const src = this.source;
    this.cleanup();
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
  }

  private cleanup(): void {
    this.source = null;
    this.gain?.disconnect();
    this.gain = null;
  }

  /** Stops playback and releases the AudioContext (and with it the decoded audio). */
  dispose(): void {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close().catch(() => undefined);
  }
}
