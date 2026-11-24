import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { SessionState } from '../core/EngineSession.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { BrandMeaning } from './BrandMeaning.tsx';

type Tone = 'ok' | 'warn' | 'bad' | 'off';

function gpsChip(s: SessionState): { text: MessageKey; tone: Tone } {
  if (s.mode === 'demo') return { text: 'status.demo', tone: 'ok' };
  if (s.ignition === 'off') return { text: 'status.gps', tone: 'off' };
  switch (s.sourceStatus.kind) {
    case 'denied': return { text: 'status.gpsDenied', tone: 'bad' };
    case 'unsupported': return { text: 'status.noGps', tone: 'bad' };
    case 'starting': return { text: 'status.gpsStarting', tone: 'warn' };
    case 'error': return { text: 'status.gpsWait', tone: 'warn' };
    default: break;
  }
  switch (s.motionQuality) {
    case 'good': return { text: 'status.gps', tone: 'ok' };
    case 'poor': return { text: 'status.gpsWeak', tone: 'warn' };
    case 'stale': return { text: 'status.gpsHold', tone: 'warn' };
    case 'lost': return { text: 'status.gpsLost', tone: 'bad' };
    default: return { text: 'status.gpsStarting', tone: 'warn' };
  }
}

function audioChip(s: SessionState): { text: MessageKey; tone: Tone } {
  switch (s.audioStatus) {
    // DRIVE MUSIC pack "engines" (ids music-*) play generative music.
    case 'running': return { text: s.activeEngine.id.startsWith('music-') ? 'status.soundMusic' : s.bankKind === 'placeholder' ? 'status.soundSynth' : 'status.sound', tone: 'ok' };
    case 'loading': return { text: 'status.loading', tone: 'warn' };
    case 'suspended': return { text: 'status.soundPaused', tone: 'bad' };
    case 'error': return { text: 'status.noSound', tone: 'bad' };
    default: return { text: 'status.soundReady', tone: 'off' };
  }
}

export function StatusStrip({ profileName }: { profileName: string }) {
  const s = useSessionState();
  const session = useSession();
  const t = useT();
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
        <span className="brand-text">
          <span className="brand-name">REVLINE</span>
          <BrandMeaning className="brand-tagline" />
        </span>
      </div>
      <div className="chips">
        <span className={`chip chip-${gps.tone}`}>
          <i className="dot" /> {t(gps.text)} <span className="chip-sub" ref={accRef} />
        </span>
        <span className={`chip chip-${audio.tone}`}><i className="dot" /> {t(audio.text)}</span>
        <span className="chip chip-profile">{profileName}</span>
        {!s.online && <span className="chip chip-warn"><i className="dot" /> {t('status.offline')}</span>}
      </div>
    </header>
  );
}
