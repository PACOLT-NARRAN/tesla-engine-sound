import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';

export function GearIndicator() {
  const session = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const letter = useRef<HTMLSpanElement>(null);
  const last = useRef<number>(-1);

  useFrame(() => {
    const g = session.telemetry.drivetrain.gear;
    if (g === last.current || !ref.current || !letter.current) return;
    const up = g > last.current;
    letter.current.textContent = g === 0 ? 'N' : String(g);
    const el = ref.current;
    el.classList.remove('shift-up', 'shift-down');
    void el.offsetWidth; // restart the CSS animation
    if (last.current > 0 && g > 0) el.classList.add(up ? 'shift-up' : 'shift-down');
    el.dataset.neutral = String(g === 0);
    last.current = g;
  });

  return (
    <div className="gear" ref={ref} data-neutral="true">
      <small>GEAR</small>
      <span ref={letter}>N</span>
    </div>
  );
}
