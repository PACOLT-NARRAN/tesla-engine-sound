export interface DrivetrainState {
  /** Vehicle speed fed in, m/s. */
  speed: number;
  /** Vehicle acceleration fed in, m/s². */
  accel: number;
  /** Estimated pedal position 0..1. */
  throttle: number;
  /** Engine load 0..1 after shift cuts etc. This is what the audio follows. */
  load: number;
  rpm: number;
  targetRpm: number;
  /** 0 = neutral. */
  gear: number;
  shifting: boolean;
  shiftDirection: 'up' | 'down' | null;
  /** 0..1 progress through the current shift. */
  shiftProgress: number;
  /** Lift-off / engine braking. */
  overrun: boolean;
  limiter: boolean;
  running: boolean;
  /** Driver's manual gear offset from the automatic choice (-2..+2), 0 = fully automatic. */
  manualOffset: number;
  /** On-screen REV pedal is held (clutch in, throttle open). */
  revPedal: boolean;
  /** Automatic gearbox (with temporary override) or full manual shifting. */
  transmission: 'auto' | 'manual';
}

export type DrivetrainEvent =
  | { type: 'shift'; direction: 'up' | 'down'; from: number; to: number; throttle: number }
  | { type: 'overrun-start'; rpm: number }
  | { type: 'limiter' };
