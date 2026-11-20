import type { MotionSource, MotionSourceStatus, RawFix } from '../types/motion.ts';

/**
 * Production motion input: navigator.geolocation.watchPosition().
 * Positions are handed to the in-page estimator only; nothing is stored or transmitted.
 */
export class GeolocationMotionSource implements MotionSource {
  readonly kind = 'gps' as const;
  private watchId: number | null = null;

  start(onFix: (fix: RawFix) => void, onStatus: (status: MotionSourceStatus) => void): void {
    this.stop();
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      onStatus({ kind: 'unsupported', reason: 'Location needs HTTPS. Open the https:// address of this app.' });
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      onStatus({ kind: 'unsupported', reason: 'This browser does not provide location.' });
      return;
    }
    onStatus({ kind: 'starting' });
    let gotFirst = false;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!gotFirst) {
          gotFirst = true;
          onStatus({ kind: 'active' });
        }
        const c = pos.coords;
        onFix({
          timestamp: fixTimestamp(pos.timestamp, Date.now()),
          latitude: c.latitude,
          longitude: c.longitude,
          accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
          speed: c.speed === null || Number.isNaN(c.speed) ? null : c.speed,
          heading: c.heading === null || Number.isNaN(c.heading) ? null : c.heading,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          onStatus({ kind: 'denied' });
          this.stop();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          onStatus({ kind: 'error', message: 'GPS position unavailable. Waiting for signal…' });
        } else {
          onStatus({ kind: 'error', message: 'GPS is slow to respond. Still trying…' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  }
}

/**
 * Timestamp to use for a fix. The estimator measures fix age against Date.now(), so a
 * position stamped by a different clock (seen on in-car browsers: GPS time, skewed clocks)
 * would look ancient and report "signal lost" while speed still updates. Trust the fix's
 * own stamp only when it agrees with the local clock; otherwise use the arrival time.
 */
export function fixTimestamp(posTimestamp: number, nowMs: number): number {
  if (!Number.isFinite(posTimestamp) || posTimestamp <= 0) return nowMs;
  return Math.abs(nowMs - posTimestamp) <= 2000 ? posTimestamp : nowMs;
}
