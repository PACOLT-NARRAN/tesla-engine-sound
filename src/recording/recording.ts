/**
 * "Upload your engine recording" — LEVEL 1 local prototype (spec section H).
 *
 * Pure module (no React, no Web Audio, no registry), unit tested in Node. The browser side
 * (decoding with Web Audio, playback) lives in `browserAudio.ts`; this file only validates,
 * measures and describes. Everything happens in this browser: nothing is uploaded, nothing is
 * stored, and no "AI" or RPM detection is claimed — only plain signal measurements.
 */

/** Files bigger than this are refused before reading (decoded audio needs ~10× the memory). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Decoded length limits, seconds. */
export const MIN_DURATION_S = 2;
export const MAX_DURATION_S = 180;

/** Extensions the prototype accepts. Whether the codec really decodes is decided by the browser. */
export const SUPPORTED_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm'] as const;
/** Value for `<input type="file" accept>`. */
export const ACCEPT_ATTR = ['audio/*', ...SUPPORTED_EXTENSIONS.map((e) => `.${e}`)].join(',');

/** A sample at or above this absolute level counts as full scale. */
export const CLIP_LEVEL = 0.999;
/** This many consecutive full-scale samples count as one clipped run (a single 0 dBFS peak is fine). */
export const CLIP_RUN = 3;
/** Analysis frame for silence detection, seconds. */
export const FRAME_S = 0.05;
/** A frame quieter than this (RMS) is silence. */
export const SILENCE_DB = -50;
/** Target of the "normalise preview" option. */
export const NORMALIZE_TARGET_DB = -1;
/** Normalisation never boosts more than this. */
export const MAX_GAIN_DB = 24;

/** The bits of a `File` the validator needs (tests pass plain objects). */
export interface FileInfo {
  name: string;
  size: number;
  /** MIME type as reported by the browser; may be empty. */
  type: string;
}

export type FileIssue = 'empty' | 'tooLarge' | 'unsupportedType';

/** Lower-case extension without the dot, or ''. */
export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? (m[1] as string).toLowerCase() : '';
}

/**
 * Checks a picked file before it is read. An audio MIME type or a known extension is accepted;
 * a video container is refused unless its extension is one of ours (.webm audio is common).
 */
export function validateFile(f: FileInfo): FileIssue | null {
  if (!Number.isFinite(f.size) || f.size <= 0) return 'empty';
  if (f.size > MAX_FILE_BYTES) return 'tooLarge';
  const ext = fileExtension(f.name);
  const knownExt = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
  const type = f.type.toLowerCase();
  if (knownExt) return null;
  if (type.startsWith('audio/') && ext === '') return null;
  if (type.startsWith('audio/') && !/^(txt|json|pdf|zip|exe|png|jpe?g|gif|mp4|mov|avi|mkv)$/.test(ext)) return null;
  return 'unsupportedType';
}

/** File name safe to show: control characters removed, length capped, never empty. */
export function displayName(name: string, max = 60): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!clean) return '—';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// --- Decoded audio and measurements --------------------------------------------------------

/** Decoded PCM, one Float32Array per channel (Web Audio's AudioBuffer has the same shape). */
export interface DecodedAudio {
  sampleRate: number;
  channels: readonly Float32Array[];
}

export interface RecordingAnalysis {
  durationS: number;
  sampleRate: number;
  channelCount: number;
  /** Highest absolute sample, 0..1 (can exceed 1 for float sources). */
  peak: number;
  peakDb: number;
  /** RMS over all samples of all channels. */
  rmsDb: number;
  /** Samples that are part of a clipped run (all channels). */
  clippedSamples: number;
  clippedRuns: number;
  /** Share of 50 ms frames that are silent, 0..1. */
  silenceRatio: number;
  /** Silence at the start / end, seconds (a later trimming step can use these). */
  leadingSilenceS: number;
  trailingSilenceS: number;
  /** Gain that brings the peak to NORMALIZE_TARGET_DB, capped at MAX_GAIN_DB (can be negative). */
  normalizeGainDb: number;
}

export const toDb = (amplitude: number): number => (amplitude > 0 ? 20 * Math.log10(amplitude) : Number.NEGATIVE_INFINITY);
export const fromDb = (db: number): number => 10 ** (db / 20);

