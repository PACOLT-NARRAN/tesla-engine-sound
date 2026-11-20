import { useRef, useState } from 'react';
import { ControlDock, type Panel } from '../components/ControlDock.tsx';
import { DebugOverlay } from '../components/DebugOverlay.tsx';
import { DemoPanel } from '../components/DemoPanel.tsx';
import { DeveloperPanel } from '../components/DeveloperPanel.tsx';
import { Garage } from '../components/Garage.tsx';
import { GearIndicator } from '../components/GearIndicator.tsx';
import { LoadMeters } from '../components/LoadMeters.tsx';
import { Notices } from '../components/Notices.tsx';
import { RevPedal } from '../components/RevPedal.tsx';
import { ShiftPaddles } from '../components/ShiftPaddles.tsx';
import { SettingsPanel } from '../components/SettingsPanel.tsx';
import { ShiftLights } from '../components/ShiftLights.tsx';
import { StatusStrip } from '../components/StatusStrip.tsx';
import { Tachometer } from '../components/Tachometer.tsx';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { isDebugEnabled } from '../hooks/useDebugFlag.ts';
import { useManualShift } from '../hooks/useManualShift.ts';
import { useT } from '../i18n/useT.ts';
import { engineSubtitle, engineTitle } from '../profiles/presentation.ts';

const debug = isDebugEnabled();

export function CockpitPage() {
  const session = useSession();
  const s = useSessionState();
  const [panel, setPanel] = useState<Panel>(null);
  const profile = session.findProfile(s.profileId) ?? session.currentProfile;
  const close = () => setPanel(null);
  const t = useT();
  const name = engineTitle(profile);
  const trapRef = useRef<HTMLDivElement>(null);
  // Only listen for Drive input while no sheet is open and the engine runs.
  useManualShift(session, s.ignition === 'on' && panel === null, { diagnostics: debug, trap: trapRef, trapOn: s.scrollTrap });

  const cockpit = (
    <div className={`cockpit ignition-${s.ignition}`}>
      <ShiftLights profile={profile} />
      <StatusStrip profileName={name} />
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
            <span>{name}</span>
            <small>{engineSubtitle(profile, t)}</small>
          </div>
        </section>
      </main>
      <RevPedal />
      <ShiftPaddles />
      <Notices />
      <ControlDock onOpen={setPanel} profileName={name} developer={debug} />
      {panel === 'engines' && <Garage onClose={close} />}
      {panel === 'demo' && <DemoPanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} />}
      {debug && panel === 'developer' && <DeveloperPanel onClose={close} />}
      {debug && panel !== 'developer' && <DebugOverlay />}
    </div>
  );
  if (!s.scrollTrap) return cockpit;
  // Experimental (Developer Mode): a scroll container kept mid-way so native scrolling can be read.
  return (
    <div className="scroll-trap" ref={trapRef} tabIndex={-1}>
      <div className="scroll-trap-stage">{cockpit}</div>
      <div className="scroll-trap-spacer" aria-hidden="true" />
    </div>
  );
}
