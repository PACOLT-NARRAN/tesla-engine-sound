import { useState } from 'react';
import { packOwnership, type Entitlements } from '../entitlements/entitlements.ts';
import { FREE_PLAN, PRO_COMPARISON, PRO_PLAN, formatPrice } from '../entitlements/products.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useUpgrade } from '../hooks/UpgradeContext.ts';
import { useT } from '../i18n/useT.ts';
import { ENGINE_CATALOG } from '../profiles/catalog.ts';
import { ENGINE_PACKS, getPack, type EnginePack } from '../profiles/packs.ts';
import { engineSubtitle } from '../profiles/presentation.ts';
import { PreviewButton } from './GarageParts.tsx';
import { Sheet } from './Sheet.tsx';

const packEngines = (packId: string) => ENGINE_CATALOG.filter((e) => e.packId === packId);
const proEngines = () => ENGINE_CATALOG.filter((e) => e.tier === 'pro');

/** Where the current plan comes from — always visible, so a simulation is never mistaken for a purchase. */
function PlanStatus({ e }: { e: Entitlements }) {
  const t = useT();
  const key = e.simulated ? 'store.status.simulated' : e.earlyAccess ? 'store.status.early' : e.plan === 'pro' ? 'store.status.pro' : 'store.status.free';
  return <p className={`store-status ${e.simulated ? 'store-status-sim' : ''}`} role="status" data-plan={e.plan}>{t(key, { plan: e.plan.toUpperCase() })}</p>;
}

/** Shown after any buy button: nothing is sold yet, nothing is charged, nothing unlocks. */
function NotForSale({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="store-nosale" role="alertdialog" aria-label={t('store.noSaleTitle')}>
      <strong>{t('store.noSaleTitle')}</strong>
      <p>{t('store.noSaleText')}</p>
      <button className="btn" onClick={onClose}>{t('common.ok')}</button>
    </div>
  );
}

function PackCard({ pack, onOpen }: { pack: EnginePack; onOpen: () => void }) {
  const t = useT();
  const s = useSessionState();
  const own = packOwnership(s.entitlements, pack.id);
  const engines = packEngines(pack.id);
  return (
    <button className="pack-card" onClick={onOpen} data-pack={pack.id} style={{ background: `linear-gradient(135deg, ${pack.cover.from}, ${pack.cover.to})`, borderColor: pack.cover.accent }}>
      <span className="pack-kicker" style={{ color: pack.cover.accent }}>{t('store.pack')} · {t('store.engineCount', { n: engines.length })}</span>
      <strong className="pack-name">{pack.name[t.lang]}</strong>
      <span className="pack-engines">{engines.map((e) => e.displayName).join(' · ')}</span>
      <span className="pack-foot">
        <span className={`pack-own pack-own-${own}`}>{t(`store.own.${own}`)}</span>
        <span className="pack-price">{formatPrice(pack.priceEur, t.lang)}</span>
      </span>
    </button>
  );
}

function PackDetail({ pack, onBack, onBuy }: { pack: EnginePack; onBack: () => void; onBuy: () => void }) {
  const t = useT();
  const s = useSessionState();
  const session = useSession();
  const upgrade = useUpgrade();
  const own = packOwnership(s.entitlements, pack.id);
  const engines = packEngines(pack.id);
  return (
    <div className="pack-detail" data-pack-detail={pack.id}>
      <button className="btn store-back" onClick={onBack}>← {t('store.allOffers')}</button>
      <section className="pack-hero" style={{ background: `linear-gradient(135deg, ${pack.cover.from}, ${pack.cover.to})`, borderColor: pack.cover.accent }}>
        <span className="pack-kicker" style={{ color: pack.cover.accent }}>{t('store.pack')}</span>
        <h3>{pack.name[t.lang]}</h3>
        <p>{pack.description[t.lang]}</p>
        <ul className="pack-highlights">{pack.highlights.map((h) => <li key={h.en}>{h[t.lang]}</li>)}</ul>
      </section>
      <dl className="pack-facts">
        <div><dt>{t('store.included')}</dt><dd>{t('store.engineCount', { n: engines.length })}</dd></div>
        <div><dt>{t('store.ownership')}</dt><dd data-own={own}>{t(`store.own.${own}`)}</dd></div>
        <div><dt>{t('store.installed')}</dt><dd>{t('store.installedBuiltIn')}</dd></div>
        <div><dt>{t('store.updates')}</dt><dd>{t('store.upToDate', { version: pack.version })}</dd></div>
        <div><dt>{t('store.requires')}</dt><dd>{pack.requiresPro ? t('store.requiresPro') : t('store.requiresNothing')}</dd></div>
        <div><dt>{t('store.price')}</dt><dd>{formatPrice(pack.priceEur, t.lang)}</dd></div>
      </dl>
      <h4 className="store-sub">{t('store.packEngines')}</h4>
      <div className="pack-engine-list">
        {engines.map((e) => {
          const p = session.findProfile(e.id);
          return (
            <div key={e.id} className="pack-engine" data-engine-id={e.id}>
              <span className="pack-engine-text">
                <strong>{e.displayName}</strong>
                <small>{p ? engineSubtitle(p, t) : ''}</small>
              </span>
              <PreviewButton id={e.id} name={e.displayName} />
              <button className="btn" onClick={() => upgrade.tryInDemo(e.id)} data-action="try-demo">{t('store.tryDemo')}</button>
            </div>
          );
        })}
      </div>
      <p className="setting-hint store-try">{t('store.tryHint')}</p>
      <div className="store-buy">
        {own === 'not-owned'
          ? <button className="btn btn-primary" onClick={onBuy} data-action="buy-pack">{t('store.buyPack', { price: formatPrice(pack.priceEur, t.lang) })}</button>
          : <p className="store-owned">{t(`store.own.${own}`)}</p>}
      </div>
    </div>
  );
}

