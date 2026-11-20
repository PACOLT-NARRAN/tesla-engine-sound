/** One seamless loop recorded/synthesised at a nominal engine RPM. */
export interface LoopSample {
  buffer: AudioBuffer;
  loopStart: number;
  loopEnd: number;
}

/** An RPM band: an on-load (accel) loop and an off-load (overrun/decel) loop at the same RPM. */
export interface SoundBand {
  rpm: number;
  on: LoopSample;
  off: LoopSample;
}

export interface SoundBank {
  profileId: string;
  /** 'converted' = real audio from the import pipeline, 'placeholder' = procedural stand-in (TODO). */
  kind: 'converted' | 'placeholder';
  bands: SoundBand[];
  /** One-shot crackle/backfire buffers for overrun and upshift "bark". */
  pops: AudioBuffer[];
  /** Turbo dump-valve / blow-off one-shots, played when lifting off after high load. */
  blowoff: AudioBuffer[];
  /** Engine start / stop recordings (converted banks only). */
  startup: AudioBuffer | null;
  shutdown: AudioBuffer | null;
  /** Approximate decoded size, for diagnostics. */
  bytes: number;
}

/** Shape of public/audio/<profileId>/manifest.json written by tools/audio-import. */
export interface AudioManifest {
  version: 1;
  profileId: string;
  source: string;
  bands: Array<{
    rpm: number;
    on: { file: string; loopStart: number; loopEnd: number };
    off: { file: string; loopStart: number; loopEnd: number };
  }>;
  pops?: string[];
  blowoff?: string[];
  startup?: string;
  shutdown?: string;
}
