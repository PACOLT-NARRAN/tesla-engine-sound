import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COMMUNITY_FILTERS, MockMarketplaceApi, REPORT_REASONS, packEngines, queryItems,
  type CommunityFilter, type MarketplaceApi, type MarketplaceListing, type ReportReason,
} from '../community/api.ts';
import {
  MAX_PUBLISH_TAGS, PUBLISH_TAGS, canInstall, isCommunityEngineId, itemState, needsOwnershipConfirmation, soundOriginOf,
  validatePublication, type ItemState,
} from '../community/install.ts';
import { latestVersion, type CommunityEngine, type MarketplaceAuthor, type MarketplaceItem } from '../community/models.ts';
import { formatPrice } from '../entitlements/products.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { ENGINE_PROFILES } from '../profiles/registry.ts';
import { Sheet } from './Sheet.tsx';

type Load = { status: 'loading' } | { status: 'error'; code: string } | { status: 'ready'; data: MarketplaceListing };

/**
 * REVLINE Community (demo Marketplace). Full-screen layer opened from the Garage. All listings
 * are bundled demo content served by MockMarketplaceApi; installing adds an engine to the
 * Garage as a Sound Studio engine. Nothing is sent anywhere.
 */
export function CommunityPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const api = useMemo(() => new MockMarketplaceApi(() => session.store.get().communityMock), [session]);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [filter, setFilter] = useState<CommunityFilter>('all');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchList = useCallback(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    api.list().then(
      (data) => alive && setLoad({ status: 'ready', data }),
      (e: unknown) => alive && setLoad({ status: 'error', code: (e as { code?: string }).code ?? 'network' }),
    );
    return () => { alive = false; };
  }, [api]);
  useEffect(fetchList, [fetchList, s.communityMock]);
  useEffect(() => () => session.stopPreview(), [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (publishing) setPublishing(false);
      else if (detailId) setDetailId(null);
      else if (search) setSearch('');
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [publishing, detailId, search, onClose]);

  const data = load.status === 'ready' ? load.data : null;
  const items = data?.items ?? [];
  const authors = useMemo(() => new Map((data?.authors ?? []).map((a) => [a.id, a])), [data]);
  const ctx = session.communityContext();
  const stateOf = (i: MarketplaceItem) => itemState(i, items, ctx);
  const list = queryItems(items, { filter, search }, {
    authors, favorites: s.community.favorites,
    isInstalled: (i) => { const st = stateOf(i); return st.status === 'installed' || st.status === 'update-available'; },
  });
  const detail = detailId ? items.find((i) => i.id === detailId) : undefined;

  return (
    <div className="community" role="dialog" aria-modal="true" aria-label={t('community.title')}>
      <header className="garage-head">
        <button className="btn garage-back" onClick={onClose} aria-label={t('community.backAria')}>← {t('garage.title')}</button>
        <h2>{t('community.title')}</h2>
        <span className="tier-badge cm-demo">{t('community.demoBadge')}</span>
        <button className="btn btn-studio" onClick={() => setPublishing(true)} data-action="open-publish">{t('community.publish.open')}</button>
      </header>

      <p className="cm-banner" role="note">{t('community.demoBanner')}</p>
      {!s.online && <p className="cm-banner cm-offline" role="status">{t('community.offlineBundled')}</p>}

      <div className="garage-tools">
        <div className="garage-search">
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('community.searchPlaceholder')}
            aria-label={t('community.searchAria')} enterKeyHint="search" autoComplete="off" spellCheck={false}
          />
          {search && <button className="garage-search-clear" onClick={() => setSearch('')} aria-label={t('garage.clearSearch')}>✕</button>}
        </div>
      </div>
      <div className="garage-filters" role="toolbar" aria-label={t('garage.filtersAria')}>
        <div className="filter-group">
          {COMMUNITY_FILTERS.map((f) => (
            <button key={f} className={`filter-chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-filter={f}>
              {t(`community.f.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="garage-body" aria-busy={load.status === 'loading'}>
        {s.ignition !== 'off' && <p className="sheet-hint garage-note">{t('garage.previewOff')}</p>}
        {load.status === 'loading' && (
          <div className="garage-grid" data-state="loading" aria-label={t('community.loading')}>
            {[0, 1, 2].map((i) => <div key={i} className="g-card cm-skeleton" aria-hidden="true"><span /><span /><span /></div>)}
          </div>
        )}
        {load.status === 'error' && (
          <div className="garage-empty" data-state="error" role="alert">
            <p>{t(load.code === 'offline' ? 'community.err.offline' : 'community.err.server')}</p>
            <button className="btn btn-primary" onClick={fetchList} data-action="retry">{t('community.retry')}</button>
          </div>
        )}
        {data && items.length === 0 && (
          <div className="garage-empty" data-state="empty"><p>{t('community.empty')}</p></div>
        )}
        {data && items.length > 0 && list.length === 0 && (
          <div className="garage-empty" data-state="no-results">
            <p>{t(filter === 'installed' && !search ? 'community.emptyInstalled' : filter === 'favorites' && !search ? 'community.emptyFavorites' : 'community.noResults')}</p>
            <button className="btn" onClick={() => { setFilter('all'); setSearch(''); }}>{t('garage.emptyReset')}</button>
          </div>
        )}
        {data && list.length > 0 && (
          <div className="garage-grid">
            {list.map((i) => (
              <CommunityCard key={i.id} item={i} items={items} author={authors.get(i.authorId)} state={stateOf(i)} onDetails={() => setDetailId(i.id)} />
            ))}
          </div>
        )}
      </div>

      {detail && <CommunityDetail item={detail} items={items} author={authors.get(detail.authorId)} state={stateOf(detail)} api={api} onClose={() => setDetailId(null)} />}
      {publishing && <PublishSheet api={api} onClose={() => setPublishing(false)} />}
    </div>
  );
}

function AccessBadge({ item }: { item: MarketplaceItem }) {
  const t = useT();
  const e = item.entitlement;
  if (e.access === 'paid') return <span className="tier-badge tier-pack">{formatPrice(e.priceCents / 100, t.lang)}</span>;
  return <span className={`tier-badge tier-${e.access}`}>{t(`garage.tier.${e.access}`)}</span>;
}

function StatusLine({ state }: { state: ItemState }) {
  const t = useT();
  const key: MessageKey = state.status === 'locked' ? `community.lock.${state.lock ?? 'pro'}`
    : state.status === 'incompatible' ? `community.incompatible.${state.incompatible ?? 'format'}`
      : `community.status.${state.status}`;
  return <p className={`cm-status cm-status-${state.status}`} data-status={state.status}>{t(key, { version: state.installedVersion ?? '' })}</p>;
}

function useInstall(item: MarketplaceItem, items: readonly MarketplaceItem[]) {
  const session = useSession();
  const t = useT();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const engines: CommunityEngine[] = item.kind === 'engine' ? [item] : packEngines(item, items);
  const install = async () => {
    setBusy(true);
    const r = await session.installCommunity(engines, t.lang);
    setBusy(false);
    setMsg(r.installed > 0
      ? { kind: 'ok', text: t('community.installed', { count: r.installed }) }
      : { kind: 'error', text: t(`community.installFail.${r.result}` as MessageKey) });
  };
  const remove = () => {
    for (const e of engines) session.uninstallCommunity(e.id);
    setMsg({ kind: 'ok', text: t('community.removed') });
  };
  return { install, remove, msg, busy };
}

function InstallButtons({ item, items, state, compact = false }: { item: MarketplaceItem; items: readonly MarketplaceItem[]; state: ItemState; compact?: boolean }) {
  const t = useT();
  const upgrade = useUpgrade();
  const { install, remove, msg, busy } = useInstall(item, items);
  return (
    <>
      {canInstall(state) && (
        <button className="btn btn-primary" onClick={() => void install()} disabled={busy} data-action={state.status === 'update-available' ? 'update' : 'install'}>
          {state.status === 'update-available' ? t('community.update', { version: latestVersion(item) }) : t(item.kind === 'pack' ? 'community.installPack' : 'community.install')}
        </button>
      )}
      {state.status === 'installed' && !compact && <button className="btn btn-danger" onClick={remove} data-action="remove">{t('community.remove')}</button>}
      {state.status === 'installed' && compact && <span className="cm-installed-tag">✓ {t('community.inGarage')}</span>}
      {state.status === 'locked' && state.lock !== 'paid' && (
        <button className="btn btn-unlock" onClick={() => upgrade.open()} data-action="unlock">{t('garage.unlockPro')}</button>
      )}
      {msg && <p className={`studio-msg studio-msg-${msg.kind} cm-msg`} role="status">{msg.text}</p>}
    </>
  );
}

function CommunityPreview({ item }: { item: CommunityEngine }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const id = `community:${item.id}`;
  const mine = s.preview?.id === id ? s.preview.status : null;
  return (
    <button
      className={`btn btn-preview ${mine ? 'on' : ''}`} onClick={() => void session.previewCommunity(item, t.lang)} disabled={s.ignition !== 'off'}
      aria-pressed={mine !== null} aria-label={t('garage.previewAria', { name: item.title })} data-action="preview"
    >
      {mine === 'loading' ? t('garage.previewLoading') : mine === 'playing' ? t('garage.previewStop') : t('garage.preview')}
    </button>
  );
}

function FavButton({ item }: { item: MarketplaceItem }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const fav = s.community.favorites.includes(item.id);
  return (
    <button className={`fav-btn ${fav ? 'on' : ''}`} onClick={() => session.toggleCommunityFavorite(item.id)} aria-pressed={fav}
      aria-label={fav ? t('engines.removeFavorite', { name: item.title }) : t('engines.addFavorite', { name: item.title })}>
      {fav ? '♥' : '♡'}
    </button>
  );
}

function CommunityCard({ item, items, author, state, onDetails }: {
  item: MarketplaceItem; items: readonly MarketplaceItem[]; author: MarketplaceAuthor | undefined; state: ItemState; onDetails: () => void;
}) {
  const t = useT();
  return (
    <article className={`g-card cm-card ${state.status === 'locked' || state.status === 'incompatible' ? 'g-card-locked' : ''}`} data-item-id={item.id} data-kind={item.kind} data-status={state.status}>
      <div className="g-card-top">
        <AccessBadge item={item} />
        <span className="badge">{item.kind === 'pack' ? t('community.packCount', { count: item.engineIds.length }) : t(`layout.${item.spec.layout}`)}</span>
        {item.demo && <span className="badge cm-demo-badge">{t('community.demoItem')}</span>}
        <FavButton item={item} />
      </div>
      <button className="g-card-main" onClick={onDetails} aria-label={t('garage.detailsAria', { name: item.title })} data-action="details">
        <h3>{item.title}</h3>
        <small className="engine-subtitle">{t('community.by', { author: author?.displayName ?? '—' })} · v{latestVersion(item)}</small>
        <p>{item.summary[t.lang]}</p>
      </button>
      <StatusLine state={state} />
      <div className="g-card-actions">
        {item.kind === 'engine' && <CommunityPreview item={item} />}
        <InstallButtons item={item} items={items} state={state} compact />
      </div>
    </article>
  );
}

function CommunityDetail({ item, items, author, state, api, onClose }: {
  item: MarketplaceItem; items: readonly MarketplaceItem[]; author: MarketplaceAuthor | undefined; state: ItemState; api: MarketplaceApi; onClose: () => void;
}) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const myStars = s.community.ratings[item.id] ?? 0;
  const bankName = (id: string | null) => {
    const p = id ? ENGINE_PROFILES.find((x) => x.id === id) : undefined;
    return p ? engineTitle(p) : t('garage.spec.soundSynth');
  };
  const sendReport = async () => {
    if (!reason) return;
    const r = await api.report(item.id, reason);
    setReportMsg(r.sent ? t('community.report.sent') : t('community.report.notSent'));
    setReporting(false);
  };
  const engines = item.kind === 'pack' ? packEngines(item, items) : [];

  return (
    <Sheet title={item.title} onClose={onClose}>
      <div className="engine-detail cm-detail" data-item-id={item.id}>
        <div className="g-card-top">
          <AccessBadge item={item} />
          {item.demo && <span className="badge cm-demo-badge">{t('community.demoItem')}</span>}
          <FavButton item={item} />
        </div>
        <p className="detail-desc">{item.summary[t.lang]}</p>
        <StatusLine state={state} />
        <div className="detail-actions">
          {item.kind === 'engine' && <CommunityPreview item={item} />}
          <InstallButtons item={item} items={items} state={state} />
        </div>
        {state.status === 'locked' && state.lock === 'paid' && <p className="setting-lock">{t('community.paidNote')}</p>}
        {s.ignition !== 'off' && <p className="sheet-hint">{t('garage.previewOff')}</p>}

        <h3 className="detail-title">{t('community.author')}</h3>
        <div className="cm-author">
          <strong>{author?.displayName ?? '—'}</strong>{author?.verified && <span className="badge cm-verified">✓ {t('community.verified')}</span>}
          {author && <p className="sheet-hint">{author.bio[t.lang]}</p>}
        </div>

        {item.kind === 'engine' ? (
          <>
            <h3 className="detail-title">{t('garage.spec.title')}</h3>
            <table className="spec-table">
              <tbody>
                <tr><th>{t('garage.layout')}</th><td>{t(`layout.${item.spec.layout}`)} · {item.spec.cylinders}</td></tr>
                <tr><th>{t('garage.displacement')}</th><td>{t('engine.liters', { value: t.num(item.spec.displacementL, 1, 1) })}</td></tr>
                <tr><th>{t('garage.induction')}</th><td>{t(`induction.${item.spec.induction}`)}</td></tr>
                <tr><th>{t('garage.spec.idle')} / {t('garage.maxRpm')}</th><td>{t.num(item.spec.idleRPM)} / {t.num(item.spec.maxRPM)}</td></tr>
                <tr><th>{t('garage.spec.gearbox')}</th><td>{t(`studio.gearbox.${item.spec.gearboxType}`)} · {item.spec.gearCount} · {t.num(item.spec.finalDrive, 2, 2)}:1</td></tr>
                <tr><th>{t('garage.spec.sound')}</th><td>{t('community.soundOf', { name: bankName(item.compatibility.soundBankId) })}</td></tr>
                <tr><th>{t('garage.spec.tags')}</th><td>{item.tags.join(', ')}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h3 className="detail-title">{t('community.packContents')}</h3>
            <ul className="cm-pack-list">
              {engines.map((e) => <li key={e.id}><strong>{e.title}</strong> <StatusLine state={itemState(e, items, session.communityContext())} /></li>)}
            </ul>
          </>
        )}

        <h3 className="detail-title">{t('community.versions')}</h3>
        <ul className="cm-versions">
          {item.versions.map((v) => (
            <li key={v.version}><strong>v{v.version}</strong> <span className="sheet-hint">{v.releasedAt}</span> — {v.notes[t.lang]}</li>
          ))}
        </ul>

        <h3 className="detail-title">{t('community.compat')}</h3>
        <table className="spec-table">
          <tbody>
            <tr><th>{t('community.compat.format')}</th><td>{item.kind === 'engine' && state.status === 'incompatible' ? t(`community.incompatible.${state.incompatible ?? 'format'}`) : t('community.compat.ok')}</td></tr>
            <tr><th>{t('community.compat.publication')}</th><td>{t(`community.pub.${item.publication}`)} · {t(`community.mod.${item.moderation}`)}</td></tr>
          </tbody>
        </table>

        <h3 className="detail-title">{t('community.rating')}</h3>
        <p className="sheet-hint">{item.rating ? t('community.ratingLive', { avg: t.num(item.rating.average, 1, 1), count: item.rating.count }) : t('community.noRatings')}</p>
        <div className="cm-stars" role="group" aria-label={t('community.yourRating')}>
          <span>{t('community.yourRating')}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`cm-star ${n <= myStars ? 'on' : ''}`} onClick={() => session.rateCommunity(item.id, n)} aria-pressed={n <= myStars} aria-label={t('community.starsAria', { count: n })} data-stars={n}>★</button>
          ))}
        </div>
        <p className="sheet-hint">{t('community.ratingLocal')}</p>

        <div className="cm-report">
          {!reporting && <button className="btn" onClick={() => { setReporting(true); setReportMsg(null); }} data-action="report">{t('community.report.open')}</button>}
          {reporting && (
            <div className="data-confirm" role="group" aria-label={t('community.report.open')}>
              <p>{t('community.report.why')}</p>
              <div className="studio-chips">
                {REPORT_REASONS.map((r) => (
                  <button key={r} className={`filter-chip ${reason === r ? 'on' : ''}`} aria-pressed={reason === r} onClick={() => setReason(r)} data-reason={r}>{t(`community.report.${r}`)}</button>
                ))}
              </div>
              <div className="data-actions">
                <button className="btn btn-danger" onClick={() => void sendReport()} disabled={!reason} data-action="send-report">{t('community.report.send')}</button>
                <button className="btn" onClick={() => setReporting(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
          {reportMsg && <p className="sheet-hint cm-report-msg" role="status">{reportMsg}</p>}
        </div>
      </div>
    </Sheet>
  );
}

function PublishSheet({ api, onClose }: { api: MarketplaceApi; onClose: () => void }) {
  const s = useSessionState();
  const t = useT();
  const own = s.customEngines.filter((c) => !isCommunityEngineId(c.id));
  const [engineId, setEngineId] = useState<string>(own[0]?.id ?? '');
  const spec = own.find((c) => c.id === engineId);
  const [description, setDescription] = useState(spec?.description ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const origin = spec ? soundOriginOf(spec) : 'synth';
  const issues = spec ? validatePublication(spec, { description, tags, ownershipConfirmed: confirmed }, origin) : [];

  const pick = (id: string) => {
    setEngineId(id);
    setDescription(own.find((c) => c.id === id)?.description ?? '');
    setResult(null);
  };
  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  const submit = async () => {
    setTried(true);
    if (!spec || issues.length) return;
    const r = await api.publish({ title: spec.name, description, tags, ownershipConfirmed: confirmed });
    setResult(r.sent ? t('community.publish.sent') : t('community.publish.notAvailable'));
  };

  return (
    <Sheet title={t('community.publish.title')} onClose={onClose}>
      <div className="cm-publish">
        <p className="setting-lock">{t('community.publish.notice')}</p>
        {own.length === 0 ? (
          <p className="garage-empty" data-state="no-engines">{t('community.publish.noEngines')}</p>
        ) : (
          <>
            <label className="studio-field">
              <span className="studio-label">{t('community.publish.engine')}</span>
              <select value={engineId} onChange={(e) => pick(e.target.value)} data-field="publish-engine">
                {own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="studio-field">
              <span className="studio-label">{t('studio.description')} <span className="studio-count">{description.trim().length}</span></span>
              <textarea value={description} maxLength={200} rows={3} onChange={(e) => setDescription(e.target.value)} data-field="publish-description" />
              {tried && issues.includes('description') && <small className="studio-error">{t('community.publish.err.description')}</small>}
            </label>
            <div className="studio-field">
              <span className="studio-label">{t('community.publish.tags', { max: MAX_PUBLISH_TAGS })}</span>
              <div className="studio-chips">
                {PUBLISH_TAGS.map((tag) => (
                  <button key={tag} className={`filter-chip ${tags.includes(tag) ? 'on' : ''}`} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)} data-tag={tag}>{tag}</button>
                ))}
              </div>
              {tried && issues.includes('tags') && <small className="studio-error">{t('community.publish.err.tags')}</small>}
              {issues.includes('tooManyTags') && <small className="studio-error">{t('community.publish.err.tooManyTags', { max: MAX_PUBLISH_TAGS })}</small>}
            </div>
            {needsOwnershipConfirmation(origin) ? (
              <label className="cm-ownership">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>{t('community.publish.ownership')}</span>
                {tried && issues.includes('ownership') && <small className="studio-error">{t('community.publish.err.ownership')}</small>}
              </label>
            ) : (
              <p className="sheet-hint" data-ownership="not-needed">{t('community.publish.projectSound')}</p>
            )}
            {tried && issues.includes('invalidEngine') && <p className="studio-error">{t('community.publish.err.invalidEngine')}</p>}
            {result && <p className="studio-msg studio-msg-lock cm-msg" role="status" data-result="not-available">{result}</p>}
            <div className="data-actions">
              <button className="btn btn-primary" onClick={() => void submit()} data-action="publish">{t('community.publish.submit')}</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
