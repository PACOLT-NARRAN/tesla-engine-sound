import type { DriveAction } from './types.ts';

/** Pixels per line / per page used to normalise `WheelEvent.deltaMode` 1 and 2. */
export const LINE_PX = 30;
export const PAGE_PX = 300;
/** Accumulated distance that counts as one wheel notch. */
export const NOTCH_PX = 40;
/** Minimum time between two gear steps from one continuous gesture (ms). */
export const STEP_MS = 220;
/** A partial notch older than this is forgotten (ms). */
export const ACC_RESET_MS = 400;

/** Converts a wheel delta to pixels whatever its deltaMode (0 = px, 1 = lines, 2 = pages). */
export function wheelDeltaPx(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

/** Scrolling down (positive delta) = shift down, scrolling up = shift up. */
export function directionToAction(delta: number): DriveAction | null {
  if (delta > 0) return 'shift-down';
  if (delta < 0) return 'shift-up';
  return null;
}

export function keyToAction(key: string): DriveAction | null {
  if (key === 'ArrowDown' || key === 'PageDown') return 'shift-down';
  if (key === 'ArrowUp' || key === 'PageUp') return 'shift-up';
  return null;
}

export type NotchResult = { action: DriveAction; debounced: boolean } | null;

/**
 * Collects wheel / scroll distance and emits one action per notch. A fast spin produces at
 * most one step per STEP_MS (the rest is reported as debounced, so diagnostics can show it).
 */
export class NotchAccumulator {
  private acc = 0;
  private lastInput = -Infinity;
  private lastStep = -Infinity;
  private readonly notchPx: number;
  private readonly stepMs: number;
  private readonly resetMs: number;

  constructor(notchPx = NOTCH_PX, stepMs = STEP_MS, resetMs = ACC_RESET_MS) {
    this.notchPx = notchPx;
    this.stepMs = stepMs;
    this.resetMs = resetMs;
  }

  feed(deltaPx: number, now: number): NotchResult {
    if (now - this.lastInput > this.resetMs) this.acc = 0;
    this.lastInput = now;
    // Reversing direction starts a new notch.
    if (this.acc !== 0 && Math.sign(deltaPx) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += deltaPx;
    if (Math.abs(this.acc) < this.notchPx) return null;
    const action = directionToAction(this.acc);
    this.acc = 0;
    if (!action) return null;
    if (now - this.lastStep < this.stepMs) return { action, debounced: true };
    this.lastStep = now;
    return { action, debounced: false };
  }

  reset(): void {
    this.acc = 0;
    this.lastInput = -Infinity;
  }
}

/** Same debounce for discrete inputs (keys). */
export class StepLimiter {
  private last = -Infinity;
  private readonly stepMs: number;
  constructor(stepMs = STEP_MS) {
    this.stepMs = stepMs;
  }
  allow(now: number): boolean {
    if (now - this.last < this.stepMs) return false;
    this.last = now;
    return true;
  }
}

interface TargetLike {
  tagName?: string;
  id?: string;
  className?: unknown;
}

/** `div#id.class1.class2` (max two classes), `window` / `document` for non-elements. */
export function describeTarget(t: unknown): string {
  if (t === null || t === undefined) return '—';
  if (typeof t !== 'object') return String(t);
  const el = t as TargetLike;
  if (typeof el.tagName !== 'string') {
    if (typeof Window !== 'undefined' && t instanceof Window) return 'window';
    if (typeof Document !== 'undefined' && t instanceof Document) return 'document';
    return 'object';
  }
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
  return s;
}
