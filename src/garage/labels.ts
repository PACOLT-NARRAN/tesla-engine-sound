import { translator, type Language } from '../i18n/index.ts';
import { getPack } from '../profiles/packs.ts';
import { engineInduction, engineLayout } from '../profiles/presentation.ts';
import { GARAGE_FILTERS, matchesFilter, type GarageItem } from './garage.ts';

const LANGS: readonly Language[] = ['en', 'cs'];
const GROUP_FILTERS = GARAGE_FILTERS.filter((f) => f !== 'all' && f !== 'favorites' && f !== 'recent');

/** Localized words for search in every UI language, so Czech and English terms both match. */
export function searchLabels(item: GarageItem): string[] {
  const out: string[] = [];
  for (const lang of LANGS) {
    const t = translator(lang);
    out.push(engineLayout(item.profile, t), engineInduction(item.profile, t), t(`garage.tier.${item.tier}`));
    if (item.meta) out.push(t(`origin.${item.meta.origin}`));
    const pack = getPack(item.packId);
    if (pack) out.push(pack.name[lang]);
    for (const f of GROUP_FILTERS) if (matchesFilter(item, f, { favorites: [], recent: [] })) out.push(t(`garage.f.${f}`));
  }
  return out;
}
