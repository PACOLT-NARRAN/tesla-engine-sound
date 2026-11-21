import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GARAGE_SORTS, buildItems, countByFilter, queryGarage, searchText,
  type GarageFilter, type GarageItem, type GarageSort,
} from '../garage/garage.ts';
import { searchLabels } from '../garage/labels.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { getCatalogEntry } from '../profiles/catalog.ts';
import { engineDescription, engineInduction, engineLayout, engineSubtitle } from '../profiles/presentation.ts';
import { canCreateCustomProfile } from '../entitlements/entitlements.ts';
import { defaultSpec, specFromProfile, type CustomEngineSpec } from '../studio/customEngine.ts';
import { EngineDetail } from './EngineDetail.tsx';
import { FavoriteButton, LockNote, PreviewButton, SoundBadge, TierBadge } from './GarageParts.tsx';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { SoundStudio } from './SoundStudio.tsx';
import { CommunityPanel } from './CommunityPanel.tsx';

/** Filter chips, grouped with a small gap between groups. */
const FILTER_GROUPS: readonly (readonly GarageFilter[])[] = [
  ['all', 'favorites', 'recent'],
  ['free', 'pro', 'pack'],
  ['na', 'turbo', 'supercharged'],
  ['v', 'inline', 'boxer', 'rotary'],
  ['custom'],
];
/**
 * REVLINE Garage: browse, search, filter, preview and select engines. Full-screen layer over
 * the Drive screen, so the running engine, audio and GPS are never interrupted.
 */
