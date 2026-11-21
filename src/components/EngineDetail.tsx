import type { GarageItem } from '../garage/garage.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { getPack } from '../profiles/packs.ts';
import { engineDescription, engineInduction, engineLayout, engineSubtitle, engineTitle } from '../profiles/presentation.ts';
import { getProfile } from '../profiles/registry.ts';
import { FavoriteButton, LockNote, PreviewButton, SoundBadge, TierBadge } from './GarageParts.tsx';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { Sheet } from './Sheet.tsx';

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
  const borrowed = item.custom && p.audio.converted ? getProfile(p.source.soundName) : undefined;
  const sound = borrowed ? t('garage.spec.soundBorrowed', { name: engineTitle(borrowed) }) : p.audio.converted ? t('garage.spec.soundReal') : t('garage.spec.soundSynth');

  const rows: [string, string][] = [
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
          {item.custom
            ? <button className="btn" onClick={onEdit} data-action="edit">{t('studio.editLong')}</button>
            : <button className="btn" onClick={onUseAsBase} data-action="use-as-base">{t('studio.useAsBase')}</button>}
        </div>
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
