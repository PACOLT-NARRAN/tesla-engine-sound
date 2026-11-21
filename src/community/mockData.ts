import type { CommunityEngine, CommunityEngineSpec, CommunityPack, MarketplaceAuthor, MarketplaceItem } from './models.ts';

/**
 * DEMO content bundled with the app. Made by the REVLINE team to show how the Community will
 * look; every item is marked `demo: true`. No ratings, no download counts, no real authors.
 * All sounds are project-owned REVLINE sound banks, so no ownership confirmation is needed.
 */

export const MOCK_AUTHORS: readonly MarketplaceAuthor[] = [
  {
    id: 'revline-lab', displayName: 'REVLINE Lab', verified: true, demo: true,
    bio: { en: 'The REVLINE team. Example engines that show what creators will be able to share.', cs: 'Tým REVLINE. Ukázkové motory, které ukazují, co budou tvůrci moct sdílet.' },
  },
  {
    id: 'demo-trackday', displayName: 'Demo creator · Track Day', verified: false, demo: true,
    bio: { en: 'Demo profile: track-focused engines with short gearing.', cs: 'Ukázkový profil: motory na okruh s krátkými převody.' },
  },
  {
    id: 'demo-nightgarage', displayName: 'Demo creator · Night Garage', verified: false, demo: true,
    bio: { en: 'Demo profile: relaxed cruisers and big-torque V8s.', cs: 'Ukázkový profil: pohodové cruisery a V8 s velkým momentem.' },
  },
];

const base: CommunityEngineSpec = {
  layout: 'V8', cylinders: 8, displacementL: 5, idleRPM: 850, maxRPM: 8000, induction: 'naturally-aspirated', exhaust: 'sport',
  crackle: 30, gearboxType: 'dct', gearCount: 7, finalDrive: 3.7, customRatios: null, throttleResponse: 100, engineBraking: 50,
  overrun: 50, turbo: 0, supercharger: 0, sound: { kind: 'synth' },
};

const engine = (
  id: string, title: string, authorId: string, tags: string[], summary: { en: string; cs: string },
  spec: Partial<CommunityEngineSpec> & { sound: { kind: 'bank'; bankId: string } },
  more: Partial<CommunityEngine> = {},
): CommunityEngine => ({
  kind: 'engine', id, title, authorId, tags, summary,
  spec: { ...base, ...spec },
  versions: [{ version: '1.0.0', releasedAt: '2026-11-01', notes: { en: 'First version.', cs: 'První verze.' } }],
  compatibility: { format: 1, soundBankId: spec.sound.bankId },
  entitlement: { access: 'free' },
  publication: 'published', moderation: 'approved', rating: null, downloads: null, demo: true,
  soundOrigin: 'project-bank', ownershipConfirmed: false,
  ...more,
});