export function Garage({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [filter, setFilter] = useState<GarageFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<GarageSort>('recommended');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ spec: CustomEngineSpec; isNew: boolean } | null>(null);
  const [community, setCommunity] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const upgrade = useUpgrade();

  const items = useMemo(() => buildItems(session.allProfiles(), getCatalogEntry), [session, s.customEngines]);
  const texts = useMemo(() => new Map(items.map((i) => [i, searchText(i, searchLabels(i))])), [items]);
  const ctx = { favorites: s.favorites, recent: s.recentEngines };
  const list = queryGarage(items, { filter, query, sort }, ctx, (i) => texts.get(i) ?? '', s.locale);
  const counts = countByFilter(items, ctx);
  const detail = detailId === null ? undefined : items.find((i) => i.profile.id === detailId);
  const running = s.ignition !== 'off';

  // Stop a preview that is still playing when the Garage closes.
  useEffect(() => () => session.stopPreview(), [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || detailId !== null || studio !== null || community) return;
      if (query) setQuery('');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, query, onClose, studio, community]);

  const openStudio = (spec: CustomEngineSpec | null, isNew: boolean) => {
    session.stopPreview();
    setDetailId(null);
    setStudio({ spec: spec ?? defaultSpec(), isNew });
  };
  const editEngine = (id: string) => {
    const spec = s.customEngines.find((c) => c.id === id);
    if (spec) openStudio(spec, false);
  };
  const useAsBase = (item: GarageItem) => openStudio(specFromProfile(item.profile, t('studio.baseName', { name: item.title })), true);

  const resetFilters = () => {
    setFilter('all');
    setQuery('');
  };
  const emptyText = () => {
    if (query) return t('garage.empty');
    switch (filter) {
      case 'favorites': return t('garage.empty.favorites');
      case 'recent': return t('garage.empty.recent');
      case 'pro': return t('garage.empty.pro');
      case 'pack': return t('garage.empty.pack');
      case 'custom': return t('garage.empty.custom');
      default: return t('garage.empty');
    }
  };

  return (
    <div className="garage" role="dialog" aria-modal="true" aria-label={t('garage.title')}>
      <header className="garage-head">
        <button className="btn garage-back" onClick={onClose} aria-label={t('garage.backAria')}>← {t('garage.back')}</button>
        <h2>{t('garage.title')}</h2>
        <span className="garage-count" aria-live="polite">{t('garage.count', { count: list.length })}</span>
        <button className="btn btn-community" onClick={() => { session.stopPreview(); setCommunity(true); }} data-action="open-community">{t('community.open')}</button>
        <button className="btn btn-store" onClick={() => upgrade.open()} data-action="open-store">{t('store.open')}</button>
        <button className="btn btn-studio" onClick={() => openStudio(null, true)} data-action="new-engine">
          + {t('studio.open')}{!canCreateCustomProfile(s.entitlements) && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
        </button>
      </header>

      <div className="garage-tools">
        <div className="garage-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('garage.searchPlaceholder')}
            aria-label={t('garage.searchAria')}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="garage-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label={t('garage.clearSearch')}>✕</button>
          )}
        </div>
        <label className="garage-sort">
          <span>{t('garage.sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as GarageSort)}>
            {GARAGE_SORTS.map((o) => <option key={o} value={o}>{t(`garage.sort.${o}`)}</option>)}
          </select>
        </label>
      </div>

      <div className="garage-filters" role="toolbar" aria-label={t('garage.filtersAria')}>
        {FILTER_GROUPS.map((group, gi) => (
          <div className="filter-group" key={gi}>
            {group.map((f) => (
              <button
                key={f}
                className={`filter-chip ${filter === f ? 'on' : ''} ${counts[f] === 0 ? 'zero' : ''}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                data-filter={f}
              >
                {t(`garage.f.${f}`)} <span className="filter-count">{counts[f]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="garage-body">
        {running && <p className="sheet-hint garage-note">{t('garage.previewOff')}</p>}
        {list.length === 0 ? (
          <div className="garage-empty">
            <p>{emptyText()}</p>
            {filter === 'custom' && !query && <button className="btn btn-primary" onClick={() => openStudio(null, true)}>+ {t('studio.create')}</button>}
            {(filter !== 'all' || query) && <button className="btn" onClick={resetFilters}>{t('garage.emptyReset')}</button>}
          </div>
        ) : (
          <div className="garage-grid">
            {list.map((item) => (
              <GarageCard key={item.profile.id} item={item} onDetails={() => setDetailId(item.profile.id)} onEdit={() => editEngine(item.profile.id)} />
            ))}
          </div>
        )}
      </div>

      {detail && (
        <EngineDetail
          item={detail}
          onClose={() => setDetailId(null)}
          onDrive={() => {
            void session.selectProfile(detail.profile.id);
            setDetailId(null);
            onClose();
          }}
          onEdit={() => editEngine(detail.profile.id)}
          onUseAsBase={() => useAsBase(detail)}
        />
      )}

      {community && <CommunityPanel onClose={() => setCommunity(false)} />}

      {studio && (
        <SoundStudio
          key={studio.spec.id}
          initial={studio.spec}
          isNew={studio.isNew}
          onClose={() => setStudio(null)}
          onSaved={(id) => {
            setStudio(null);
            setDetailId(id);
          }}
        />
      )}
    </div>
  );
}

function GarageCard({ item, onDetails, onEdit }: { item: GarageItem; onDetails: () => void; onEdit: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const p = item.profile;
  const selected = p.id === s.profileId;
  const name = item.title;
  const allowed = session.canSelect(p.id);
  const locked = !item.custom && session.engineLock(p.id) !== null;
  const upgrade = useUpgrade();
  return (
    <article className={`g-card ${selected ? 'selected' : ''} ${locked ? 'g-card-locked' : ''}`} data-engine-id={p.id} data-custom={item.custom} data-locked={locked}>
      <div className="g-card-top">
        <TierBadge item={item} />
        <span className="badge">{engineLayout(p, t)}</span>
        <SoundBadge item={item} />
        <FavoriteButton id={p.id} name={name} />
      </div>
      <button className="g-card-main" onClick={onDetails} aria-label={t('garage.detailsAria', { name })}>
        <h3>{name}</h3>
        <small className="engine-subtitle">{engineSubtitle(p, t)}</small>
        <p>{engineDescription(p, t)}</p>
      </button>
      <dl className="g-specs">
        <div><dt>{t('garage.displacement')}</dt><dd>{p.displacementL === null ? '—' : t('engine.liters', { value: t.num(p.displacementL, 1, 1) })}</dd></div>
        <div><dt>{t('garage.maxRpm')}</dt><dd>{t.num(p.redlineRPM)}</dd></div>
        <div><dt>{t('garage.gears')}</dt><dd>{p.gearbox.gearRatios.length}</dd></div>
        <div className="g-spec-wide"><dt>{t('garage.induction')}</dt><dd>{engineInduction(p, t)}</dd></div>
      </dl>
      <div className="g-card-actions">
        <PreviewButton id={p.id} name={name} />
        {item.custom && <button className="btn" onClick={onEdit} aria-label={t('studio.editAria', { name })} data-action="edit">{t('studio.edit')}</button>}
        {locked && !selected ? (
          <button className="btn btn-primary" onClick={() => upgrade.tryInDemo(p.id)} data-action="try-demo">{t('store.tryDemo')}</button>
        ) : (
        <button
          className={`btn ${selected ? 'btn-selected' : 'btn-primary'}`}
          onClick={() => void session.selectProfile(p.id)}
          aria-pressed={selected}
          aria-label={t('garage.selectAria', { name })}
          disabled={!allowed && !selected}
        >
          {selected ? `✓ ${t('garage.selected')}` : t('garage.select')}
          {!allowed && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
        </button>
        )}
      </div>
      <LockNote item={item} compact />
    </article>
  );
}
