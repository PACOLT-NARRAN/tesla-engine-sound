import type { Language } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';

/**
 * Product catalog: plans, prices and feature lists. The ONLY place where prices live —
 * components format them with formatPrice() and never write a literal price.
 *
 * No purchase exists yet. Prices are shown as the planned offer; buttons say that buying is
 * not available, and nothing is unlocked by them.
 */

export const CURRENCY = 'EUR';

export interface PlanProduct {
  id: 'revline-free' | 'revline-pro';
  priceEur: number;
  billing: 'free' | 'lifetime';
  /** Feature lines (i18n keys), in display order. */
  features: readonly MessageKey[];
}

export const FREE_PLAN: PlanProduct = {
  id: 'revline-free',
  priceEur: 0,
  billing: 'free',
  features: [
    'product.f.basicEngines', 'product.f.gpsDemo', 'product.f.auto', 'product.f.basicSound',
    'product.f.comfort', 'product.f.themes', 'product.f.units', 'product.f.dashboard', 'product.f.preview',
    'product.f.favorites', 'product.f.profile',
  ],
};

export const PRO_PLAN: PlanProduct = {
  id: 'revline-pro',
  priceEur: 9.99,
  billing: 'lifetime',
  features: [
    'product.f.proEngines', 'product.f.sportTrack', 'product.f.manual', 'product.f.advancedSound',
    'product.f.customGearing', 'product.f.studio', 'product.f.packSupport', 'product.f.updates',
  ],
};

/** "What PRO changes" — before / after lines (i18n key prefixes `product.cmp.<id>.free|pro`). */
export const PRO_COMPARISON = ['engines', 'drive', 'gearbox', 'sound', 'studio'] as const;

const formatters = new Map<Language, Intl.NumberFormat>();

/** "€9.99" / "9,99 €". */
export function formatPrice(eur: number, lang: Language): string {
  let f = formatters.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-IE', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(lang, f);
  }
  return f.format(eur);
}
