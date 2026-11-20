import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';

/** Throttle/load and longitudinal-g bars. */
export function LoadMeters() {
  const session = useSession();
  const thr = useRef<HTMLDivElement>(null);
  const gPos = useRef<HTMLDivElement>(null);
  const gNeg = useRef<HTMLDivElement>(null);
  const gText = useRef<HTMLSpanElement>(null);
  const last = useRef({ t: -1, g: -99 });

  useFrame(() => {
    const d = session.telemetry.drivetrain;
    const t = Math.round(d.load * 100);
    if (t !== last.current.t && thr.current) {
      thr.current.style.transform = `scaleY(${t / 100})`;
      last.current.t = t;
    }
    const g = Math.round((d.accel / 9.81) * 100) / 100;
    if (g !== last.current.g) {
      const pos = Math.max(0, Math.min(1, g / 0.6));
      const neg = Math.max(0, Math.min(1, -g / 0.6));
      if (gPos.current) gPos.current.style.transform = `scaleY(${pos})`;
      if (gNeg.current) gNeg.current.style.transform = `scaleY(${neg})`;
      if (gText.current) gText.current.textContent = `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(2)}`;
      last.current.g = g;
    }
  });

  return (
    <div className="meters">
      <div className="meter">
        <div className="meter-track"><div className="meter-fill load" ref={thr} /></div>
        <small>LOAD</small>
      </div>
      <div className="meter">
        <div className="meter-track split">
          <div className="half top"><div className="meter-fill accel" ref={gPos} /></div>
          <div className="half bottom"><div className="meter-fill decel" ref={gNeg} /></div>
        </div>
        <small><span ref={gText}>+0.00</span> G</small>
      </div>
    </div>
  );
}