export const MOCK_ENGINES: readonly CommunityEngine[] = [
  engine('cm-alpine-flat6', 'ALPINE FLAT-6', 'demo-trackday', ['track', 'boxer', 'na'],
    { en: 'Mountain-road boxer six: short final drive, quick DCT and lots of lift-off crackle.', cs: 'Boxer na horské silnice: krátký stálý převod, rychlá DCT a hodně praskání při ubrání.' },
    { layout: 'Flat-6', cylinders: 6, displacementL: 4, idleRPM: 900, maxRPM: 9000, exhaust: 'race', crackle: 55, finalDrive: 4.2, throttleResponse: 130, sound: { kind: 'bank', bankId: 'gt3flat6' } },
    { versions: [
      { version: '1.1.0', releasedAt: '2026-11-12', notes: { en: 'Shorter 1st and 2nd gear, more crackle.', cs: 'Kratší 1. a 2. rychlost, víc praskání.' } },
      { version: '1.0.0', releasedAt: '2026-10-20', notes: { en: 'First version.', cs: 'První verze.' } },
    ] }),
  engine('cm-hothatch-i4', 'HOT HATCH I4', 'demo-trackday', ['jdm', 'hot-hatch', 'manual'],
    { en: 'High-revving four with a six-speed manual feel. Revs to 8,800 RPM before every shift.', cs: 'Vytáčivý čtyřválec s pocitem šestistupňového manuálu. Před každým řazením točí až 8 800 ot/min.' },
    { layout: 'Inline-4', cylinders: 4, displacementL: 2, idleRPM: 900, maxRPM: 8800, gearboxType: 'manual', gearCount: 6, finalDrive: 4.4, crackle: 20, sound: { kind: 'bank', bankId: 'k20a' } }),
  engine('cm-canyon-v12', 'CANYON V12', 'revline-lab', ['exotic', 'v12', 'gt'],
    { en: 'Long-legged Italian V12 for open roads: tall gearing, smooth shifts, soft overrun.', cs: 'Italský V12 na otevřené silnice: dlouhé převody, hladké řazení, jemný zvuk při ubrání.' },
    { layout: 'V12', cylinders: 12, displacementL: 6.5, idleRPM: 950, maxRPM: 8700, exhaust: 'stock', crackle: 10, gearCount: 7, finalDrive: 3.2, throttleResponse: 90, sound: { kind: 'bank', bankId: 'avesv' } }),
  engine('cm-boulevard-v8', 'BOULEVARD V8', 'demo-nightgarage', ['tuner', 'turbo', 'cruiser'],
    { en: 'Twin-turbo V8 cruiser with a nine-speed automatic. Lazy at low revs, huge whoosh on boost.', cs: 'Twin-turbo V8 cruiser s devítistupňovým automatem. Líný v nízkých otáčkách, velké syčení turba.' },
    { layout: 'V8', cylinders: 8, displacementL: 4, idleRPM: 700, maxRPM: 7000, induction: 'twin-turbo', turbo: 80, gearboxType: 'automatic', gearCount: 9, finalDrive: 2.8, engineBraking: 30, sound: { kind: 'bank', bankId: 'brabus850' } },
    { entitlement: { access: 'pro' } }),
  engine('cm-street-sc-v8', 'STREET SUPERCHARGED V8', 'demo-nightgarage', ['muscle', 'supercharged'],
    { en: 'American V8 with a loud supercharger whine and a heavy six-speed manual.', cs: 'Americký V8 s hlasitým pískáním kompresoru a těžkým šestistupňovým manuálem.' },
    { layout: 'V8', cylinders: 8, displacementL: 6.2, idleRPM: 750, maxRPM: 6800, induction: 'supercharged', supercharger: 85, gearboxType: 'manual', gearCount: 6, finalDrive: 3.4, exhaust: 'race', sound: { kind: 'bank', bankId: 'predatorv8' } },
    { entitlement: { access: 'pro' } }),
  engine('cm-hyper-v12', 'HYPER V12 TRIBUTE', 'revline-lab', ['hypercar', 'v12', 'exotic'],
    { en: 'A sharper tune of the hypercar V12. Uses a PRO sound bank, so it needs that engine unlocked.', cs: 'Ostřejší naladění hypersportovního V12. Používá zvuk z PRO motoru, takže potřebuje ten motor odemčený.' },
    { layout: 'V12', cylinders: 12, displacementL: 7.3, idleRPM: 1000, maxRPM: 9000, exhaust: 'race', crackle: 40, finalDrive: 3.6, sound: { kind: 'bank', bankId: 'm297zonda' } }),
  engine('cm-future-format', 'FUTURE FORMAT DEMO', 'revline-lab', ['demo'],
    { en: 'Made for a newer community format than this app understands — shows the "incompatible" state.', cs: 'Vytvořeno pro novější komunitní formát, než tato aplikace zná — ukazuje stav „nekompatibilní“.' },
    { sound: { kind: 'bank', bankId: 'shonen' } },
    { compatibility: { format: 2, soundBankId: 'shonen' } }),
];

export const MOCK_PACKS: readonly CommunityPack[] = [
  {
    kind: 'pack', id: 'cmp-track-day', title: 'TRACK DAY PACK', authorId: 'demo-trackday', tags: ['track', 'pack'],
    summary: { en: 'Two short-geared track engines in one install.', cs: 'Dva motory na okruh s krátkými převody v jedné instalaci.' },
    engineIds: ['cm-alpine-flat6', 'cm-hothatch-i4'],
    versions: [{ version: '1.1.0', releasedAt: '2026-11-12', notes: { en: 'Alpine Flat-6 updated to 1.1.0.', cs: 'Alpine Flat-6 aktualizován na 1.1.0.' } }],
    entitlement: { access: 'free' }, publication: 'published', moderation: 'approved', rating: null, downloads: null, demo: true,
  },
  {
    kind: 'pack', id: 'cmp-night-cruise', title: 'NIGHT CRUISE PACK', authorId: 'demo-nightgarage', tags: ['cruiser', 'pack', 'v8'],
    summary: { en: 'Three relaxed big engines. Shows how a paid creator pack will look — it cannot be bought in this version.', cs: 'Tři pohodové velké motory. Ukazuje, jak bude vypadat placený balíček tvůrce — v této verzi ho koupit nejde.' },
    engineIds: ['cm-boulevard-v8', 'cm-street-sc-v8', 'cm-canyon-v12'],
    versions: [{ version: '1.0.0', releasedAt: '2026-11-05', notes: { en: 'First version.', cs: 'První verze.' } }],
    entitlement: { access: 'paid', priceCents: 299, currency: 'EUR' }, publication: 'published', moderation: 'approved', rating: null, downloads: null, demo: true,
  },
];

export const MOCK_ITEMS: readonly MarketplaceItem[] = [...MOCK_PACKS, ...MOCK_ENGINES];
