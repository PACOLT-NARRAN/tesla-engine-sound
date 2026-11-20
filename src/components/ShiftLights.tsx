import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';
import type { EngineProfile } from '../types/profile.ts';

const LEDS = 15;

/** Race-style shift light bar: fills green -> amber -> red approaching the shift point, flashes at the limiter. */
export function ShiftLights({ profile }: { profile: EngineProfile }) {
  const session = useSession();
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const lastLit = useRef(-1);
  const lastFlash = useRef(false);

  useFrame(() => {
    const d = session.telemetry.drivetrain;
    const start = profile.redlineRPM * 0.62;
    const end = profile.gearbox.shiftUpRPM.hard;
    const lit = d.running ? Math.max(0, Math.min(LEDS, Math.round(((d.rpm - start) / (end - start)) * LEDS))) : 0;
    if (lit !== lastLit.current) {
      refs.current.forEach((el, i) => el?.classList.toggle('on', i < lit));
      lastLit.current = lit;
    }
    const flash = d.rpm >= end - 40 || d.limiter;
    if (flash !== lastFlash.current) {
      bar.current?.classList.toggle('flash', flash);
      lastFlash.current = flash;
    }
  });

  return (
    <div className="shift-lights" ref={bar} aria-hidden="true">
      {Array.from({ length: LEDS }, (_, i) => (
        <span key={i} ref={(el) => { refs.current[i] = el; }} className={i < 5 ? 'g' : i < 10 ? 'a' : 'r'} />
      ))}
    </div>
  );
}
