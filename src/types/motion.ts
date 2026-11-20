/** One raw position fix exactly as a motion source delivered it. Never leaves the browser. */
export interface RawFix {
  /** Epoch milliseconds. */
  timestamp: number;
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in metres, null when unknown. */
  accuracy: number | null;
  /** Browser-provided ground speed in m/s, null when the platform does not supply it. */
  speed: number | null;
  heading: number | null;
}

export type MotionQuality = 'waiting' | 'good' | 'poor' | 'stale' | 'lost';
export type SpeedSource = 'coords' | 'haversine' | 'none';

export type FixRejectReason =
  | 'invalid'
  | 'low-accuracy'
  | 'out-of-order'
  | 'speed-outlier'
  | 'accel-outlier';

export interface FixResult {
  accepted: boolean;
  reason?: FixRejectReason;
}

/** Filtered motion, produced by MotionEstimator. Raw values are kept separately for debugging. */
export interface MotionState {
  /** Filtered (and short-term predicted) ground speed, m/s. */
  speed: number;
  /** Filtered longitudinal acceleration, m/s². Negative = decelerating. */
  accel: number;
  stationary: boolean;
  quality: MotionQuality;
  /** Seconds since the last accepted fix (Infinity before the first). */
  fixAge: number;
  raw: {
    speed: number | null;
    speedSource: SpeedSource;
    accuracy: number | null;
    lastRejectReason: FixRejectReason | null;
  };
  acceptedFixes: number;
  rejectedFixes: number;
}

export type MotionSourceStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'active' }
  | { kind: 'denied' }
  /** `code` selects the localized user text; `reason`/`message` stay as English developer detail. */
  | { kind: 'unsupported'; code: 'insecure' | 'no-geolocation'; reason: string }
  | { kind: 'error'; code: 'unavailable' | 'timeout'; message: string };

export interface MotionSource {
  readonly kind: 'gps' | 'demo';
  start(onFix: (fix: RawFix) => void, onStatus: (status: MotionSourceStatus) => void): void;
  stop(): void;
}
