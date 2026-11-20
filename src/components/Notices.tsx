import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';

interface Item {
  key: string;
  level: 'info' | 'warn' | 'error';
  text: MessageKey;
  action?: { label: MessageKey; run: () => void };
}

/** Human-readable problems, most important first. At most two are shown while driving. */
export function Notices() {
  const s = useSessionState();
  const session = useSession();
  const t = useT();
  const items: Item[] = [];

  if (s.ignition !== 'off' && s.audioStatus === 'suspended') {
    items.push({ key: 'susp', level: 'error', text: 'notice.audioPaused', action: { label: 'notice.tapToResume', run: () => void session.resumeAudio() } });
  }
  if (s.mode === 'gps' && s.ignition === 'on') {
    const st = s.sourceStatus;
    if (st.kind === 'denied') items.push({ key: 'denied', level: 'error', text: 'notice.gpsDenied' });
    else if (st.kind === 'unsupported') items.push({ key: 'unsup', level: 'error', text: st.code === 'insecure' ? 'notice.gpsInsecure' : 'notice.gpsUnsupported' });
    else if (st.kind === 'error') items.push({ key: 'gpserr', level: 'warn', text: st.code === 'unavailable' ? 'notice.gpsUnavailable' : 'notice.gpsTimeout' });
    else if (s.motionQuality === 'lost') items.push({ key: 'lost', level: 'warn', text: 'notice.gpsLost' });
    else if (s.motionQuality === 'stale') items.push({ key: 'stale', level: 'info', text: 'notice.gpsStale' });
    else if (s.motionQuality === 'poor') items.push({ key: 'poor', level: 'info', text: 'notice.gpsPoor' });
    else if (s.motionQuality === 'waiting' && st.kind === 'active') items.push({ key: 'wait', level: 'info', text: 'notice.gpsWaiting' });
  }
  if (s.audioIssue) items.push({ key: 'audio', level: 'warn', text: s.audioIssue.kind === 'no-webaudio' ? 'notice.noWebAudio' : 'notice.bankFailed' });
  if (!s.online && s.audioStatus !== 'running') items.push({ key: 'off', level: 'info', text: 'notice.offline' });

  if (items.length === 0) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {items.slice(0, 2).map((n) => (
        <div key={n.key} className={`notice notice-${n.level}`}>
          <span>{t(n.text)}</span>
          {n.action && <button className="notice-btn" onClick={n.action.run}>{t(n.action.label)}</button>}
        </div>
      ))}
    </div>
  );
}
