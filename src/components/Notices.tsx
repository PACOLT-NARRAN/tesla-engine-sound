import type { MessageKey, Params } from '../i18n/index.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { useT } from '../i18n/useT.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';

interface Item {
  key: string;
  level: 'info' | 'warn' | 'error';
  text: MessageKey;
  params?: Params;
  action?: { label: MessageKey; run: () => void };
}

/** Human-readable problems, most important first. At most two are shown while driving. */
export function Notices() {
  const s = useSessionState();
  const session = useSession();
  const t = useT();
  const items: Item[] = [];
  const upgrade = useUpgrade();

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
  // Try before you buy: a locked engine plays in Demo; on a GPS drive the fallback engine runs.
  if (s.ignition === 'on' && s.activeEngine.locked) {
    const selected = session.findProfile(s.profileId);
    const running = session.findProfile(s.activeEngine.id);
    const name = selected ? engineTitle(selected) : '';
    const unlock = { label: 'garage.unlock' as const, run: () => upgrade.open() };
    if (s.activeEngine.preview) items.push({ key: 'eng-preview', level: 'info', text: 'notice.enginePreview', params: { name }, action: unlock });
    else items.push({ key: 'eng-locked', level: 'info', text: 'notice.engineLocked', params: { name, fallback: running ? engineTitle(running) : '' }, action: unlock });
  }
  if (s.audioIssue) items.push({ key: 'audio', level: 'warn', text: s.audioIssue.kind === 'no-webaudio' ? 'notice.noWebAudio' : 'notice.bankFailed' });
  if (!s.online && s.audioStatus !== 'running') items.push({ key: 'off', level: 'info', text: 'notice.offline' });

  if (items.length === 0) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {items.slice(0, 2).map((n) => (
        <div key={n.key} className={`notice notice-${n.level}`}>
          <span>{t(n.text, n.params)}</span>
          {n.action && <button className="notice-btn" onClick={n.action.run}>{t(n.action.label)}</button>}
        </div>
      ))}
    </div>
  );
}
