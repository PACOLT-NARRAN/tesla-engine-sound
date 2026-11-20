import { useState } from 'react';
import { ControlDock, type Panel } from '../components/ControlDock.tsx';
import { DebugOverlay } from '../components/DebugOverlay.tsx';
import { DemoPanel } from '../components/DemoPanel.tsx';
import { EngineSelector } from '../components/EngineSelector.tsx';
import { GearIndicator } from '../components/GearIndicator.tsx';
import { LoadMeters } from '../components/LoadMeters.tsx';
import { Notices } from '../components/Notices.tsx';
import { RevPedal } from '../components/RevPedal.tsx';
import { SettingsPanel } from '../components/SettingsPanel.tsx';
import { ShiftLights } from '../components/ShiftLights.tsx';
import { StatusStrip } from '../components/StatusStrip.tsx';
import { Tachometer } from '../components/Tachometer.tsx';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { isDebugEnabled } from '../hooks/useDebugFlag.ts';
import { useManualShift } from '../hooks/useManualShift.ts';
import { getProfile } from '../profiles/registry.ts';

const debug = isDebugEnabled();

export function CockpitPage() {
  const session = useSession();
  const s = useSessionState();
  const [panel, setPanel] = useState<Panel>(null);
  const profile = getProfile(s.profileId) ?? session.currentProfile;
  const close = () => setPanel(null);
  useManualShift(session, s.ignition === 'on');

  return (
    <div className={`cockpit ignition-${s.ignition}`}>
      <ShiftLights profile={profile} />
      <StatusStrip profileName={profile.name} />
      <main className="cluster">
        <section className="cluster-left">
          <GearIndicator />
        </section>
        <section className="cluster-center">
          <Tachometer profile={profile} units={s.units} />
        </section>
        <section className="cluster-right">
          <LoadMeters />
          <div className="profile-tag">
            <small>{profile.category}{profile.displacementL ? ` · ${profile.displacementL.toFixed(1)} L` : ''}</small>
            <span>{profile.name}</span>
            <small>REDLINE {profile.redlineRPM.toLocaleString('en-US')} · {profile.gearbox.gearRatios.length}-SPD</small>
          </div>
        </section>
      </main>
      <RevPedal />
      <Notices />
      <ControlDock onOpen={setPanel} profileName={profile.name} />
      {panel === 'engines' && <EngineSelector onClose={close} />}
      {panel === 'demo' && <DemoPanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} />}
      {debug && <DebugOverlay />}
    </div>
  );
}
