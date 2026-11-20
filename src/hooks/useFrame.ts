import { useEffect, useRef } from 'react';

/**
 * Runs `cb` on every animation frame without re-rendering React.
 * Components write to DOM refs directly for high-frequency telemetry.
 */
export function useFrame(cb: (now: number) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id = 0;
    const loop = (t: number): void => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}
