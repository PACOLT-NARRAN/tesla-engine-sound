import type { GarageItem } from '../garage/garage.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { getPack } from '../profiles/packs.ts';

/** Small controls shared by Garage cards and the engine detail. */
export function TierBadge({ item }: { item: GarageItem }) {
  const t = useT();
  const pack = getPack(item.packId);
  if (item.custom) return <span className="tier-badge tier-custom">{t('garage.tier.custom')}</span>;
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
  if (!p.audio.converted) return <span className="badge badge-synth">{t('engines.synthPreview')}</span>;
  if (item.custom) return <span className="badge badge-real">{t('garage.soundBorrowed')}</span>;
  return null;
}
