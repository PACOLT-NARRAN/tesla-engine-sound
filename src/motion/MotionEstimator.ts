import type { FixRejectReason, FixResult, MotionQuality, MotionState, RawFix, SpeedSource } from '../types/motion.ts';
import { haversineDistance } from '../utils/geo.ts';
import { clamp, isFiniteNumber } from '../utils/math.ts';

export interface MotionEstimatorConfig {
  /** Fixes worse than this are rejected outright (metres). */
  maxAccuracyM: number;
  /** Fixes worse than this are accepted but trusted less and flagged "poor". */
  poorAccuracyM: number;
  /** Physically implausible speed for a road car (m/s). */
  maxSpeedMs: number;
  /** Physically implausible change in speed between fixes (m/s²). */
  maxAccelMs2: number;
  /** After this many consecutive outliers the filter re-syncs to the measurement (avoids lock-out). */
  outlierResyncCount: number;
  /** Shortest interval used for coordinate-derived speed (seconds). */
  minFallbackDtS: number;
  /** Gap after which the filter state is reset instead of continued (seconds). */
  maxGapS: number;
  staleAfterS: number;
  lostAfterS: number;
  /** Stationary hysteresis on the filtered speed (m/s). */
  stationaryEnterMs: number;
  stationaryExitMs: number;
  /** Fraction of the accuracy radius treated as jitter when deriving speed from coordinates. */
  jitterFactor: number;
  /** Alpha-beta filter gains. */
  alphaGood: number;
  alphaPoor: number;
  beta: number;
  /** Max horizon for dead-reckoning between fixes (seconds). */
  predictHorizonS: number;
}

export const DEFAULT_MOTION_CONFIG: MotionEstimatorConfig = {
  maxAccuracyM: 50,
  poorAccuracyM: 20,
  maxSpeedMs: 90,
  maxAccelMs2: 12,
  outlierResyncCount: 3,
  minFallbackDtS: 0.25,
  maxGapS: 10,
  staleAfterS: 3,
  lostAfterS: 10,
  stationaryEnterMs: 0.45,
  stationaryExitMs: 0.9,
  jitterFactor: 0.3,
  alphaGood: 0.5,
  alphaPoor: 0.2,
  beta: 0.15,
  predictHorizonS: 1.2,
};

interface Anchor {
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/**
 * Turns noisy position fixes into smoothed speed + acceleration.
 *
 * Pipeline per fix: validate -> measure speed (coords.speed, else Haversine) ->
 * outlier gate -> alpha-beta filter (gain scaled by accuracy) -> stationary hysteresis.
 * Pure TypeScript, no browser APIs: unit-testable in Node.
 */
export class MotionEstimator {
  private readonly cfg: MotionEstimatorConfig;
  private anchor: Anchor | null = null;
  /** Where the car came to rest; position wander inside the accuracy radius around it is ignored. */
  private restAnchor: Anchor | null = null;
  private lastAcceptedTs: number | null = null;
  private speed = 0;
  private accel = 0;
  private initialized = false;
  private stationary = true;
  private consecutiveOutliers = 0;
  private lastAccuracy: number | null = null;
  private rawSpeed: number | null = null;
  private rawSource: SpeedSource = 'none';
  private lastReject: FixRejectReason | null = null;
  private accepted = 0;
  private rejected = 0;

  constructor(config: Partial<MotionEstimatorConfig> = {}) {
    this.cfg = { ...DEFAULT_MOTION_CONFIG, ...config };
  }

  reset(): void {
    this.anchor = null;
    this.restAnchor = null;
    this.lastAcceptedTs = null;
    this.speed = 0;
    this.accel = 0;
    this.initialized = false;
    this.stationary = true;
    this.consecutiveOutliers = 0;
    this.lastAccuracy = null;
    this.rawSpeed = null;
    this.rawSource = 'none';
    this.lastReject = null;
    this.accepted = 0;
    this.rejected = 0;
  }

