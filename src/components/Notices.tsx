import { useSession, useSessionState } from '../hooks/SessionContext.ts';

/** Human-readable problems, most important first. At most two are shown while driving. */
export function Notices() {
  const s = useSessionState();
  const session = useSession();
  const items: { key: string; level: 'info' | 'warn' | 'error'; text: string; action?: { label: string; run: () => void } }[] = [];

  if (s.ignition !== 'off' && s.audioStatus === 'suspended') {
    items.push({ key: 'susp', level: 'error', text: 'The browser paused the sound.', action: { label: 'TAP TO RESUME', run: () => void session.resumeAudio() } });
  }
  if (s.mode === 'gps' && s.ignition === 'on') {
    const k = s.sourceStatus.kind;
    if (k === 'denied') items.push({ key: 'denied', level: 'error', text: 'Location permission was denied. Allow location for this site in the browser settings, or use Demo Mode.' });
    else if (k === 'unsupported' && s.sourceStatus.kind === 'unsupported') items.push({ key: 'unsup', level: 'error', text: s.sourceStatus.reason });
    else if (k === 'error' && s.sourceStatus.kind === 'error') items.push({ key: 'gpserr', level: 'warn', text: s.sourceStatus.message });
    else if (s.motionQuality === 'lost') items.push({ key: 'lost', level: 'warn', text: 'No GPS update for a while. The engine holds its last state until the signal returns.' });
    else if (s.motionQuality === 'stale') items.push({ key: 'stale', level: 'info', text: 'GPS updates paused — holding speed.' });
    else if (s.motionQuality === 'poor') items.push({ key: 'poor', level: 'info', text: 'Weak GPS accuracy — response is smoothed more.' });
    else if (s.motionQuality === 'waiting' && k === 'active') items.push({ key: 'wait', level: 'info', text: 'Waiting for the first GPS fix…' });
  }
  if (s.audioMessage) items.push({ key: 'audio', level: 'warn', text: s.audioMessage });
  if (!s.online && s.audioStatus !== 'running') items.push({ key: 'off', level: 'info', text: 'You are offline. Engines already loaded keep working.' });

  if (items.length === 0) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {items.slice(0, 2).map((n) => (
        <div key={n.key} className={`notice notice-${n.level}`}>
          <span>{n.text}</span>
          {n.action && <button className="notice-btn" onClick={n.action.run}>{n.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
