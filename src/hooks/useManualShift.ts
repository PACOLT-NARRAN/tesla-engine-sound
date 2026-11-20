import { useEffect } from 'react';
import type { EngineSession } from '../core/EngineSession.ts';

/** Minimum time between two gear steps from one scroll gesture (ms). */
const STEP_MS = 220;
/** Accumulated wheel distance that counts as one notch. */
const NOTCH = 40;

/**
 * Steering-wheel scroll (the Tesla browser turns it into page scrolling) and arrow / page keys
 * shift manually: down = one gear lower, up = one gear higher than the automatic choice.
 * Ignored while a settings sheet is open, so lists there still scroll.
 */
export function useManualShift(session: EngineSession, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let acc = 0;
    let lastStep = 0;
    const inSheet = (t: EventTarget | null) => t instanceof Element && t.closest('.sheet-backdrop') !== null;
    const step = (dir: -1 | 1) => {
      const now = performance.now();
      if (now - lastStep < STEP_MS) return;
      lastStep = now;
      session.manualShift(dir);
    };
    const onWheel = (e: WheelEvent) => {
      if (inSheet(e.target)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
      acc += dy;
      if (Math.abs(acc) >= NOTCH) {
        step(acc > 0 ? -1 : 1);
        acc = 0;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (inSheet(e.target) || e.repeat) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [session, enabled]);
}
