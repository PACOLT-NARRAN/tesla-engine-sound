import { useMemo, useState } from 'react';
import {
  LOCAL_CHALLENGES, achievementViews, collectionProgress, collections, type CollectionId,
} from '../engagement/achievements.ts';
import { NAME_MAX, buildShareCard, formatDuration, shareText, type ShareCard } from '../engagement/profileCard.ts';
import { currentStreak, driveProfilesUsed, enginesTried, favoriteEngine } from '../engagement/stats.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { Translator } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { ENGINE_CATALOG } from '../profiles/catalog.ts';
import { getPack } from '../profiles/packs.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { Sheet } from './Sheet.tsx';

type ShareMsg = 'shared' | 'copied' | 'manual' | null;

function collectionName(id: CollectionId, t: Translator): string {
  if (id.startsWith('pack:')) return getPack(id.slice(5))?.name[t.lang] ?? id.slice(5);
  return t.dyn(`coll.${id}`) ?? id;
}

function Bar({ current, target }: { current: number; target: number }) {
  return (
    <span className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={current}>
      <span style={{ width: `${Math.round((current / Math.max(1, target)) * 100)}%` }} />
    </span>
  );
}

/** Text copy that also works where the Clipboard API is missing (older in-car browsers). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The visual Garage card (also the local preview of what SHARE sends). */
function GarageCard({ card }: { card: ShareCard }) {
  const t = useT();
  return (
    <section className={`profile-card card-${card.theme}`} aria-label={t('profile.cardTitle')}>
      <small className="profile-card-kicker">{t('profile.cardTitle')}</small>
      <h3 className="profile-card-name">{card.displayName || t('profile.defaultName')}</h3>
      <dl className="profile-card-grid">
        <div><dt>{t('profile.vehicle')}</dt><dd>{card.vehicle || '—'}</dd></div>
        <div><dt>{t('profile.favoriteEngine')}</dt><dd>{card.favoriteEngine ?? '—'}</dd></div>
        <div><dt>{t('profile.driveTime')}</dt><dd>{formatDuration(card.driveSeconds, t)}</dd></div>
        <div><dt>{t('profile.collection')}</dt><dd>{card.enginesTried}<small>/{card.enginesTotal}</small></dd></div>
        <div><dt>{t('profile.achievements')}</dt><dd>{card.achievementsUnlocked}<small>/{card.achievementsTotal}</small></dd></div>
        <div><dt>{t('profile.streak')}</dt><dd>{t('profile.days', { n: card.streak })}</dd></div>
      </dl>
      {card.featured.length > 0 && (
        <div className="profile-card-badges">
          {card.featured.map((id) => <span key={id} className="ach-chip">{t.dyn(`ach.${id}.title`) ?? id}</span>)}
        </div>
      )}
    </section>
  );
}

/**
 * PROFILE: local statistics, achievements, collections, challenges and the share card.
 * All rules live in src/engagement (this component only displays them). Local device only.
 */
