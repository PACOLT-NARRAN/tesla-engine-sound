export type EngineCategory =
  | 'V12'
  | 'V10'
  | 'V8'
  | 'Inline-6'
  | 'Inline-4'
  | 'Flat-6'
  | 'Rotary'
  | 'Unknown';

export type Aspiration = 'naturally-aspirated' | 'turbo' | 'twin-turbo' | 'supercharged' | 'twin-charged' | 'unknown';

export interface GearboxConfig {
  /** Ratio per forward gear, 1st first. */
  gearRatios: number[];
  finalDrive: number;
  /** Dynamic rolling radius of the virtual tyre, metres. */
  tireRadiusM: number;
  /** Upshift RPM at gentle vs. full throttle; interpolated by load. */
  shiftUpRPM: { gentle: number; hard: number };
  /** Downshift RPM when coasting vs. under load. */
  shiftDownRPM: { gentle: number; hard: number };
  /** Seconds the shift takes (ignition cut + RPM settle). */
  shiftDuration: number;
  /** Minimum seconds between two shifts (anti-hunting). */
  minShiftInterval: number;
  /** Clutch-slip RPM when launching in 1st at full throttle. */
  launchRPM: number;
}

export interface EngineDynamics {
  /** RPM smoothing time constant in seconds (lower = snappier engine). */
  engineResponse: number;
  /** Multiplier from estimated acceleration to virtual throttle. */
  throttleSensitivity: number;
  /** Vehicle acceleration (m/s²) that counts as full throttle in 1st gear. */
  fullThrottleAccel: number;
}

export interface EngineAudioConfig {
  /** True once the import pipeline has produced public/audio/<id>/manifest.json. */
  converted: boolean;
  /** Path relative to the site base. */
  manifest: string;
  /** Linear gain calibration, 1 = nominal. */
  volume: number;
  /** Playback-rate calibration, 1 = nominal. */
  pitch: number;
  /** Overrun crackle / backfire on lift-off. 0 disables. */
  overrunPops: number;
  /** Intensity of the exhaust crack on downshifts. 0 disables. */
  shiftBark: number;
  /** Blow-off (dump valve) level when lifting after high load, 0..1. Default 0.7; used only if the bank has blow-off sounds. */
  blowoff?: number;
  /** Synthesised turbo whistle that spools with load and RPM, 0..1. Default 0.5 for turbo engines, 0 otherwise. */
  turbo?: number;
  /** Tone colour of the placeholder synthesiser (TODO: remove once all banks are converted). */
  placeholderTone: { brightness: number; roughness: number };
}

export interface EngineProfile {
  id: string;
  name: string;
  description: string;
  category: EngineCategory;
  aspiration: Aspiration;
  cylinders: number;
  displacementL: number | null;
  /** Where the sound came from in qb-changesound. */
  source: { configLabel: string; soundName: string; awc: string; audioConfig: string[] };
  idleRPM: number;
  redlineRPM: number;
  /** Hard cut of the rev limiter. */
  limiterRPM: number;
  gearbox: GearboxConfig;
  dynamics: EngineDynamics;
  audio: EngineAudioConfig;
}
