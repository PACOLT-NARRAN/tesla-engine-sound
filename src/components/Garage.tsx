import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GARAGE_KINDS, GARAGE_SORTS, buildItems, countByFilter, packChips, queryGarage, scopeItems, searchText,
  type AnyFilter, type GarageFilter, type GarageItem, type GarageKind, type GarageSort, type GarageView,
} from '../garage/garage.ts';
import { ENGINE_PACKS } from '../profiles/packs.ts';
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
import { getProfile } from '../profiles/registry.ts';
import { getMusicStyle } from '../audio/music/musicStyles.ts';
import { getPack } from '../profiles/packs.ts';
import { CommunityPanel } from './CommunityPanel.tsx';

/** Filter chips of the "All" and "Engines" tabs, grouped with a small gap between groups. */
const FILTER_GROUPS: readonly (readonly GarageFilter[])[] = [
  ['all', 'favorites', 'recent'],
  ['free', 'pro', 'pack'],
  ['na', 'turbo', 'supercharged'],
  ['v', 'inline', 'boxer', 'rotary'],
  ['custom'],
];
/** Fun / Music tabs: the basic chips, then one shortcut chip per pack. */
const BASIC_GROUP: readonly GarageFilter[] = ['all', 'favorites', 'recent'];
const PACK_ORDER = ENGINE_PACKS.map((p) => p.id);
/**
 * REVLINE Garage: browse, search, filter, preview and select engines. Full-screen layer over
 * the Drive screen, so the running engine, audio and GPS are never interrupted.
 */
