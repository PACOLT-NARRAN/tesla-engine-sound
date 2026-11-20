import { useMemo, useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';
import type { EngineProfile } from '../types/profile.ts';
import { msToKmh, msToMph } from '../utils/math.ts';

const SEGMENTS = 54;
const START_DEG = 135; // 7:30 position
const SWEEP_DEG = 270;
const R_OUT = 188;
const R_IN = 158;
const C = 200;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function segmentPath(i: number): string {
  const gap = 1.1;
  const a0 = START_DEG + (SWEEP_DEG / SEGMENTS) * i + gap / 2;
  const a1 = START_DEG + (SWEEP_DEG / SEGMENTS) * (i + 1) - gap / 2;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R_OUT},${R_OUT} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${R_IN},${R_IN} 0 0 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
}

interface Props {
  profile: EngineProfile;
  units: 'kmh' | 'mph';
}

/** Segmented RPM ring with the speed readout in the middle. Updated via rAF, never via React state. */
export function Tachometer({ profile, units }: Props) {
  const session = useSession();
  const segRefs = useRef<(SVGPathElement | null)[]>([]);
  const speedRef = useRef<HTMLSpanElement>(null);
  const rpmRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const last = useRef({ lit: -1, speed: -1, rpm: -1, zone: '' });

  const maxRpm = Math.ceil((profile.limiterRPM + 500) / 1000) * 1000;
  const segments = useMemo(
    () =>
      Array.from({ length: SEGMENTS }, (_, i) => {
        const rpm = ((i + 0.5) / SEGMENTS) * maxRpm;
        const zone = rpm >= profile.redlineRPM ? 'red' : rpm >= profile.gearbox.shiftUpRPM.hard * 0.82 ? 'hot' : 'cool';
        return { d: segmentPath(i), zone };
      }),
    [maxRpm, profile.redlineRPM, profile.gearbox.shiftUpRPM.hard],
  );
  const labels = useMemo(() => {
    const out: { x: number; y: number; t: string; red: boolean }[] = [];
    for (let k = 0; k <= maxRpm / 1000; k++) {
      const [x, y] = polar(R_IN - 22, START_DEG + (SWEEP_DEG * k * 1000) / maxRpm);
      out.push({ x, y, t: String(k), red: k * 1000 >= profile.redlineRPM });
    }
    return out;
  }, [maxRpm, profile.redlineRPM]);

  useFrame(() => {
    const d = session.telemetry.drivetrain;
    const m = session.telemetry.motion;
    const lit = Math.round((Math.min(d.rpm, maxRpm) / maxRpm) * SEGMENTS);
    const L = last.current;
    if (lit !== L.lit) {
      for (let i = 0; i < SEGMENTS; i++) {
        const on = i < lit;
        const was = i < L.lit;
        if (on !== was || L.lit < 0) segRefs.current[i]?.classList.toggle('on', on);
      }
      L.lit = lit;
    }
    const sp = Math.round(units === 'mph' ? msToMph(m.speed) : msToKmh(m.speed));
    if (sp !== L.speed && speedRef.current) {
      speedRef.current.textContent = String(sp);
      L.speed = sp;
    }
    const rpm = Math.round(d.rpm / 50) * 50;
    if (rpm !== L.rpm && rpmRef.current) {
      rpmRef.current.textContent = rpm.toLocaleString('en-US');
      L.rpm = rpm;
    }
    const zone = d.rpm >= profile.redlineRPM ? 'redline' : d.rpm >= profile.gearbox.shiftUpRPM.hard * 0.82 ? 'hot' : 'cool';
    if (zone !== L.zone && rootRef.current) {
      rootRef.current.dataset.zone = zone;
      L.zone = zone;
    }
  });

  return (
    <div className="tach" ref={rootRef} data-zone="cool">
      <svg viewBox="0 0 400 400" className="tach-svg" aria-hidden="true">
        <defs>
          <radialGradient id="tachGlow" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="rgba(255,60,20,0)" />
            <stop offset="100%" stopColor="rgba(255,60,20,0.08)" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={196} fill="url(#tachGlow)" />
        {segments.map((s, i) => (
          <path key={i} ref={(el) => { segRefs.current[i] = el; }} d={s.d} className={`seg seg-${s.zone}`} />
        ))}
        {labels.map((l) => (
          <text key={l.t} x={l.x} y={l.y} className={l.red ? 'tick-label red' : 'tick-label'} textAnchor="middle" dominantBaseline="central">
            {l.t}
          </text>
        ))}
      </svg>
      <div className="tach-center">
        <span className="speed" ref={speedRef}>0</span>
        <span className="speed-unit">{units === 'mph' ? 'MPH' : 'KM/H'}</span>
        <div className="rpm-readout">
          <span ref={rpmRef}>0</span>
          <small>RPM</small>
        </div>
      </div>
    </div>
  );
}