/**
 * REVLINE PRO and premium packs: plan comparison, what PRO changes, pack screens with previews.
 * A mock-up of the product model — no purchase is possible and none is pretended.
 */
export function UpgradePanel({ onClose, initialPack }: { onClose: () => void; initialPack?: string }) {
  const t = useT();
  const s = useSessionState();
  const upgrade = useUpgrade();
  const [packId, setPackId] = useState<string | null>(initialPack && getPack(initialPack) ? initialPack : null);
  const [noSale, setNoSale] = useState(false);
  const pack = getPack(packId);
  const pro = s.entitlements.plan === 'pro';
  const engines = proEngines();

  return (
    <div className="store-layer">
      <Sheet title={t('store.title')} onClose={onClose}>
        <div className="store">
          <PlanStatus e={s.entitlements} />
          {noSale && <NotForSale onClose={() => setNoSale(false)} />}
          {pack ? (
            <PackDetail pack={pack} onBack={() => setPackId(null)} onBuy={() => setNoSale(true)} />
          ) : (
            <>
              <section className="store-claim">
                <p>{t('store.claimFree')}</p>
                <p className="store-claim-pro">{t('store.claimPro')}</p>
              </section>
              <div className="plan-grid">
                <section className="plan plan-free" data-plan-card="free">
                  <h3>REVLINE FREE</h3>
                  <p className="plan-price">{formatPrice(FREE_PLAN.priceEur, t.lang)}</p>
                  <ul>{FREE_PLAN.features.map((f) => <li key={f}>{t(f)}</li>)}</ul>
                  {!pro && <p className="store-owned">{t('store.current')}</p>}
                </section>
                <section className="plan plan-pro" data-plan-card="pro">
                  <h3>REVLINE PRO</h3>
                  <p className="plan-price">{formatPrice(PRO_PLAN.priceEur, t.lang)} <small>{t('store.lifetime')}</small></p>
                  <ul>{PRO_PLAN.features.map((f) => <li key={f}>{t(f)}</li>)}</ul>
                  {pro
                    ? <p className="store-owned">{t(s.entitlements.earlyAccess ? 'store.proEarly' : 'store.current')}</p>
                    : <button className="btn btn-primary" onClick={() => setNoSale(true)} data-action="buy-pro">{t('store.buyPro', { price: formatPrice(PRO_PLAN.priceEur, t.lang) })}</button>}
                </section>
              </div>

              <section className="store-section">
                <h3>{t('store.changesTitle')}</h3>
                <div className="cmp-table">
                  <div className="cmp-row cmp-head"><span /><span>FREE</span><span>PRO</span></div>
                  {PRO_COMPARISON.map((c) => (
                    <div key={c} className="cmp-row">
                      <strong>{t(`product.cmp.${c}`)}</strong>
                      <span>{t(`product.cmp.${c}.free`)}</span>
                      <span className="cmp-pro">{t(`product.cmp.${c}.pro`)}</span>
                    </div>
                  ))}
                </div>
                <p className="setting-hint store-try">{t('store.demoRule')}</p>
              </section>

              <section className="store-section">
                <h3>{t('store.proEngines')}</h3>
                <div className="pack-engine-list">
                  {engines.map((e) => (
                    <div key={e.id} className="pack-engine" data-engine-id={e.id}>
                      <span className="pack-engine-text"><strong>{e.displayName}</strong><small>{e.shortDescription[t.lang]}</small></span>
                      <PreviewButton id={e.id} name={e.displayName} />
                      <button className="btn" onClick={() => upgrade.tryInDemo(e.id)} data-action="try-demo">{t('store.tryDemo')}</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="store-section">
                <h3>{t('store.packsTitle')}</h3>
                <div className="pack-grid">
                  {ENGINE_PACKS.map((p) => <PackCard key={p.id} pack={p} onOpen={() => setPackId(p.id)} />)}
                </div>
              </section>
              <p className="profile-local">{t('store.honest')}</p>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}
