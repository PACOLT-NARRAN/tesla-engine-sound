import { useState } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { PROFILE_ISSUES } from '../profiles/registry.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { inputDiagnostics } from '../input/InputDiagnostics.ts';
import { InputDiagnosticsSection } from './InputDiagnosticsSection.tsx';
import { Sheet } from './Sheet.tsx';
import { ENGINE_PACKS } from '../profiles/packs.ts';
import { MOCK_MODES } from '../community/api.ts';

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
      settings: { units: s.units, gearing: s.gearing, driveProfile: s.shiftStyle, transmission: s.transmission, theme: s.theme, language: s.language, locale: s.locale },
      drive: { active: s.activeDrive, transmission: s.activeTransmission, entitlements: s.entitlements },
      session: { ignition: s.ignition, mode: s.mode, source: s.sourceStatus, motionQuality: s.motionQuality, audioStatus: s.audioStatus, audioIssue: s.audioIssue },
      // Speeds and quality only — never latitude/longitude.
      motion: { speed: m.speed, accel: m.accel, quality: m.quality, accuracy: m.raw.accuracy, speedSource: m.raw.speedSource, fixAge: m.fixAge },
      drivetrain: { gear: d.gear, rpm: Math.round(d.rpm), throttle: d.throttle, load: d.load, manualOffset: d.manualOffset },
      audio: { context: a.contextState, sampleRate: a.sampleRate },
      storage,
      // Totals only (no positions); see src/engagement/stats.ts.
      statistics: { ...s.stats, achievements: Object.keys(s.achievements.unlocked) },
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
        <h3>Entitlements</h3>
        <table className="dev-table">
          <tbody>
            <tr><th>plan</th><td>{s.entitlements.plan}{s.entitlements.earlyAccess ? ' (early access)' : ''}{s.entitlements.simulated ? ' (simulated)' : ''}</td></tr>
            <tr><th>owned packs</th><td>{s.entitlements.ownedPackIds.join(', ') || '—'}</td></tr>
            <tr><th>engine</th><td>selected {s.profileId} → running {s.activeEngine.id}{s.activeEngine.locked ? (s.activeEngine.preview ? ' (locked, demo preview)' : ' (locked, fallback)') : ''}</td></tr>
            <tr><th>drive profile</th><td>selected {s.shiftStyle} → running {s.activeDrive.id}{s.activeDrive.locked ? (s.activeDrive.preview ? ' (locked, demo preview)' : ' (locked, fallback)') : ''}</td></tr>
            <tr><th>gearbox</th><td>selected {s.transmission} → running {s.activeTransmission}</td></tr>
          </tbody>
        </table>
        <div className="setting-row">
          <span>Simulate plan</span>
          <div className="segmented" data-testid="plan-sim">
            {(['auto', 'free', 'pro'] as const).map((p) => (
              <button key={p} className={s.planOverride === p ? 'on' : ''} aria-pressed={s.planOverride === p} onClick={() => session.setPlanOverride(p)}>{p.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>Simulate owned packs</span>
          <div className="segmented" data-testid="pack-sim">
            {ENGINE_PACKS.map((p) => {
              const on = s.simulatedPacks.includes(p.id);
              return <button key={p.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => session.setSimulatedPack(p.id, !on)}>{p.name.en}</button>;
            })}
          </div>
        </div>
        <p className="sheet-hint">Development simulation only: works with plan FREE or PRO (AUTO = early access, everything unlocked). Local flags are not payment security — editing localStorage changes what the UI unlocks.</p>
        <h3>Community mock</h3>
        <div className="setting-row">
          <span>Simulate Marketplace state</span>
          <div className="segmented" data-testid="community-sim">
            {MOCK_MODES.map((m) => (
              <button key={m} className={s.communityMock === m ? 'on' : ''} aria-pressed={s.communityMock === m} onClick={() => session.setCommunityMock(m)}>{m.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <p className="sheet-hint">Not saved. Installed community items: {Object.entries(s.community.installed).map(([id, r]) => `${id}@${r.version}`).join(', ') || 'none'}. Local ratings: {Object.keys(s.community.ratings).length}.</p>
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
        <h3>Statistics (local, raw)</h3>
        <p className="sheet-hint">Saved every 15 s while driving, on milestones and on ENGINE OFF. Achievements: {Object.keys(s.achievements.unlocked).join(', ') || 'none'}.</p>
        <pre className="dev-pre" data-testid="dev-stats">{JSON.stringify(s.stats, null, 1)}</pre>
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
