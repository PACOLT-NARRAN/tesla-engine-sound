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
  {
    id: 'crazy',
    name: { en: 'CRAZY PACK', cs: 'ŠÍLENOSTI' },
    description: {
      en: 'Eleven impossible engines: drive a nuclear blast, a starship warp core, a dragon, a T-rex, a chainsaw or a kid going brrrm.',
      cs: 'Jedenáct nemožných motorů: řiď výbuch atomovky, warp jádro hvězdné lodi, draka, T-rexe, motorovou pilu nebo dítě, co dělá brrrm.',
    },
    cover: { from: '#2a0a2e', to: '#090611', accent: '#c35bff' },
    highlights: [
      { en: 'Atomic mushroom, rocket and warp drive', cs: 'Atomový hřib, raketa a warp pohon' },
      { en: 'Dragon, T-rex and UFO', cs: 'Drak, T-rex a UFO' },
      { en: 'Chainsaw, lawnmower, blender and 8-bit robot', cs: 'Pila, sekačka, mixér a 8bitový robot' },
    ],
    priceEur: 2.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'two-stroke',
    name: { en: 'TWO-STROKE FUN', cs: 'DVOUTAKTY' },
    description: {
      en: 'Ring-ding-ding and blue smoke: a moped, a plastic people’s car, a three-cylinder sedan, a GP racer and a kart.',
      cs: 'Ring-ding-ding a modrý kouř: moped, plastový lidovůz, tříválcový sedan, závodní GP a motokára.',
    },
    cover: { from: '#0d2a2a', to: '#060b0b', accent: '#3fe0c5' },
    highlights: [
      { en: 'Real two-stroke firing: once per revolution', cs: 'Skutečný dvoutaktní zážeh: jednou za otáčku' },
      { en: 'Four-stroking burble when you lift off', cs: 'Nepravidelné prskání po ubrání plynu' },
      { en: 'Screaming race singles up to 15,000 RPM', cs: 'Ječící závodní jednoválce až do 15 000 ot/min' },
    ],
    priceEur: 2.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'retro-junkyard',
    name: { en: 'RETRO JUNKYARD', cs: 'RETRO ŠROT' },
    description: {
      en: 'Funny old icons of Eastern roads: a tiny two-cylinder, a clattering old hatch diesel, a rear-engined saloon, a Soviet sedan, a holed exhaust and a beer van.',
      cs: 'Vtipné staré ikony východních silnic: malý dvouválec, klepající starý diesel, sedan s motorem vzadu, sovětský sedan, děravý výfuk a dodávka na pivo.',
    },
    cover: { from: '#2a2109', to: '#0b0905', accent: '#ffcf3f' },
    highlights: [
      { en: 'Rattling tappets and misfires included', cs: 'Chrastící ventily a vynechávání v ceně' },
      { en: 'Diesel knock you can feel', cs: 'Klepání dieselu, které ucítíš' },
      { en: 'Exhaust leak louder than a sports car', cs: 'Děravý výfuk hlasitější než sporťák' },
    ],
    priceEur: 2.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'motorbikes',
    name: { en: 'MOTORBIKES', cs: 'MOTORKY' },
    description: {
      en: 'Five bikes: a 14,000 RPM superbike, a V-twin cruiser, a triple, an enduro single and a boxer twin.',
      cs: 'Pět motorek: superbike do 14 000 ot/min, V-twin cruiser, tříválec, jednoválcové enduro a boxer dvouválec.',
    },
    cover: { from: '#2a1109', to: '#0b0705', accent: '#ff7a3f' },
    highlights: [
      { en: 'Uneven V-twin potato-potato beat', cs: 'Nepravidelný V-twin rytmus "potato-potato"' },
      { en: 'Inline-four scream to 14,000 RPM', cs: 'Ječení čtyřválce do 14 000 ot/min' },
      { en: 'Six-speed sequential gearboxes', cs: 'Šestistupňové sekvenční převodovky' },
    ],
    priceEur: 3.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'aircraft',
    name: { en: 'AIRCRAFT', cs: 'LETADLA' },
    description: {
      en: 'Take off from your driveway: a helicopter, a radial warbird, a jet airliner, a fighter with afterburner, a turboprop and an ultralight.',
      cs: 'Vzlétni z příjezdovky: vrtulník, hvězdicový válečný letoun, dopravní tryskáč, stíhačka s přídavným spalováním, turbovrtulový a ultralehký letoun.',
    },
    cover: { from: '#091a2a', to: '#05080b', accent: '#4fb4ff' },
    highlights: [
      { en: 'Rotor blade slap and turbine whine', cs: 'Údery listů rotoru a pískání turbíny' },
      { en: 'Jet buzz-saw and take-off roar', cs: 'Bzučení ventilátoru a řev při vzletu' },
      { en: 'Afterburner crackle', cs: 'Praskání přídavného spalování' },
    ],
    priceEur: 3.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'locomotives',
    name: { en: 'LOCOMOTIVES', cs: 'LOKOMOTIVY' },
    description: {
      en: 'Rail giants: a steam locomotive, the singing electric loco, a classic electric, a two-stroke diesel, a tram and a metro.',
      cs: 'Železniční obři: parní lokomotiva, zpívající elektrická lokomotiva, klasická elektrická, dvoutaktní dieselová, tramvaj a metro.',
    },
    cover: { from: '#1a2a09', to: '#080b05', accent: '#9be04f' },
    highlights: [
      { en: 'Steam chuffs locked to wheel speed', cs: 'Výfuky páry podle rychlosti kol' },
      { en: 'Inverter that sings a scale', cs: 'Měnič, který zpívá stupnici' },
      { en: 'Rail joints clacking under the tram', cs: 'Klapání kolejnicových spojů pod tramvají' },
    ],
    priceEur: 3.99,
    version: '1.0',
    requiresPro: false,
  },
  {
    id: 'drive-music',
    name: { en: 'DRIVE MUSIC', cs: 'HUDBA JÍZDY' },
    description: {
      en: 'Your drive composes the music: speed sets the tempo and layers, the throttle the energy, braking sinks the sound and steering moves it left and right. Five styles.',
      cs: 'Hudbu skládá tvoje jízda: rychlost určuje tempo a nástroje, plyn energii, brzdění hudbu ztlumí a zatáčení ji posouvá doleva a doprava. Pět stylů.',
    },
    cover: { from: '#0b1f3a', to: '#05060d', accent: '#4fd1ff' },
    highlights: [
      { en: 'Synthwave, techno, lo-fi, ambient, film score', cs: 'Synthwave, techno, lo-fi, ambient, filmová hudba' },
      { en: 'Hold REV to build up, release for the drop', cs: 'Podrž REV pro gradaci, pusť a přijde drop' },
      { en: 'Gear shifts change sections and play fills', cs: 'Řazení mění části skladby a hraje přechody' },
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
