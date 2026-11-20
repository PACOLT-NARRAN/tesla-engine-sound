import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { ENGINE_PROFILES, getProfile } from '../profiles/registry.ts';
import { engineDescription, engineInduction, engineLayout, engineSubtitle, engineTitle } from '../profiles/presentation.ts';
import type { EngineProfile } from '../types/profile.ts';
import { Sheet } from './Sheet.tsx';

export function EngineSelector({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const running = s.ignition === 'on';
  const select = (id: string) => void session.selectProfile(id);
  const resolve = (ids: readonly string[]) => ids.map(getProfile).filter((p): p is EngineProfile => p !== undefined);
  const favorites = resolve(s.favorites);
  const recent = resolve(s.recentEngines);

  const quick = (title: string, list: EngineProfile[], empty: string, testId: string) => (
    <div className="quick-group" data-testid={testId}>
      <h3 className="quick-title">{title}</h3>
      {list.length === 0 ? (
        <p className="quick-empty">{empty}</p>
      ) : (
        <div className="quick-list">
          {list.map((p) => (
            <button key={p.id} className={`quick-chip ${p.id === s.profileId ? 'selected' : ''}`} onClick={() => select(p.id)}>
              {engineTitle(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Sheet title={t('engines.title')} onClose={onClose}>
      <p className="sheet-hint">{running ? t('engines.hintRunning') : t('engines.hintOff')}</p>
      <div className="quick-row">
        {quick(t('engines.favorites'), favorites, t('engines.favoritesEmpty'), 'favorites')}
        {quick(t('engines.lastUsed'), recent, t('engines.recentEmpty'), 'recent')}
      </div>
      <h3 className="quick-title all-title">{t('engines.all')}</h3>
      <div className="engine-grid">
        {ENGINE_PROFILES.map((p) => {
          const selected = p.id === s.profileId;
          const fav = s.favorites.includes(p.id);
          const name = engineTitle(p);
          return (
            <div key={p.id} className={`engine-card ${selected ? 'selected' : ''}`} data-engine-id={p.id}>
              <button className="engine-card-main" onClick={() => select(p.id)} aria-pressed={selected}>
                <div className="engine-card-top">
                  <span className="badge">{engineLayout(p, t)}</span>
                  <span className={`badge ${p.audio.converted ? 'badge-real' : 'badge-synth'}`}>
                    {p.audio.converted ? t('engines.realAudio') : t('engines.synthPreview')}
                  </span>
                  {selected && <span className="engine-selected">{t('engines.selected')}</span>}
                </div>
                <h3>{name}</h3>
                <small className="engine-subtitle">{engineSubtitle(p, t)}</small>
                <p>{engineDescription(p, t)}</p>
                <dl>
                  <div><dt>{t('engines.redline')}</dt><dd>{t.num(p.redlineRPM)}</dd></div>
                  <div><dt>{t('engines.gears')}</dt><dd>{p.gearbox.gearRatios.length}</dd></div>
                  <div><dt>{t('engines.induction')}</dt><dd className="dd-text">{engineInduction(p, t)}</dd></div>
                </dl>
              </button>
              <button
                className={`fav-btn ${fav ? 'on' : ''}`}
                onClick={() => session.toggleFavorite(p.id)}
                aria-pressed={fav}
                aria-label={fav ? t('engines.removeFavorite', { name }) : t('engines.addFavorite', { name })}
              >
                {fav ? '♥' : '♡'}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
