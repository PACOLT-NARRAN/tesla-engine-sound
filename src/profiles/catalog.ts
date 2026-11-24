import type { EngineCatalogEntry, EngineOrigin, EngineTier, LocalizedText } from '../types/catalog.ts';
import { FUN_CATALOG } from './funEngines.ts';
import { MUSIC_CATALOG } from './musicEngines.ts';

const entry = (
  id: string,
  displayName: string,
  origin: EngineOrigin,
  en: string,
  cs: string,
  tags: readonly string[] = [],
): EngineCatalogEntry => ({ id, displayName, origin, shortDescription: { en, cs } satisfies LocalizedText, tags, tier: TIERS[id]?.tier ?? 'free', packId: TIERS[id]?.packId ?? null });

/**
 * Commercial placement of each engine (product decision, edit freely). Engines not listed are FREE.
 * PRO = included in REVLINE PRO; pack = sold in a premium engine pack (see packs.ts).
 * The default engine (gt3flat6) must stay FREE.
 */
const TIERS: Readonly<Record<string, { tier: EngineTier; packId: string | null }>> = {
  m297zonda: { tier: 'pro', packId: null },
  m158huayra: { tier: 'pro', packId: null },
  f50v12: { tier: 'pro', packId: null },
  sestov10: { tier: 'pro', packId: null },
  musv8: { tier: 'pro', packId: null },
  rb26dett: { tier: 'pack', packId: 'jdm-legends' },
  toysupmk4: { tier: 'pack', packId: 'jdm-legends' },
  rotary7: { tier: 'pack', packId: 'jdm-legends' },
  lambov10: { tier: 'pack', packId: 'italian-exotics' },
  murciev12: { tier: 'pack', packId: 'italian-exotics' },
  f40v8: { tier: 'pack', packId: 'italian-exotics' },
};

/**
 * Marketing metadata for every built-in engine, keyed by stable engine id.
 * Edit names and descriptions here freely — ids must not change.
 */
export const ENGINE_CATALOG: readonly EngineCatalogEntry[] = [
  entry('avesv', 'ITALIAN V12 SV', 'italian', 'Italian naturally aspirated V12 with a sharp, screaming top end.', 'Italský atmosférický V12 s ostrým, ječivým vrškem otáček.', ['supercar', 'exotic']),
  entry('diablov12', 'ITALIAN V12 CLASSIC', 'italian', 'Classic 90s Italian V12 — deep, raw and mechanical.', 'Klasický italský V12 z 90. let — hluboký, surový a mechanický.', ['classic', 'exotic']),
  entry('murciev12', 'ITALIAN V12', 'italian', 'Big naturally aspirated Italian V12 with a hard-edged howl.', 'Velký atmosférický italský V12 s tvrdým vytím.', ['supercar', 'exotic']),
  entry('ferrarif12', 'FRONT-ENGINE V12', 'italian', 'Front-mounted Italian grand-touring V12, smooth and high-revving.', 'Italský V12 vpředu pro rychlé GT, hladký a vytáčivý.', ['gt', 'exotic']),
  entry('f50v12', 'HIGH-REV V12', 'italian', 'Race-derived V12 that revs to 10,000 RPM.', 'V12 odvozený ze závodů, točí až 10 000 ot/min.', ['race', 'exotic']),
  entry('m297zonda', 'ITALIAN HYPERCAR V12', 'italian', 'Huge 7.3 L naturally aspirated V12 from an Italian hypercar.', 'Obří atmosférický V12 7,3 l z italského hypersportu.', ['hypercar', 'exotic']),
  entry('m158huayra', 'V12 TWIN TURBO', 'italian', 'Twin-turbo V12 with massive low-end torque and turbo whoosh.', 'V12 se dvěma turby, obrovský točivý moment a syčení turba.', ['hypercar', 'exotic']),
  entry('lambov10', 'ITALIAN HIGH-REV V10', 'italian', 'Italian high-rev naturally aspirated V10.', 'Italský vysokootáčkový atmosférický V10.', ['supercar', 'exotic']),
  entry('sestov10', 'V10 LIGHTWEIGHT', 'italian', 'Track-focused lightweight V10 with an angry bark.', 'Odlehčený V10 na okruh s vzteklým štěkotem.', ['track', 'exotic']),
  entry('f40v8', 'CLASSIC V8 TWIN TURBO', 'italian', 'Legendary late-80s twin-turbo V8 — raw and boosty.', 'Legendární twin-turbo V8 z konce 80. let — surový, s turbem.', ['classic', 'exotic']),
  entry('brabus850', 'GERMAN V8 TWIN TURBO', 'german', 'Tuned German twin-turbo V8 with a deep, heavy rumble.', 'Upravený německý V8 se dvěma turby, hluboké těžké burácení.', ['tuner', 'luxury']),
  entry('predatorv8', 'AMERICAN V8 SUPERCHARGED', 'american', 'American cross-plane V8 with supercharger whine.', 'Americký V8 s křížovou klikovkou a pískáním kompresoru.', ['muscle']),
  entry('musv8', 'DRAG V8 TWIN-CHARGED', 'american', 'Drag-strip V8 with both turbo and supercharger.', 'Dragsterový V8 s turbem i kompresorem.', ['drag', 'muscle']),
  entry('gt3flat6', 'FLAT-6 RS', 'german', 'German 4.0 L naturally aspirated boxer six that loves 9,000 RPM.', 'Německý atmosférický boxer 4,0 l, který miluje 9 000 ot/min.', ['track', 'boxer']),
  entry('rb26dett', 'JDM I6 TWIN TURBO', 'japanese', 'Iconic Japanese twin-turbo straight-six.', 'Ikonický japonský řadový šestiválec se dvěma turby.', ['jdm', 'tuner']),
  entry('toysupmk4', 'JDM I6 TURBO', 'japanese', 'Japanese 3.0 L turbo straight-six, a tuner legend.', 'Japonský řadový šestiválec 3,0 l s turbem, legenda tuningu.', ['jdm', 'tuner']),
  entry('rotary7', 'JDM ROTARY TWIN TURBO', 'japanese', 'Twin-rotor Wankel with sequential turbos — buzzing and unique.', 'Dvourotorový Wankel se sekvenčními turby — bzučivý a jedinečný.', ['jdm', 'rotary']),
  entry('k20a', 'JDM HIGH-REV I4', 'japanese', 'Japanese high-revving 2.0 L four with a sharp VTEC-style top end.', 'Japonský vytáčivý čtyřválec 2,0 l s ostrým vrškem ve stylu VTEC.', ['jdm', 'hot-hatch']),
  entry('shonen', 'STREET ENGINE', 'generic', 'Street-tuned engine with a generic sporty character.', 'Pouliční motor s obecným sportovním charakterem.', ['street']),
  entry('p60b40', 'RACING V8', 'german', 'High-revving racing V8.', 'Vysokootáčkový závodní V8.', ['race']),
  // Fun packs (REVLINE voice synthesiser), see funEngines.ts.
  ...FUN_CATALOG,
  ...MUSIC_CATALOG,
];

const BY_ID: ReadonlyMap<string, EngineCatalogEntry> = new Map(ENGINE_CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): EngineCatalogEntry | undefined {
  return BY_ID.get(id);
}