/** Measures decoded audio. Linear time, no allocations proportional to the length. */
export function analyzeAudio(a: DecodedAudio): RecordingAnalysis {
  const channels = a.channels.filter((c) => c.length > 0);
  const length = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const sampleRate = a.sampleRate > 0 ? a.sampleRate : 1;
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  let clippedSamples = 0;
  let clippedRuns = 0;
  for (const ch of channels) {
    let run = 0;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i] as number;
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
      sumSq += v * v;
      if (abs >= CLIP_LEVEL) {
        run++;
        if (run === CLIP_RUN) { clippedRuns++; clippedSamples += CLIP_RUN; } else if (run > CLIP_RUN) clippedSamples++;
      } else run = 0;
    }
    count += ch.length;
  }

  // Silence: frames whose RMS (all channels) is below SILENCE_DB.
  const frame = Math.max(1, Math.round(FRAME_S * sampleRate));
  const silentLevel = fromDb(SILENCE_DB);
  const frames = Math.ceil(length / frame);
  const silent: boolean[] = [];
  for (let f = 0; f < frames; f++) {
    const start = f * frame;
    const end = Math.min(length, start + frame);
    let s = 0;
    let n = 0;
    for (const ch of channels) {
      for (let i = start; i < end && i < ch.length; i++) {
        const v = ch[i] as number;
        s += v * v;
        n++;
      }
    }
    silent.push(n === 0 || Math.sqrt(s / n) < silentLevel);
  }
  const silentFrames = silent.filter(Boolean).length;
  let lead = 0;
  while (lead < frames && silent[lead]) lead++;
  let trail = 0;
  while (trail < frames - lead && silent[frames - 1 - trail]) trail++;
  const frameS = frame / sampleRate;
  const durationS = length / sampleRate;

  const peakDb = toDb(peak);
  return {
    durationS,
    sampleRate: a.sampleRate,
    channelCount: channels.length,
    peak,
    peakDb,
    rmsDb: count > 0 ? toDb(Math.sqrt(sumSq / count)) : Number.NEGATIVE_INFINITY,
    clippedSamples,
    clippedRuns,
    silenceRatio: frames > 0 ? silentFrames / frames : 1,
    leadingSilenceS: Math.min(durationS, lead * frameS),
    trailingSilenceS: Math.min(durationS, trail * frameS),
    normalizeGainDb: peak > 0 ? Math.min(MAX_GAIN_DB, NORMALIZE_TARGET_DB - peakDb) : 0,
  };
}

export interface Waveform {
  /** Per bucket, the lowest and highest sample of all channels (−1..1). */
  min: Float32Array;
  max: Float32Array;
  /** Per bucket, whether it contains a full-scale sample. */
  clipped: Uint8Array;
}

/** Downsamples audio to `buckets` min/max pairs for drawing. One pass over the samples. */
export function computeWaveform(a: DecodedAudio, buckets: number): Waveform {
  const n = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const clipped = new Uint8Array(n);
  const length = a.channels.reduce((m, c) => Math.max(m, c.length), 0);
  if (length === 0) return { min, max, clipped };
  const per = length / n;
  for (let b = 0; b < n; b++) {
    const start = Math.floor(b * per);
    const end = Math.max(start + 1, Math.floor((b + 1) * per));
    let lo = 0;
    let hi = 0;
    let clip = 0;
    for (const ch of a.channels) {
      for (let i = start; i < end && i < ch.length; i++) {
        const v = ch[i] as number;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (v >= CLIP_LEVEL || v <= -CLIP_LEVEL) clip = 1;
      }
    }
    min[b] = Math.max(-1, lo);
    max[b] = Math.min(1, hi);
    clipped[b] = clip;
  }
  return { min, max, clipped };
}

// --- Assessment ----------------------------------------------------------------------------

export type NoteCode =
  | 'tooShort' | 'tooLong' | 'silent' // blocking
  | 'clipping' | 'quiet' | 'mostlySilent' | 'lowSampleRate' | 'leadingSilence' // warnings
  | 'good';

export interface Note {
  code: NoteCode;
  level: 'error' | 'warn' | 'ok';
  params?: Record<string, number>;
}

/** Turns measurements into plain-language notes. Errors mean the recording is not usable. */
export function assess(a: RecordingAnalysis): Note[] {
  const notes: Note[] = [];
  if (a.durationS < MIN_DURATION_S) notes.push({ code: 'tooShort', level: 'error', params: { min: MIN_DURATION_S } });
  if (a.durationS > MAX_DURATION_S) notes.push({ code: 'tooLong', level: 'error', params: { max: MAX_DURATION_S } });
  if (a.peakDb < -60) notes.push({ code: 'silent', level: 'error' });
  if (notes.length) return notes;
  if (a.clippedRuns > 0) notes.push({ code: 'clipping', level: 'warn', params: { runs: a.clippedRuns } });
  if (a.peakDb < -20) notes.push({ code: 'quiet', level: 'warn', params: { db: Math.round(a.peakDb) } });
  if (a.silenceRatio > 0.5) notes.push({ code: 'mostlySilent', level: 'warn', params: { pct: Math.round(a.silenceRatio * 100) } });
  else if (a.leadingSilenceS >= 1) notes.push({ code: 'leadingSilence', level: 'warn', params: { s: Math.round(a.leadingSilenceS * 10) / 10 } });
  if (a.sampleRate < 22050) notes.push({ code: 'lowSampleRate', level: 'warn', params: { hz: a.sampleRate } });
  if (notes.length === 0) notes.push({ code: 'good', level: 'ok' });
  return notes;
}