export function Garage({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [filter, setFilter] = useState<AnyFilter>('all');
  const [view, setViewState] = useState<GarageView>(() => session.garageView());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const setView = (patch: Partial<GarageView>) => {
    const next = { ...view, ...patch };
    setViewState(next);
    session.setGarageView(next);
  };
  const setKind = (kind: GarageKind) => {
    setView({ kind });
    setFilter('all');
  };
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<GarageSort>('recommended');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ spec: CustomEngineSpec; isNew: boolean; base?: { id: string; title: string } } | null>(null);
  const [community, setCommunity] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const upgrade = useUpgrade();

  const items = useMemo(() => buildItems(session.allProfiles(), getCatalogEntry), [session, s.customEngines]);
  const texts = useMemo(() => new Map(items.map((i) => [i, searchText(i, searchLabels(i))])), [items]);
  const ctx = { favorites: s.favorites, recent: s.recentEngines };
  const searching = query.trim() !== '';
  const isLocked = (i: GarageItem) => session.engineLock(i.profile.id) !== null;
  const scoped = scopeItems(items, view, searching, isLocked);
  const list = queryGarage(scoped, { filter, query, sort }, ctx, (i) => texts.get(i) ?? '', s.locale);
  const counts = countByFilter(scoped, ctx);
  const kindCounts = Object.fromEntries(GARAGE_KINDS.map((k) => [k, scopeItems(items, { ...view, kind: k }, false, isLocked).length])) as Record<GarageKind, number>;
  const packTab = view.kind === 'fun' || view.kind === 'music';
  const packs = packTab ? packChips(scoped, PACK_ORDER) : [];
  const hiddenSomething = view.hideFree || view.hideLocked;
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
  /** PRO: edit a built-in engine straight from the Garage (my version, or save as a new engine). */
  const editBuiltIn = (item: GarageItem) => {
    const id = item.profile.id;
    const original = getProfile(id) ?? item.profile;
    const existing = session.overrideFor(id);
    session.stopPreview();
    setDetailId(null);
    setStudio({ spec: existing ?? { ...specFromProfile(original, item.title), overrides: id }, isNew: !existing, base: { id, title: item.title } });
  };

  const resetFilters = () => {
    setFilter('all');
    setQuery('');
    if (view.hideFree || view.hideLocked) setView({ hideFree: false, hideLocked: false });
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

      <div className="garage-kinds" role="tablist" aria-label={t('garage.kindsAria')}>
        {GARAGE_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            className={`kind-tab ${view.kind === k && !searching ? 'on' : ''}`}
            aria-selected={view.kind === k}
            onClick={() => setKind(k)}
            data-kind={k}
          >
            {t(`garage.kind.${k}`)} <span className="filter-count">{kindCounts[k]}</span>
          </button>
        ))}
        <button className={`kind-tab kind-settings ${filtersOpen ? 'on' : ''} ${hiddenSomething ? 'active' : ''}`} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} data-action="garage-filters">
          ⚙ {t('garage.hide.button')}{hiddenSomething ? ' •' : ''}
        </button>
      </div>
      {filtersOpen && (
        <div className="garage-hide" data-testid="garage-hide">
          {([
            ['hideFree', 'garage.hide.free'],
            ['hideLocked', 'garage.hide.locked'],
            ['funInAll', 'garage.hide.funInAll'],
            ['musicInAll', 'garage.hide.musicInAll'],
          ] as const).map(([key, label]) => (
            <label key={key} className="hide-option">
              <input type="checkbox" checked={view[key]} onChange={(e) => setView({ [key]: e.target.checked })} data-option={key} />
              <span>{t(label)}</span>
            </label>
          ))}
        </div>
      )}
      {searching && view.kind !== 'all' && <p className="sheet-hint garage-note">{t('garage.searchAll')}</p>}

      <div className="garage-filters" role="toolbar" aria-label={t('garage.filtersAria')}>
        {packTab ? (
          <>
            <div className="filter-group">
              {BASIC_GROUP.map((f) => (
                <button key={f} className={`filter-chip ${filter === f ? 'on' : ''} ${counts[f] === 0 ? 'zero' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-filter={f}>
                  {f === 'all' ? t('garage.kind.all') : t(`garage.f.${f}`)} <span className="filter-count">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="filter-group">
              {packs.map(({ id, count }) => {
                const f: AnyFilter = `pack:${id}`;
                const pk = ENGINE_PACKS.find((x) => x.id === id);
                return (
                  <button key={id} className={`filter-chip filter-pack ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-filter={f} style={pk ? { borderColor: pk.cover.accent } : undefined}>
                    {pk?.name[t.lang] ?? id} <span className="filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : FILTER_GROUPS.map((group, gi) => (
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
            {(filter !== 'all' || query || hiddenSomething) && <button className="btn" onClick={resetFilters}>{t('garage.emptyReset')}</button>}
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
          onUseAsBase={() => editBuiltIn(detail)}
        />
      )}

      {community && <CommunityPanel onClose={() => setCommunity(false)} />}

      {studio && (
        <SoundStudio
          key={studio.spec.id}
          initial={studio.spec}
          isNew={studio.isNew}
          base={studio.base}
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
  const music = getMusicStyle(p.audio.music);
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
      {music ? (
        <dl className="g-specs">
          <div><dt>{t('garage.tempo')}</dt><dd>{music.bpm[0]}–{music.bpm[1]}</dd></div>
          <div className="g-spec-wide"><dt>{t('garage.musicStyle')}</dt><dd>{getPack(item.packId)?.name[t.lang] ?? '—'}</dd></div>
        </dl>
      ) : (
      <dl className="g-specs">
        <div><dt>{t('garage.displacement')}</dt><dd>{p.displacementL === null ? '—' : t('engine.liters', { value: t.num(p.displacementL, 1, 1) })}</dd></div>
        <div><dt>{t('garage.maxRpm')}</dt><dd>{t.num(p.redlineRPM)}</dd></div>
        <div><dt>{t('garage.gears')}</dt><dd>{p.gearbox.gearRatios.length}</dd></div>
        <div className="g-spec-wide"><dt>{t('garage.induction')}</dt><dd>{engineInduction(p, t)}</dd></div>
      </dl>
      )}
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