export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.userProfile.displayName);
  const [vehicle, setVehicle] = useState(s.userProfile.vehicle);
  const [msg, setMsg] = useState<ShareMsg>(null);
  const [manualText, setManualText] = useState<string | null>(null);

  const ctx = session.engagementContext();
  const today = ctx.today;
  const stats = s.stats;
  const tried = useMemo(() => new Set(enginesTried(stats)), [stats]);
  const favId = favoriteEngine(stats, (id) => session.findProfile(id) !== undefined) ?? s.favorites[0] ?? null;
  const favProfile = favId ? session.findProfile(favId) : undefined;
  const card = buildShareCard({
    profile: s.userProfile, stats, achievements: s.achievements,
    favoriteEngineTitle: favProfile ? engineTitle(favProfile) : null,
    enginesTotal: ENGINE_CATALOG.length, theme: s.theme, today,
  });
  const achievements = achievementViews(ctx, s.achievements);
  const challenges = LOCAL_CHALLENGES.list(ctx);
  const colls = collections(ENGINE_CATALOG);
  const usedDrives = driveProfilesUsed(stats);

  const saveProfile = () => {
    session.setUserProfile({ displayName: name, vehicle });
    setEditing(false);
  };

  const url = `${location.origin}${location.pathname}`;
  const share = async () => {
    setManualText(null);
    const text = shareText(card, t, url);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'REVLINE', text });
        setMsg('shared');
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (await copyText(text)) setMsg('copied');
    else {
      setManualText(text);
      setMsg('manual');
    }
  };
  const copy = async () => {
    const text = shareText(card, t, url);
    if (await copyText(text)) {
      setManualText(null);
      setMsg('copied');
    } else {
      setManualText(text);
      setMsg('manual');
    }
  };

  const stat = (label: string, value: string, key?: string) => (
    <div className="stat" key={key ?? label}><dt>{label}</dt><dd>{value}</dd></div>
  );

  return (
    <Sheet title={t('profile.title')} onClose={onClose}>
      <div className="profile">
        <div className="profile-top">
          <GarageCard card={card} />
          <div className="profile-side">
            {editing ? (
              <div className="profile-edit">
                <label className="studio-field">
                  <span className="studio-label">{t('profile.name')}</span>
                  <input value={name} maxLength={NAME_MAX} placeholder={t('profile.defaultName')} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="studio-field">
                  <span className="studio-label">{t('profile.vehicle')}</span>
                  <input value={vehicle} maxLength={NAME_MAX} placeholder="Model Y" list="revline-vehicles" onChange={(e) => setVehicle(e.target.value)} />
                  <datalist id="revline-vehicles">
                    {['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'].map((v) => <option key={v} value={v} />)}
                  </datalist>
                </label>
                <div className="profile-buttons">
                  <button className="btn btn-primary" onClick={saveProfile}>{t('profile.save')}</button>
                  <button className="btn" onClick={() => { setName(s.userProfile.displayName); setVehicle(s.userProfile.vehicle); setEditing(false); }}>{t('common.cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="profile-buttons">
                <button className="btn btn-primary" onClick={() => void share()}>{t('profile.share')}</button>
                <button className="btn" onClick={() => void copy()}>{t('profile.copy')}</button>
                <button className="btn" onClick={() => { setName(s.userProfile.displayName); setVehicle(s.userProfile.vehicle); setEditing(true); }}>{t('profile.edit')}</button>
              </div>
            )}
            {msg && <p className="profile-msg" role="status">{t(msg === 'shared' ? 'profile.msgShared' : msg === 'copied' ? 'profile.msgCopied' : 'profile.msgManual')}</p>}
            {manualText && <textarea className="profile-manual" readOnly value={manualText} rows={8} onFocus={(e) => e.currentTarget.select()} />}
            <p className="profile-local">{t('profile.localOnly')}</p>
            <p className="profile-local">{t('profile.shareSafe')}</p>
          </div>
        </div>

        <section className="profile-section">
          <h3>{t('profile.statsTitle')}</h3>
          <dl className="stat-grid">
            {stat(t('profile.driveTime'), formatDuration(stats.driveSeconds, t))}
            {stat(t('profile.gpsTime'), formatDuration(stats.gpsSeconds, t))}
            {stat(t('profile.demoTime'), formatDuration(stats.demoSeconds, t))}
            {stat(t('profile.sessions'), t.num(stats.sessions))}
            {stat(t('profile.activeDays'), t.num(stats.activeDays.length))}
            {stat(t('profile.streak'), t('profile.days', { n: currentStreak(stats.activeDays, today) }))}
            {stat(t('profile.bestStreak'), t('profile.days', { n: stats.bestStreak }))}
            {stat(t('profile.enginesTried'), `${tried.size}`)}
            {stat(t('profile.layoutsTried'), stats.layoutsTried.length ? stats.layoutsTried.map((l) => t.dyn(`garage.f.${l}`) ?? l).join(', ') : '—')}
            {stat(t('profile.drivesUsed'), usedDrives.length ? usedDrives.map((d) => t.dyn(`drive.${d}`) ?? d).join(', ') : '—')}
            {stat(t('profile.autoTime'), formatDuration(stats.autoSeconds, t))}
            {stat(t('profile.manualTime'), formatDuration(stats.manualSeconds, t))}
            {stat(t('profile.topRpm'), stats.maxRpm > 0 ? t('profile.rpm', { n: t.num(stats.maxRpm) }) : '—')}
            {stat(t('profile.created'), t.num(stats.enginesCreated))}
          </dl>
          <p className="setting-hint profile-rules">{t('profile.rules')}</p>
        </section>

        <section className="profile-section">
          <h3>{t('profile.achievementsTitle')} <small>{card.achievementsUnlocked}/{card.achievementsTotal}</small></h3>
          <div className="ach-grid">
            {achievements.map((a) => (
              <div key={a.id} className={`ach ${a.unlockedAt ? 'ach-on' : ''}`} data-ach={a.id}>
                <span className="ach-medal" aria-hidden="true">{a.unlockedAt ? '✓' : `${a.progress.current}/${a.progress.target}`}</span>
                <span className="ach-text">
                  <strong>{t.dyn(`ach.${a.id}.title`) ?? a.id}</strong>
                  <small>{t.dyn(`ach.${a.id}.desc`) ?? ''}</small>
                  {a.unlockedAt
                    ? <small className="ach-date">{t('profile.unlockedOn', { date: new Date(a.unlockedAt).toLocaleDateString(t.lang === 'cs' ? 'cs-CZ' : 'en-GB') })}</small>
                    : <Bar current={a.progress.current} target={a.progress.target} />}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-section">
          <h3>{t('profile.collectionsTitle')}</h3>
          <div className="coll-list">
            {colls.map((c) => {
              const p = collectionProgress(c, tried);
              return (
                <div key={c.id} className={`coll ${p.current >= p.target ? 'coll-done' : ''}`} data-coll={c.id}>
                  <span className="coll-name">{collectionName(c.id, t)}</span>
                  <Bar current={p.current} target={p.target} />
                  <span className="coll-count">{p.current}/{p.target}</span>
                </div>
              );
            })}
          </div>
          <p className="setting-hint profile-rules">{t('profile.collectionsHint')}</p>
        </section>

        <section className="profile-section">
          <h3>{t('profile.challengesTitle')}</h3>
          <div className="coll-list">
            {challenges.map((c) => (
              <div key={c.id} className={`coll ${c.done ? 'coll-done' : ''}`} data-challenge={c.id}>
                <span className="coll-name">
                  {t.dyn(`chal.${c.id}`, { collection: c.collection ? collectionName(c.collection, t) : '' }) ?? c.id}
                </span>
                <Bar current={c.progress.current} target={c.progress.target} />
                <span className="coll-count">{c.done ? '✓' : `${c.progress.current}/${c.progress.target}`}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-section">
          <h3>{t('profile.communityTitle')}</h3>
          <p className="profile-local">{t('profile.communityText')}</p>
        </section>
      </div>
    </Sheet>
  );
}
