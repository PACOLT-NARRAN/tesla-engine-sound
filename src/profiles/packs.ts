import type { LocalizedText } from '../types/catalog.ts';

/**
 * Premium engine packs (presentation; no purchase exists yet). Engines join a pack via
 * `packId` in catalog.ts. Prices live here and nowhere else.
 */
export interface EnginePack {
  readonly id: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  /** Cover gradient (two CSS colours) and an accent for the pack card. */
  readonly cover: { readonly from: string; readonly to: string; readonly accent: string };
  /** Short technical highlights. */
  readonly highlights: readonly LocalizedText[];
  /** Planned price in EUR (example). */
  readonly priceEur: number;
  /** Content version, for the future update state. */
  readonly version: string;
  /** True if the pack also needs REVLINE PRO (none do). */
  readonly requiresPro: boolean;
}

export const ENGINE_PACKS: readonly EnginePack[] = [
  {
    id: 'jdm-legends',
    name: { en: 'JDM LEGENDS', cs: 'JDM LEGENDY' },
    description: {
      en: 'Three Japanese icons of the tuner era: a twin-turbo straight-six, a single-turbo straight-six and a twin-rotor Wankel.',
      cs: 'Tři japonské ikony doby tuningu: řadový šestiválec se dvěma turby, řadový šestiválec s turbem a dvourotorový Wankel.',
    },
    cover: { from: '#2a0d12', to: '#0b0b14', accent: '#ff3b4f' },
    highlights: [
      { en: 'Sequential twin turbos with blow-off', cs: 'Sekvenční dvojitá turba s odfukem' },
      { en: 'Rotary buzz up to 8,500 RPM', cs: 'Bzučení Wankelu až do 8 500 ot/min' },
      { en: 'Straight-six smoothness and boost whistle', cs: 'Hladkost řadové šestky a pískání turba' },
    ],
    priceEur: 3.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'italian-exotics',
    name: { en: 'ITALIAN EXOTICS', cs: 'ITALSKÉ EXOTIKY' },
    description: {
      en: 'Big Italian sound: a high-rev V10, a naturally aspirated V12 and the legendary twin-turbo V8.',
      cs: 'Velký italský zvuk: vytáčivý V10, atmosférický V12 a legendární V8 se dvěma turby.',
    },
    cover: { from: '#2b1405', to: '#0d0a07', accent: '#ffb21a' },
    highlights: [
      { en: 'V10 and V12 screaming top end', cs: 'Ječivý vršek otáček V10 a V12' },
      { en: 'Raw late-80s twin-turbo V8', cs: 'Surový twin-turbo V8 z konce 80. let' },
      { en: 'Hard overrun crackle', cs: 'Ostré praskání při ubrání plynu' },
    ],
    priceEur: 4.99,
    version: '1.0',
    requiresPro: false,
  },
];

export function getPack(id: string | null, packs: readonly EnginePack[] = ENGINE_PACKS): EnginePack | undefined {
  return id === null ? undefined : packs.find((p) => p.id === id);
}

export const PACK_IDS: readonly string[] = ENGINE_PACKS.map((p) => p.id);
