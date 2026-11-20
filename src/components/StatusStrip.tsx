import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { SessionState } from '../core/EngineSession.ts';

type Tone = 'ok' | 'warn' | 'bad' | 'off';

function gpsChip(s: SessionState): { text: string; tone: Tone } {
  if (s.mode === 'demo') return { text: 'DEMO', tone: 'ok' };
  if (s.ignition === 'off') return { text: 'GPS', tone: 'off' };
  switch (s.sourceStatus.kind) {
    case 'denied': return { text: 'GPS DENIED', tone: 'bad' };
    case 'unsupported': return { text: 'NO GPS', tone: 'bad' };
    case 'starting': return { text: 'GPS…', tone: 'warn' };
    case 'error': return { text: 'GPS WAIT', tone: 'warn' };
    default: break;
  }
  switch (s.motionQuality) {
    case 'good': return { text: 'GPS', tone: 'ok' };
    case 'poor': return { text: 'GPS WEAK', tone: 'warn' };
    case 'stale': return { text: 'GPS HOLD', tone: 'warn' };
    case 'lost': return { text: 'GPS LOST', tone: 'bad' };
    default: return { text: 'GPS…', tone: 'warn' };
  }
}

function audioChip(s: SessionState): { text: string; tone: Tone } {
  switch (s.audioStatus) {
    case 'running': return { text: s.bankKind === 'placeholder' ? 'SOUND · SYNTH' : 'SOUND', tone: 'ok' };
    case 'loading': return { text: 'LOADING', tone: 'warn' };
    case 'suspended': return { text: 'SOUND PAUSED', tone: 'bad' };
    case 'error': return { text: 'NO SOUND', tone: 'bad' };
    default: return { text: 'SOUND READY', tone: 'off' };
  }
}

export function StatusStrip({ profileName }: { profileName: string }) {
  const s = useSessionState();
  const session = useSession();
  const accRef = useRef<HTMLSpanElement>(null);
  const lastAcc = useRef<string>('');
  const gps = gpsChip(s);
  const audio = audioChip(s);

  useFrame(() => {
    const a = session.telemetry.motion.raw.accuracy;
    const txt = s.mode === 'demo' || a === null ? '' : `±${Math.round(a)} m`;
    if (txt !== lastAcc.current && accRef.current) {
      accRef.current.textContent = txt;
      lastAcc.current = txt;
    }
  });

  return (
    <header className="status-strip">
      <div className="brand">
        <span className="brand-mark" />
        REVLINE
      </div>
      <div className="chips">
        <span className={`chip chip-${gps.tone}`}>
          <i className="dot" /> {gps.text} <span className="chip-sub" ref={accRef} />
        </span>
        <span className={`chip chip-${audio.tone}`}><i className="dot" /> {audio.text}</span>
        <span className="chip chip-profile">{profileName}</span>
        {!s.online && <span className="chip chip-warn"><i className="dot" /> OFFLINE</span>}
      </div>
    </header>
  );
}
