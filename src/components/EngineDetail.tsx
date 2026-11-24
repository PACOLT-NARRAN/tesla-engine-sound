import type { GarageItem } from '../garage/garage.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { getPack } from '../profiles/packs.ts';
import { engineDescription, engineInduction, engineLayout, engineSubtitle, engineTitle } from '../profiles/presentation.ts';
import { getProfile } from '../profiles/registry.ts';
import { FavoriteButton, LockNote, PreviewButton, SoundBadge, TierBadge } from './GarageParts.tsx';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { Sheet } from './Sheet.tsx';
import { canCreateCustomProfile } from '../entitlements/entitlements.ts';

/** Engine details inside the Garage: full technical data and the main actions. */
export function EngineDetail({ item, onClose, onDrive, onEdit, onUseAsBase }: {
  item: GarageItem; onClose: () => void; onDrive: () => void; onEdit: () => void; onUseAsBase: () => void;
}) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const p = item.profile;
  const selected = s.profileId === p.id;
  const pack = getPack(item.packId);
  const gb = p.gearbox;
  const rpm = (v: number) => t('garage.rpmUnit', { rpm: t.num(v) });
  const allowed = session.canSelect(p.id);
  const locked = !item.custom && session.engineLock(p.id) !== null;
  const upgrade = useUpgrade();
  const edited = !item.custom && canCreateCustomProfile(s.entitlements) && s.customEngines.some((c) => c.overrides === p.id);
  const borrowed = item.custom && p.audio.converted ? getProfile(p.source.soundName) : undefined;
  const sound = borrowed ? t('garage.spec.soundBorrowed', { name: engineTitle(borrowed) }) : p.audio.converted ? t('garage.spec.soundReal') : p.audio.music ? t('garage.spec.soundMusic') : p.audio.voice ? t('garage.spec.soundVoice') : t('garage.spec.soundSynth');

  const rows: [string, string][] = p.audio.music ? [
    [t('garage.spec.sound'), sound],
    [t('garage.spec.music'), t('garage.spec.musicHow')],
    [t('garage.spec.tier'), t(`garage.tier.${item.tier}`)],
  ] : [
    [t('garage.layout'), engineLayout(p, t)],
    [t('garage.spec.cylinders'), String(p.cylinders)],
    [t('garage.displacement'), p.displacementL === null ? '—' : t('engine.liters', { value: t.num(p.displacementL, 1, 1) })],
    [t('garage.induction'), engineInduction(p, t)],
    [t('garage.spec.idle'), rpm(p.idleRPM)],
    [t('garage.spec.redline'), rpm(p.redlineRPM)],
    [t('garage.spec.limiter'), rpm(p.limiterRPM)],
    [t('garage.spec.gearbox'), t('garage.spec.gearboxValue', { gears: gb.gearRatios.length })],
    [t('garage.spec.ratios'), gb.gearRatios.map((r) => t.num(r, 2, 2)).join(' · ')],
    [t('garage.spec.finalDrive'), t.num(gb.finalDrive, 2, 2)],
    [t('garage.spec.sound'), sound],
    [t('garage.spec.tier'), item.custom ? t('garage.tier.custom') : t(`garage.tier.${item.tier}`)],
  ];
  if (pack) rows.push([t('garage.spec.pack'), pack.name[t.lang]]);
  if (item.meta) {
    rows.push([t('garage.spec.origin'), t(`origin.${item.meta.origin}`)]);
    if (item.meta.tags.length) rows.push([t('garage.spec.tags'), item.meta.tags.join(', ')]);
  }

  return (
    <Sheet title={item.title} onClose={onClose}>
      <div className="engine-detail" data-engine-id={p.id}>
        <div className="g-card-top">
          <TierBadge item={item} />
          <span className="badge">{engineLayout(p, t)}</span>
          <SoundBadge item={item} />
          {edited && <span className="badge badge-edited">{t('studio.editedBadge')}</span>}
          <FavoriteButton id={p.id} name={item.title} />
        </div>
        <p className="detail-subtitle">{engineSubtitle(p, t)}</p>
        <p className="detail-desc">{engineDescription(p, t)}</p>
        <div className="detail-actions">
          <PreviewButton id={p.id} name={item.title} />
          {!selected && allowed && <button className="btn" onClick={() => void session.selectProfile(p.id)}>{t('garage.select')}</button>}
          {locked ? (
            <button className="btn btn-primary" onClick={() => upgrade.tryInDemo(p.id)} data-action="try-demo">{t('store.tryDemo')}</button>
          ) : (
            <button className="btn btn-primary" onClick={onDrive} disabled={!allowed}>
              {t('garage.drive')}{!allowed && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
            </button>
          )}
        </div>
        <div className="detail-actions detail-studio">
          {p.audio.music ? null : item.custom
            ? <button className="btn" onClick={onEdit} data-action="edit">{t('studio.editLong')}</button>
            : (
              <>
                <button className="btn btn-studio" onClick={onUseAsBase} data-action="edit-builtin">
                  ✎ {t('studio.editBuiltin')}{!canCreateCustomProfile(s.entitlements) && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
                </button>
                {edited && <button className="btn" onClick={() => void session.restoreOriginal(p.id)} data-action="restore">{t('studio.restore')}</button>}
              </>
            )}
        </div>
        {edited && <p className="sheet-hint" data-testid="edited-note">{t('studio.editedNote')}</p>}
        {!allowed && <p className="setting-lock">{t('studio.lockedDrive')}</p>}
        <LockNote item={item} />
        {s.ignition !== 'off' && <p className="sheet-hint">{t('garage.previewOff')}</p>}
        <h3 className="detail-title">{t('garage.spec.title')}</h3>
        <table className="spec-table">
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
