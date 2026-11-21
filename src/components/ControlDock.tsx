import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

export type Panel = 'engines' | 'demo' | 'profile' | 'settings' | 'developer' | null;

interface Props {
  onOpen: (p: Panel) => void;
  profileName: string;
  /** Developer Mode (?debug=1) only. */
  developer?: boolean;
}

export function ControlDock({ onOpen, profileName, developer = false }: Props) {
  const session = useSession();
  const s = useSessionState();
  const on = s.ignition !== 'off';
  const t = useT();

  return (
    <nav className={`dock ${on ? 'dock-driving' : ''}`}>
      <button
        className={`ignition ${s.ignition}`}
        onClick={() => void session.toggleIgnition()}
        aria-pressed={on}
      >
        <span className="ignition-ring" />
        <span className="ignition-label">
          {s.ignition === 'off' ? <>{t('dock.startEngine1')}<br />{t('dock.startEngine2')}</> : s.ignition === 'starting' ? <>{t('dock.cranking')}<br />…</> : <>{t('dock.engineOff1')}<br />{t('dock.engineOff2')}</>}
        </span>
      </button>

      <button className="dock-btn engine-btn" onClick={() => onOpen('engines')}>
        <small>{t('dock.engine')}</small>
        <span>{profileName}</span>
      </button>

      <button className={`dock-btn ${s.mode === 'demo' && on ? 'active' : ''}`} onClick={() => onOpen('demo')}>
        <small>{t('dock.mode')}</small>
        <span>{s.mode === 'demo' && on ? t('dock.modeDemo') : t('dock.modeGps')}</span>
      </button>

      <button className="dock-btn profile-btn" onClick={() => onOpen('profile')}>
        <small>{t('dock.profile')}</small>
        <span>{s.userProfile.displayName || t('dock.profileDefault')}</span>
      </button>

      <label className="dock-volume">
        <small>{t('dock.vol')}</small>
        <input
          type="range" min={0} max={1} step={0.01} value={s.volume}
          onChange={(e) => session.setVolume(Number(e.target.value))}
          aria-label={t('dock.volumeAria')}
        />
      </label>

      {developer && (
        <button className="dock-btn dev-btn" onClick={() => onOpen('developer')} aria-label="Developer Mode">
          <small>DEV</small>
          <span>⚙︎</span>
        </button>
      )}

      <button className="dock-btn icon" onClick={() => onOpen('settings')} aria-label={t('dock.settingsAria')}>
        <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>
      </button>
    </nav>
  );
}