  ingest(fix: RawFix): FixResult {
    const c = this.cfg;
    if (!isFiniteNumber(fix.timestamp) || !isFiniteNumber(fix.latitude) || !isFiniteNumber(fix.longitude) ||
        Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) {
      return this.reject('invalid');
    }
    const accuracy = isFiniteNumber(fix.accuracy) && fix.accuracy >= 0 ? fix.accuracy : null;
    this.lastAccuracy = accuracy;
    if (accuracy !== null && accuracy > c.maxAccuracyM) return this.reject('low-accuracy');

    const prev = this.anchor;
    if (prev && fix.timestamp <= prev.timestamp) return this.reject('out-of-order');
    const dt = prev ? (fix.timestamp - prev.timestamp) / 1000 : 0;

    // 1) Measure speed.
    let measured: number | null = null;
    let source: SpeedSource = 'none';
    if (isFiniteNumber(fix.speed) && fix.speed >= 0) {
      measured = fix.speed;
      source = 'coords';
    } else if (prev && dt >= c.minFallbackDtS && dt <= c.maxGapS) {
      const dist = haversineDistance(prev.latitude, prev.longitude, fix.latitude, fix.longitude);
      const acc = Math.max(accuracy ?? 10, prev.accuracy ?? 10);
      const jitterFloor = Math.min(acc, 25) * c.jitterFactor;
      const rest = this.stationary ? this.restAnchor : null;
      const fromRest = rest ? haversineDistance(rest.latitude, rest.longitude, fix.latitude, fix.longitude) : Infinity;
      // Parked: wander inside the accuracy circle is noise, not motion.
      measured = dist <= jitterFloor || fromRest < Math.max(5, Math.min(acc, 25)) ? 0 : dist / dt;
      source = 'haversine';
    } else if (prev && dt < c.minFallbackDtS && !isFiniteNumber(fix.speed)) {
      // Too close in time to derive a speed: keep the older anchor so the next interval is longer.
      return { accepted: true };
    }

    if (measured !== null && measured > c.maxSpeedMs) return this.reject('speed-outlier');

    // 2) Outlier gate on implied acceleration.
    if (measured !== null && this.initialized && dt > 0 && dt <= c.maxGapS) {
      const predicted = Math.max(0, this.speed + this.accel * dt);
      const implied = (measured - predicted) / Math.max(dt, 0.2);
      if (Math.abs(implied) > c.maxAccelMs2) {
        this.consecutiveOutliers++;
        if (this.consecutiveOutliers < c.outlierResyncCount) return this.reject('accel-outlier');
        this.initialized = false; // persistent disagreement: trust the sensor again
      }
    }
    this.consecutiveOutliers = 0;

    this.anchor = { timestamp: fix.timestamp, latitude: fix.latitude, longitude: fix.longitude, accuracy };
    this.rawSpeed = measured;
    this.rawSource = source;
    this.accepted++;
    this.lastReject = null;

    if (measured === null) {
      this.lastAcceptedTs = fix.timestamp;
      return { accepted: true };
    }

    // 3) Alpha-beta filter.
    if (!this.initialized || dt <= 0 || dt > c.maxGapS) {
      this.speed = measured;
      this.accel = 0;
      this.initialized = true;
    } else {
      const poor = accuracy !== null && accuracy > c.poorAccuracyM;
      const alpha = poor ? c.alphaPoor : c.alphaGood;
      const predicted = Math.max(0, this.speed + this.accel * dt);
      const residual = measured - predicted;
      this.speed = Math.max(0, predicted + alpha * residual);
      this.accel = clamp(this.accel + (c.beta * residual) / dt, -c.maxAccelMs2, c.maxAccelMs2);
    }

    // 4) Stationary hysteresis (suppresses GPS jitter at standstill).
    if (this.stationary) {
      if (this.speed > c.stationaryExitMs) this.stationary = false;
    } else if (this.speed < c.stationaryEnterMs && measured < c.stationaryExitMs) {
      this.stationary = true;
    }
    if (!this.stationary) this.restAnchor = null;
    else if (!this.restAnchor) this.restAnchor = this.anchor;
    if (this.stationary) {
      this.speed = 0;
      if (measured < c.stationaryExitMs) this.accel = 0;
    }

    this.lastAcceptedTs = fix.timestamp;
    return { accepted: true };
  }

  /** Current motion estimate at wall-clock `nowMs`, with short dead-reckoning between fixes. */
  sample(nowMs: number): MotionState {
    const c = this.cfg;
    const fixAge = this.lastAcceptedTs === null ? Infinity : Math.max(0, (nowMs - this.lastAcceptedTs) / 1000);

    let quality: MotionQuality;
    if (this.lastAcceptedTs === null) quality = 'waiting';
    else if (fixAge > c.lostAfterS) quality = 'lost';
    else if (fixAge > c.staleAfterS) quality = 'stale';
    else if (this.lastAccuracy !== null && this.lastAccuracy > c.poorAccuracyM) quality = 'poor';
    else quality = 'good';

    let speed = this.speed;
    let accel = this.accel;
    if (Number.isFinite(fixAge) && !this.stationary) {
      const horizon = Math.min(fixAge, c.predictHorizonS);
      speed = Math.max(0, this.speed + this.accel * horizon);
      // Beyond the prediction horizon we stop believing in the old acceleration.
      if (fixAge > c.predictHorizonS) accel = this.accel * Math.exp(-(fixAge - c.predictHorizonS) * 1.5);
      if (quality === 'stale' || quality === 'lost') accel = 0;
    }

    return {
      speed,
      accel,
      stationary: this.stationary,
      quality,
      fixAge,
      raw: {
        speed: this.rawSpeed,
        speedSource: this.rawSource,
        accuracy: this.lastAccuracy,
        lastRejectReason: this.lastReject,
      },
      acceptedFixes: this.accepted,
      rejectedFixes: this.rejected,
    };
  }

  private reject(reason: FixRejectReason): FixResult {
    this.rejected++;
    this.lastReject = reason;
    return { accepted: false, reason };
  }
}
