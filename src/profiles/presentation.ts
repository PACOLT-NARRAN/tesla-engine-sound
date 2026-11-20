import type { Translator } from '../i18n/index.ts';
import type { EngineProfile } from '../types/profile.ts';
import { getCatalogEntry } from './catalog.ts';

/**
 * User-facing texts for an engine. Internal ids and bank names are never used as titles;
 * an engine without a catalog entry falls back to the name written in its profile.
 */
export function engineTitle(p: EngineProfile): string {
  return getCatalogEntry(p.id)?.displayName ?? p.name;
}

/** e.g. "5.2 L · 8,500 RPM · 7-speed" / "5,2 l · 8 500 ot/min · 7 st." */
export function engineSubtitle(p: EngineProfile, t: Translator): string {
  const rpm = t.num(p.redlineRPM);
  const gears = p.gearbox.gearRatios.length;
  if (p.displacementL === null) return t('engine.subtitleNoDisp', { rpm, gears });
  const displacement = t('engine.liters', { value: t.num(p.displacementL, 1, 1) });
  return t('engine.subtitle', { displacement, rpm, gears });
}

export function engineDescription(p: EngineProfile, t: Translator): string {
  return getCatalogEntry(p.id)?.shortDescription[t.lang] ?? (p.description || (p.id.startsWith('custom-') ? t('studio.cardFallback') : ''));
}

export function engineLayout(p: EngineProfile, t: Translator): string {
  return t.dyn(`layout.${p.category}`) ?? p.category;
}

export function engineInduction(p: EngineProfile, t: Translator): string {
  return t.dyn(`induction.${p.aspiration}`) ?? p.aspiration;
}
