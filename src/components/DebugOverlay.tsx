import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';
import { formatEntry, inputDiagnostics } from '../input/InputDiagnostics.ts';

/** ?debug=1 overlay. Text updated ~8x/s directly in the DOM; pointer-events disabled. */
export function DebugOverlay() {
  const session = useSession();
  const pre = useRef<HTMLPreElement>(null);
  const lastAt = useRef(0);

  useFrame((now) => {
    if (now - lastAt.current < 120 || !pre.current) return;
    lastAt.current = now;
    const m = session.telemetry.motion;
    const d = session.telemetry.drivetrain;
    const a = session.audioDebug();
    const st = session.store.get();
    const f = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits));
    const lines = [
      `engine         ${session.currentProfile.id}  (bank ${a.bankKind})  locale=${st.locale}`,
      `mode           ${st.mode}  source=${st.sourceStatus.kind}  quality=${m.quality}`,
      `raw speed      ${f(m.raw.speed)} m/s (${m.raw.speedSource})  = ${f(m.raw.speed === null ? null : m.raw.speed * 3.6, 1)} km/h`,
      `filtered speed ${f(m.speed)} m/s  = ${f(m.speed * 3.6, 1)} km/h   stationary=${m.stationary}`,
      `accuracy       ${f(m.raw.accuracy, 1)} m   fix age ${f(m.fixAge, 1)} s`,
      `fixes          ok=${m.acceptedFixes} rejected=${m.rejectedFixes} last=${m.raw.lastRejectReason ?? '—'}`,
      `accel          ${f(m.accel)} m/s²  (${f(m.accel / 9.81)} g)`,
      `turn rate      ${f(m.turnRate, 1)} °/s`,
      `throttle/load  ${f(d.throttle)} / ${f(d.load)}   overrun=${d.overrun} limiter=${d.limiter}`,
      `input          ${inputLine()}`,
      `gear           ${d.gear === 0 ? 'N' : d.gear}  ${d.transmission} offset ${d.manualOffset > 0 ? '+' : ''}${d.manualOffset}  drive=${st.activeDrive.id}   shifting=${d.shifting ? `${d.shiftDirection} ${f(d.shiftProgress)}` : 'no'}`,
      `rpm            ${Math.round(d.rpm)}  target ${Math.round(d.targetRpm)}`,
      `audio ctx      ${a.contextState}  ${a.sampleRate} Hz  latency ${f(a.baseLatencyMs, 1)} ms  bank=${a.bankKind}`,
      `master gain    ${f(a.masterGain, 3)}`,
      ...(a.music ? [`music          ${a.music.style}  ${a.music.bpm} BPM  gear=${a.music.gear}  notes=${a.music.notes}  cruise=${f(a.music.cruise)} push=${f(a.music.push)} brake=${f(a.music.brake)} turn=${f(a.music.turn)}`,
        `  layers       ${Object.entries(a.music.layers).filter(([k, on]) => on && k !== 'gearVoices').map(([k]) => k).join(' ')} gearVoices=${a.music.layers.gearVoices}`] : []),
      `layers         ${a.layers.length === 0 ? '—' : ''}`,
      ...a.layers.map((l) => `  band ${String(l.rpm).padStart(5)}  w=${f(l.weight)}  rate=${f(l.rate, 3)}  on=${f(l.on)} off=${f(l.off)}`),
    ];
    pre.current.textContent = lines.join('\n');
  });

  return <pre className="debug-overlay" ref={pre} />;
}

function inputLine(): string {
  const sum = inputDiagnostics.summary();
  const last = sum.last ? formatEntry(sum.last) : 'none yet';
  return `wheel=${sum.byKind.wheel} scroll=${sum.byKind.scroll} keys=${sum.byKind.keydown} applied=${sum.applied}  last: ${last}`;
}
