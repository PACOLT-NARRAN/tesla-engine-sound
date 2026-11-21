import { useMemo, useRef, useState } from 'react';
import { ControlDock, type Panel } from '../components/ControlDock.tsx';
import { AchievementToast } from '../components/AchievementToast.tsx';
import { DebugOverlay } from '../components/DebugOverlay.tsx';
import { DemoPanel } from '../components/DemoPanel.tsx';
import { DeveloperPanel } from '../components/DeveloperPanel.tsx';
import { Garage } from '../components/Garage.tsx';
import { GearIndicator } from '../components/GearIndicator.tsx';
import { LoadMeters } from '../components/LoadMeters.tsx';
import { Notices } from '../components/Notices.tsx';
import { ProfilePanel } from '../components/ProfilePanel.tsx';
import { ShiftPaddles } from '../components/ShiftPaddles.tsx';
import { SettingsPanel } from '../components/SettingsPanel.tsx';
import { ShiftLights } from '../components/ShiftLights.tsx';
import { StatusStrip } from '../components/StatusStrip.tsx';
import { Tachometer } from '../components/Tachometer.tsx';
import { UpgradePanel } from '../components/UpgradePanel.tsx';
import { UpgradeContext, type UpgradeApi } from '../hooks/UpgradeContext.ts';
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
  const [upgrade, setUpgrade] = useState<{ pack?: string } | null>(null);
  // The engine that actually runs (a locked selection plays the fallback engine on a GPS drive).
  const profile = session.findProfile(s.activeEngine.id) ?? session.currentProfile;
  const close = () => setPanel(null);
  const upgradeApi = useMemo<UpgradeApi>(() => ({
    open: (pack) => setUpgrade(pack ? { pack } : {}),
    tryInDemo: (id) => {
      setUpgrade(null);
      setPanel(null);
      void session.tryInDemo(id);
    },
  }), [session]);
  const t = useT();
  const name = engineTitle(profile);
  const trapRef = useRef<HTMLDivElement>(null);
  // Only listen for Drive input while no sheet is open and the engine runs.
  useManualShift(session, s.ignition === 'on' && panel === null && upgrade === null, { diagnostics: debug, trap: trapRef, trapOn: s.scrollTrap });

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
      <ShiftPaddles />
      <Notices />
      {panel === null && upgrade === null && <AchievementToast />}
      <ControlDock onOpen={setPanel} profileName={name} developer={debug} />
      {panel === 'engines' && <Garage onClose={close} />}
      {panel === 'demo' && <DemoPanel onClose={close} />}
      {panel === 'profile' && <ProfilePanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} />}
      {debug && panel === 'developer' && <DeveloperPanel onClose={close} />}
      {debug && panel !== 'developer' && <DebugOverlay />}
      {upgrade && <UpgradePanel onClose={() => setUpgrade(null)} initialPack={upgrade.pack} />}
    </div>
  );
  const wrapped = <UpgradeContext.Provider value={upgradeApi}>{cockpit}</UpgradeContext.Provider>;
  if (!s.scrollTrap) return wrapped;
  // Experimental (Developer Mode): a scroll container kept mid-way so native scrolling can be read.
  return (
    <div className="scroll-trap" ref={trapRef} tabIndex={-1}>
      <div className="scroll-trap-stage">{wrapped}</div>
      <div className="scroll-trap-spacer" aria-hidden="true" />
    </div>
  );
}
