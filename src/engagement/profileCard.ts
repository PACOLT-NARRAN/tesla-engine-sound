import type { Translator } from '../i18n/index.ts';
import { asRecord, type StoredSchema } from '../storage/storage.ts';
import { ACHIEVEMENT_IDS, recentAchievements, type AchievementId, type AchievementState } from './achievements.ts';
import { currentStreak, enginesTried, type Statistics } from './stats.ts';

/**
 * Local user profile (display name, vehicle) and the shareable Garage card (pure, unit tested).
 *
 * The card is built from an explicit allow-list of fields. It can NEVER contain a position,
 * route, home location, diagnostics, audio files or browser identifiers: none of these are
 * inputs to the functions below.
 */

export const NAME_MAX = 24;

export interface UserProfile {
  displayName: string;
  /** Model or nickname, e.g. "Model Y". */
  vehicle: string;
}

/** Trims, removes control characters, limits the length. */
export function cleanText(v: unknown, max = NAME_MAX): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const USER_PROFILE_SCHEMA: StoredSchema<UserProfile> = {
  key: 'revline.profile.v1',
  version: 1,
  defaults: () => ({ displayName: '', vehicle: '' }),
  sanitize: (data) => {
    const r = asRecord(data);
    return { displayName: cleanText(r.displayName), vehicle: cleanText(r.vehicle) };
  },
};

/** Exactly the data a shared card may contain. */
export interface ShareCard {
  displayName: string;
  vehicle: string;
  favoriteEngine: string | null;
  driveSeconds: number;
  enginesTried: number;
  enginesTotal: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  /** Newest achievements, at most three. */
  featured: AchievementId[];
  streak: number;
  theme: 'dark' | 'light';
}

export function buildShareCard(x: {
  profile: UserProfile;
  stats: Statistics;
  achievements: AchievementState;
  favoriteEngineTitle: string | null;
  enginesTotal: number;
  theme: 'dark' | 'light';
  today: string;
}): ShareCard {
  const unlocked = recentAchievements(x.achievements);
  return {
    displayName: x.profile.displayName,
    vehicle: x.profile.vehicle,
    favoriteEngine: x.favoriteEngineTitle,
    driveSeconds: Math.floor(x.stats.driveSeconds),
    enginesTried: enginesTried(x.stats).length,
    enginesTotal: x.enginesTotal,
    achievementsUnlocked: unlocked.length,
    achievementsTotal: ACHIEVEMENT_IDS.length,
    featured: unlocked.slice(0, 3),
    streak: currentStreak(x.stats.activeDays, x.today),
    theme: x.theme,
  };
}

/** "14 h 32 min" / "32 min" / "0 min". */
export function formatDuration(seconds: number, t: Translator): string {
  const total = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t('profile.durationHm', { h: t.num(h), m }) : t('profile.durationM', { m });
}

/** Plain-text version for Web Share / clipboard. `url` is the public app address (no query). */
export function shareText(card: ShareCard, t: Translator, url: string): string {
  const lines = [
    `REVLINE — ${card.displayName || t('profile.defaultName')}`,
  ];
  if (card.vehicle) lines.push(`${t('profile.vehicle')}: ${card.vehicle}`);
  if (card.favoriteEngine) lines.push(`${t('profile.favoriteEngine')}: ${card.favoriteEngine}`);
  lines.push(`${t('profile.driveTime')}: ${formatDuration(card.driveSeconds, t)}`);
  lines.push(`${t('profile.collection')}: ${t('profile.ofEngines', { n: card.enginesTried, total: card.enginesTotal })}`);
  const featured = card.featured.map((id) => t.dyn(`ach.${id}.title`) ?? id).join(', ');
  lines.push(`${t('profile.achievements')}: ${card.achievementsUnlocked}/${card.achievementsTotal}${featured ? ` — ${featured}` : ''}`);
  lines.push(`${t('profile.streak')}: ${t('profile.days', { n: card.streak })}`);
  lines.push(`${t('profile.cardTheme')}: ${card.theme === 'light' ? t('settings.theme.light') : t('settings.theme.dark')}`);
  if (url) lines.push(url);
  return lines.join('\n');
}
