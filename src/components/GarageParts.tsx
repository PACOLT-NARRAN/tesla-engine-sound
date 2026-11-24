import type { GarageItem } from '../garage/garage.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { getPack } from '../profiles/packs.ts';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { isCommunityEngineId } from '../community/install.ts';

/** Small controls shared by Garage cards and the engine detail. */
export function TierBadge({ item }: { item: GarageItem }) {
  const t = useT();
  const pack = getPack(item.packId);
  if (item.custom) return <span className="tier-badge tier-custom">{t(isCommunityEngineId(item.profile.id) ? 'garage.tier.community' : 'garage.tier.custom')}</span>;
  const label = item.tier === 'pack' && pack ? pack.name[t.lang] : t(`garage.tier.${item.tier}`);
  return <span className={`tier-badge tier-${item.tier}`}>{label}</span>;
}

export function FavoriteButton({ id, name }: { id: string; name: string }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const fav = s.favorites.includes(id);
  return (
    <button
      className={`fav-btn ${fav ? 'on' : ''}`}
      onClick={() => session.toggleFavorite(id)}
      aria-pressed={fav}
      aria-label={fav ? t('engines.removeFavorite', { name }) : t('engines.addFavorite', { name })}
    >
      {fav ? '♥' : '♡'}
    </button>
  );
}

export function PreviewButton({ id, name }: { id: string; name: string }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const mine = s.preview?.id === id ? s.preview.status : null;
  const label = mine === 'loading' ? t('garage.previewLoading') : mine === 'playing' ? t('garage.previewStop') : t('garage.preview');
  return (
    <button
      className={`btn btn-preview ${mine ? 'on' : ''}`}
      onClick={() => void session.previewEngine(id)}
      disabled={s.ignition !== 'off'}
      aria-label={t('garage.previewAria', { name })}
      aria-pressed={mine !== null}
    >
      {label}
    </button>
  );
}

/** Sound source line of an engine: recorded bank, borrowed bank (Sound Studio) or synthesiser. */
export function SoundBadge({ item }: { item: GarageItem }) {
  const t = useT();
  const p = item.profile;
  if (p.audio.music) return <span className="badge badge-music">{t('garage.soundMusic')}</span>;
  if (p.audio.voice) return <span className="badge badge-voice">{t('garage.soundVoice')}</span>;
  if (!p.audio.converted) return <span className="badge badge-synth">{t('engines.synthPreview')}</span>;
  if (item.custom) return <span className="badge badge-real">{t('garage.soundBorrowed')}</span>;
  return null;
}

/**
 * Lock explanation of a built-in engine that may not be driven on GPS yet: what is locked, how
 * to try it (Garage preview, Demo) and a button to the PRO / pack screen. Null when unlocked.
 */
export function LockNote({ item, compact = false }: { item: GarageItem; compact?: boolean }) {
  const session = useSession();
  useSessionState();
  const t = useT();
  const upgrade = useUpgrade();
  const lock = item.custom ? null : session.engineLock(item.profile.id);
  if (lock === null) return null;
  const pack = getPack(item.packId);
  const text = lock === 'pack' && pack ? t('garage.lock.pack', { pack: pack.name[t.lang] }) : t('garage.lock.pro');
  return (
    <div className={`lock-note ${compact ? 'lock-note-compact' : ''}`} data-lock={lock}>
      <span>{compact ? t('garage.lock.short') : text}</span>
      <button className="btn btn-unlock" onClick={() => upgrade.open(lock === 'pack' ? item.packId ?? undefined : undefined)} data-action="unlock">
        {lock === 'pack' ? t('garage.unlockPack') : t('garage.unlockPro')}
      </button>
    </div>
  );
}
