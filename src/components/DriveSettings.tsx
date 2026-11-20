import { DRIVE_PROFILE_IDS } from '../drivetrain/driveProfiles.ts';
import { isDriveProfileLocked, hasCapability } from '../entitlements/entitlements.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

/** Settings → Drive profile (COMFORT / SPORT / TRACK) and Gearbox (automatic / manual). */
export function DriveSettings() {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const ent = s.entitlements;
  const selectedLocked = isDriveProfileLocked(ent, s.shiftStyle);
  const manualLocked = !hasCapability(ent, 'manual-shifting');
  const name = t(`drive.${s.shiftStyle}`);

  return (
    <section className="drive-settings" aria-label={t('settings.driveProfile')}>
      <h3 className="setting-title">{t('settings.driveProfile')}</h3>
      <div className="drive-cards" role="radiogroup" aria-label={t('settings.driveProfile')}>
        {DRIVE_PROFILE_IDS.map((id) => {
          const on = s.shiftStyle === id;
          const locked = isDriveProfileLocked(ent, id);
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              className={`drive-card drive-${id} ${on ? 'on' : ''}`}
              onClick={() => session.setShiftStyle(id)}
              data-drive={id}
            >
              <span className="drive-card-head">
                <strong>{t(`drive.${id}`)}</strong>
                {locked && <span className="tier-badge tier-pro">{t('settings.pro')}</span>}
              </span>
              <span className="drive-card-desc">{t(`drive.${id}.desc`)}</span>
            </button>
          );
        })}
      </div>
      {selectedLocked && <p className="setting-lock" role="status">{t('settings.lockedProfile', { name })}</p>}

      <div className="setting-row setting-row-hint">
        <span>{t('settings.transmission')}</span>
        <div className="segmented">
          {(['auto', 'manual'] as const).map((m) => (
            <button
              key={m}
              className={s.transmission === m ? 'on' : ''}
              aria-pressed={s.transmission === m}
              onClick={() => session.setTransmission(m)}
              data-transmission={m}
            >
              {t(`settings.transmission.${m}`)}
              {m === 'manual' && manualLocked && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="setting-hint">{t('settings.transmissionHint')}</p>
      {s.transmission === 'manual' && manualLocked && <p className="setting-lock" role="status">{t('settings.lockedManual')}</p>}
      {ent.earlyAccess && <p className="setting-early">{t('settings.earlyAccess')}</p>}
    </section>
  );
}
