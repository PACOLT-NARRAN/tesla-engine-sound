import { useState } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { PROFILE_ISSUES } from '../profiles/registry.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { inputDiagnostics } from '../input/InputDiagnostics.ts';
import { InputDiagnosticsSection } from './InputDiagnosticsSection.tsx';
import { Sheet } from './Sheet.tsx';

/**
 * Developer Mode panel, reachable only with ?debug=1 (never from normal Settings).
 * English only on purpose. Shows internal ids, storage schema state and profile load errors,
 * and exports a diagnostics snapshot WITHOUT coordinates.
 */
export function DeveloperPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const profile = session.currentProfile;
  const storage = [...session.storageReport()].map(([key, r]) => ({ key, ...r }));
  const normalHref = location.pathname;

  const snapshot = () => {
    const m = session.telemetry.motion;
    const d = session.telemetry.drivetrain;
    const a = session.audioDebug();
    return {
      app: 'REVLINE',
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      engine: { id: profile.id, displayName: engineTitle(profile), converted: profile.audio.converted, bankKind: s.bankKind },
      settings: { units: s.units, gearing: s.gearing, shiftStyle: s.shiftStyle, theme: s.theme, language: s.language, locale: s.locale },
      session: { ignition: s.ignition, mode: s.mode, source: s.sourceStatus, motionQuality: s.motionQuality, audioStatus: s.audioStatus, audioIssue: s.audioIssue },
      // Speeds and quality only — never latitude/longitude.
      motion: { speed: m.speed, accel: m.accel, quality: m.quality, accuracy: m.raw.accuracy, speedSource: m.raw.speedSource, fixAge: m.fixAge },
      drivetrain: { gear: d.gear, rpm: Math.round(d.rpm), throttle: d.throttle, load: d.load, manualOffset: d.manualOffset },
      audio: { context: a.contextState, sampleRate: a.sampleRate },
      storage,
      profileIssues: PROFILE_ISSUES,
      input: { scrollTrap: s.scrollTrap, summary: inputDiagnostics.summary(), log: inputDiagnostics.toText().split('\n').slice(-60) },
    };
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot(), null, 2));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  return (
    <Sheet title="Developer Mode" onClose={onClose}>
      <div className="dev-panel">
        <p className="sheet-hint">Active because the URL contains ?debug=1. The diagnostics overlay is shown on the Drive screen. Nothing here is sent anywhere.</p>
        <h3>Active engine</h3>
        <table className="dev-table">
          <tbody>
            <tr><th>internal id</th><td>{profile.id}</td></tr>
            <tr><th>display name</th><td>{engineTitle(profile)}</td></tr>
            <tr><th>profile name</th><td>{profile.name}</td></tr>
            <tr><th>sound bank</th><td>{profile.audio.converted ? profile.audio.manifest : 'placeholder synth'} ({s.bankKind ?? '—'})</td></tr>
            <tr><th>audio issue</th><td>{s.audioIssue ? (s.audioIssue.kind === 'bank-failed' ? s.audioIssue.detail : s.audioIssue.kind) : '—'}</td></tr>
          </tbody>
        </table>
        <InputDiagnosticsSection />
        <h3>Local storage</h3>
        <table className="dev-table">
          <thead><tr><th>key</th><th>schema</th><th>stored</th><th>last load</th></tr></thead>
          <tbody>
            {storage.map((r) => (
              <tr key={r.key}><td>{r.key}</td><td>v{r.version}</td><td>{r.storedVersion === null ? '—' : `v${r.storedVersion}`}</td><td>{r.outcome}</td></tr>
            ))}
          </tbody>
        </table>
        <h3>Profile load errors</h3>
        {PROFILE_ISSUES.length === 0 ? <p>None.</p> : PROFILE_ISSUES.map((i) => <p key={i.file}>{i.file}: {i.message}</p>)}
        <div className="data-actions">
          <button className="btn" onClick={() => void copy()}>COPY DIAGNOSTICS</button>
          <a className="btn" href={normalHref}>EXIT DEVELOPER MODE</a>
        </div>
        {copied && <p role="status">{copied === 'ok' ? 'Copied to clipboard.' : 'Clipboard not available in this browser.'}</p>}
      </div>
    </Sheet>
  );
}