export const isUsable = (notes: readonly Note[]): boolean => !notes.some((n) => n.level === 'error');

// --- Local processing pipeline -------------------------------------------------------------

/** What a processing step can fail with (for UI messages). */
export type ProcessError = FileIssue | 'readFailed' | 'decodeFailed';

/** A picked file as the processor needs it (a browser `File` fits). */
export interface PickedFile extends FileInfo {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Decoder injected by the caller; `handle` is whatever the player needs (an AudioBuffer). */
export type Decoder<H> = (bytes: ArrayBuffer) => Promise<{ audio: DecodedAudio; handle: H }>;

export interface ProcessedRecording<H> {
  name: string;
  type: string;
  sizeBytes: number;
  extension: string;
  analysis: RecordingAnalysis;
  waveform: Waveform;
  notes: Note[];
  usable: boolean;
  handle: H;
  /** Where the work happened. Always 'browser' in this build; nothing is uploaded. */
  processedIn: 'browser';
}

export type ProcessorState<H> =
  | { status: 'idle' }
  | { status: 'reading' | 'decoding'; name: string }
  | { status: 'ready'; recording: ProcessedRecording<H> }
  | { status: 'error'; name: string; error: ProcessError };

/**
 * The processing interface. LEVEL 1 implements it locally; a future backend implementation
 * (see `contracts.ts`) would keep the same shape for the UI.
 */
export interface RecordingProcessor<H> {
  readonly state: ProcessorState<H>;
  process(file: PickedFile): Promise<ProcessorState<H>>;
  /** Drops the decoded audio and any result. Safe to call at any time. */
  discard(): void;
}

export const WAVEFORM_BUCKETS = 720;

/**
 * Local, in-memory implementation: validate → read → decode (browser) → analyse. A newer
 * `process()` or `discard()` makes an older one's result disappear (stale-token check), so
 * picking a second file while the first one decodes never shows the wrong recording.
 */
export class LocalRecordingProcessor<H> implements RecordingProcessor<H> {
  private current: ProcessorState<H> = { status: 'idle' };
  private token = 0;
  private readonly decode: Decoder<H>;
  private readonly onChange: (s: ProcessorState<H>) => void;

  constructor(decode: Decoder<H>, onChange: (s: ProcessorState<H>) => void = () => undefined) {
    this.decode = decode;
    this.onChange = onChange;
  }

  get state(): ProcessorState<H> {
    return this.current;
  }

  private set(token: number, s: ProcessorState<H>): ProcessorState<H> {
    if (token !== this.token) return this.current;
    this.current = s;
    this.onChange(s);
    return s;
  }

  async process(file: PickedFile): Promise<ProcessorState<H>> {
    const token = ++this.token;
    const name = displayName(file.name);
    const issue = validateFile(file);
    if (issue) return this.set(token, { status: 'error', name, error: issue });

    this.set(token, { status: 'reading', name });
    let bytes: ArrayBuffer | null;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return this.set(token, { status: 'error', name, error: 'readFailed' });
    }
    if (token !== this.token) return this.current;

    this.set(token, { status: 'decoding', name });
    let decoded: { audio: DecodedAudio; handle: H };
    try {
      decoded = await this.decode(bytes);
    } catch {
      return this.set(token, { status: 'error', name, error: 'decodeFailed' });
    } finally {
      bytes = null; // the encoded bytes are not kept
    }
    if (token !== this.token) return this.current;

    const analysis = analyzeAudio(decoded.audio);
    const notes = assess(analysis);
    return this.set(token, {
      status: 'ready',
      recording: {
        name,
        type: file.type,
        sizeBytes: file.size,
        extension: fileExtension(file.name),
        analysis,
        waveform: computeWaveform(decoded.audio, WAVEFORM_BUCKETS),
        notes,
        usable: isUsable(notes),
        handle: decoded.handle,
        processedIn: 'browser',
      },
    });
  }

  discard(): void {
    this.token++;
    this.current = { status: 'idle' };
    this.onChange(this.current);
  }
}

/**
 * IndexedDB decision for this phase (spec: "use IndexedDB only if there is a real need"):
 * NOT used. The prototype only inspects and previews a recording; nothing consumes it after the
 * screen closes, so keeping megabytes of audio on the device would have no benefit. The audio
 * lives in memory and is dropped on DISCARD, on closing the screen and on page unload.
 * Persistence comes with LEVEL 2, when a recording can become a playable engine sound.
 */
export const PERSISTS_AUDIO = false;
