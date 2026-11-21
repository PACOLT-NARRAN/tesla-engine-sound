import { useState } from 'react';
import type { ResetScope } from '../core/EngineSession.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { DriveSettings } from './DriveSettings.tsx';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { Sheet } from './Sheet.tsx';

/** Segmented control with one button per option. */
function Segmented<T extends string>({ value, options, onPick }: { value: T; options: readonly { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'on' : ''} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

const RESETS: readonly { scope: ResetScope; label: MessageKey }[] = [
  { scope: 'favorites', label: 'settings.resetFavorites' },
  { scope: 'recent', label: 'settings.resetRecent' },
  { scope: 'stats', label: 'settings.resetStats' },
  { scope: 'all', label: 'settings.resetAll' },
];

/** User settings only. Developer tools live in the Developer panel (?debug=1). */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [confirm, setConfirm] = useState<ResetScope | null>(null);
  const [done, setDone] = useState<ResetScope | null>(null);
  const upgrade = useUpgrade();

  return (
    <Sheet title={t('settings.title')} onClose={onClose}>
      <div className="settings">
        <button className="store-entry" onClick={() => upgrade.open()} data-action="open-store">
          <span>
            <strong>{t('store.entryTitle')}</strong>
            <small>{t(s.entitlements.simulated ? 'store.entrySim' : s.entitlements.earlyAccess ? 'store.entryEarly' : s.entitlements.plan === 'pro' ? 'store.entryPro' : 'store.entryFree')}</small>
          </span>
          <span className="store-entry-go">›</span>
        </button>
        <div className="setting-row">
          <span>{t('settings.units')}</span>
          <Segmented value={s.units} onPick={(u) => session.setUnits(u)} options={[{ id: 'kmh', label: 'KM/H' }, { id: 'mph', label: 'MPH' }]} />
        </div>
        <div className="setting-row">
          <span>{t('settings.language')}</span>
          <Segmented value={s.locale} onPick={(l) => session.setLanguage(l)} options={[{ id: 'en', label: 'ENGLISH' }, { id: 'cs', label: 'ČEŠTINA' }]} />
        </div>
        <div className="setting-row setting-row-hint">
          <span>{t('settings.gearing')}</span>
          <Segmented
            value={s.gearing}
            onPick={(g) => session.setGearing(g)}
            options={[
              { id: 'fun', label: t('settings.gearing.fun') },
              { id: 'normal', label: t('settings.gearing.normal') },
              { id: 'real', label: t('settings.gearing.real') },
            ]}
          />
        </div>
        <p className="setting-hint">{t('settings.gearingHint')}</p>
        <DriveSettings />
        <div className="setting-row">
          <span>{t('settings.theme')}</span>
          <Segmented
            value={s.theme}
            onPick={(v) => session.setTheme(v)}
            options={[{ id: 'dark', label: t('settings.theme.dark') }, { id: 'light', label: t('settings.theme.light') }]}
          />
        </div>
        <div className="setting-row">
          <span>{t('settings.volume')}</span>
          <input type="range" min={0} max={1} step={0.01} value={s.volume} aria-label={t('settings.volume')} onChange={(e) => session.setVolume(Number(e.target.value))} />
        </div>

        <div className="setting-data">
          <h3>{t('settings.data')}</h3>
          <p className="setting-hint">{t('settings.dataHint')}</p>
          {confirm === null ? (
            <div className="data-actions">
              {RESETS.map((r) => (
                <button key={r.scope} className={`btn ${r.scope === 'all' ? 'btn-danger' : ''}`} onClick={() => { setDone(null); setConfirm(r.scope); }}>
                  {t(r.label)}
                </button>
              ))}
            </div>
          ) : (
            <div className="data-confirm" role="alertdialog" aria-label={t('settings.confirmReset')}>
              <p>{t(RESETS.find((r) => r.scope === confirm)?.label ?? 'settings.resetAll')} — {t('settings.confirmReset')}</p>
              <div className="data-actions">
                <button className="btn btn-danger" onClick={() => { session.resetLocalData(confirm); setDone(confirm); setConfirm(null); }}>{t('settings.confirmYes')}</button>
                <button className="btn" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
          {done && <p className="setting-hint" role="status">{t('settings.resetDone')}</p>}
        </div>

        <div className="setting-note">
          <h3>{t('settings.privacyTitle')}</h3>
          <p>{t('settings.privacy')}</p>
          <h3>{t('settings.manualTitle')}</h3>
          <p>{t('settings.manual')}</p>
          <h3>{t('settings.safetyTitle')}</h3>
          <p>{t('settings.safety')}</p>
          <h3>{t('settings.audioTitle')}</h3>
          <p>{t('settings.audio')}</p>
        </div>
      </div>
    </Sheet>
  );
}
