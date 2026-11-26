import type { DrumKit, MusicStyle } from './musicStyles.ts';
import { SONGS } from './songData.ts';
import type { Song } from './songs.ts';
import { BASE_STYLES, DORIAN, HARMONIC, LYDIAN, MAJOR, MINOR, MIXOLYDIAN, PHRYGIAN } from './styleData.ts';

/**
 * Every music "engine" of every music pack: a playable style plus its name and description.
 * Generative tracks are variations of a genre template (key, tempo, sounds, grooves); song
 * tracks play a written traditional / public-domain melody with a genre arrangement.
 */
export interface MusicTrack {
  /** Style id; the garage engine id is `music-<id>`. */
  id: string;
  pack: string;
  name: string;
  en: string;
  cs: string;
  tags: readonly string[];
  style: MusicStyle;
}

type Over = Partial<MusicStyle>;

const DEFAULTS: Omit<MusicStyle, 'id'> = {
  root: 57, scale: MINOR, progressions: [[0, 5, 2, 6], [3, 5, 0, 6]], barsPerChord: 1, sevenths: false,
  bpm: [100, 124], swing: 0,
  drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', hatBusy: 'x.x.x.x.x.x.x.xx' },
  drumThreshold: 0.12, pad: 'saw', bass: 'saw', bassPattern: 'eighths', lead: 'saw', arp: 'up',
  brightness: 0.6, space: 0.6, echo: 0.5,
};

function style(id: string, ...overs: Over[]): MusicStyle {
  const s = Object.assign({}, DEFAULTS, ...overs, { id }) as MusicStyle;
  if (s.song) s.meter = s.song.meter ?? 4;
  return s;
}

function song(name: string): Song {
  const s = SONGS[name];
  if (!s) throw new Error(`missing song ${name}`);
  return s;
}

// --- Drum grooves -----------------------------------------------------------------------------
const FOUR_FLOOR: DrumKit = { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', hatBusy: 'x.xxx.xxx.xxx.xx', clap: true };
const ROCK: DrumKit = { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'xxxxxxxxxxxxxxxx' };
const METAL: DrumKit = { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x...x...x...x...', hatBusy: 'x.x.x.x.x.x.x.x.', kickBusy: 'xxxxxxxxxxxxxxxx' };
const SHUFFLE: DrumKit = { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'x.xxx.xxx.xxx.xx' };
const DNB: DrumKit = { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'xxxxxxxxxxxxxxxx' };
const JUNGLE: DrumKit = { kick: 'x.........x..x..', snare: '....x..o.o..x..o', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'xxxxxxxxxxxxxxxx', tom: '..............xx' };
const CHIP: DrumKit = { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'xxxxxxxxxxxxxxxx' };
const WALTZ: DrumKit = { kick: 'x...........', snare: '....x...x...', hat: '..x...x...x.', hatBusy: 'x.x.x.x.x.x.' };
const TRIBAL: DrumKit = { ...FOUR_FLOOR, tom: '..x..x....x..x.x' };
const NONE: DrumKit = { kick: '', snare: '', hat: '', hatBusy: '' };

// --- Genre templates -------------------------------------------------------------------------
const TECHNO: Over = { drums: FOUR_FLOOR, drumThreshold: 0.06, kick: 'punch', pad: 'glass', bass: 'sub', bassPattern: 'offbeat', lead: 'square', arp: 'pulse', arpVoice: 'square', progressions: [[0, 0, 0, 0], [0, 0, 5, 0]], barsPerChord: 2, bpm: [122, 134], brightness: 0.6, space: 0.55, echo: 0.6, gearVoice: 'glass' };
const TEKNO: Over = { drums: { ...FOUR_FLOOR, snare: '............x...', clap: false }, drumThreshold: 0.05, kick: 'tekno', dist: 0.6, pad: 'none', bass: 'dist', bassPattern: 'rolling', lead: 'square', arp: 'random', arpVoice: 'square', progressions: [[0, 0, 0, 0], [0, 0, 1, 0]], barsPerChord: 2, bpm: [165, 180], brightness: 0.7, space: 0.35, echo: 0.55, gearVoice: 'saw' };
const HARD: Over = { drums: { ...FOUR_FLOOR, hat: '..x...x...x...x.' }, drumThreshold: 0.1, kick: 'hard', dist: 0.75, bass: 'dist', bassPattern: 'reverse', pad: 'saw', lead: 'supersaw', arp: 'updown', arpVoice: 'saw', progressions: [[5, 3, 0, 4], [5, 6, 0, 4]], bpm: [140, 156], brightness: 0.8, space: 0.75, echo: 0.45, gearVoice: 'choir' };
const CORE: Over = { drums: METAL, drumThreshold: 0.08, kick: 'rock', dist: 0.9, bass: 'dist', bassPattern: 'chug', bassLow: 26, pad: 'none', lead: 'guitar', arp: 'up', arpVoice: 'pluck', root: 50, scale: MINOR, progressions: [[0, 5, 3, 4], [0, 6, 5, 4]], riff: 'xx.xx.xxP---xx.x', breakdown: 'x..x..x.x..x..x.', bpm: [110, 156], brightness: 0.75, space: 0.5, echo: 0.3, gearVoice: 'choir' };
const METALS: Over = { drums: METAL, drumThreshold: 0.08, kick: 'rock', dist: 0.85, bass: 'dist', bassPattern: 'chug', bassLow: 28, pad: 'none', lead: 'guitar', arp: 'up', arpVoice: 'pluck', root: 52, scale: MINOR, progressions: [[0, 5, 6, 0], [0, 3, 6, 4]], riff: 'x.xxx.xxx.xxx.xx', bpm: [100, 168], brightness: 0.75, space: 0.5, echo: 0.3, gearVoice: 'choir' };
const ACID: Over = { drums: FOUR_FLOOR, drumThreshold: 0.06, kick: 'punch', pad: 'none', bass: 'acid', bassPattern: 'acid', lead: 'square', arp: 'pulse', arpVoice: 'square', progressions: [[0, 0, 0, 0], [0, 0, 3, 0]], barsPerChord: 2, bpm: [120, 136], dist: 0.2, brightness: 0.7, space: 0.5, echo: 0.6, gearVoice: 'saw' };
const RNR: Over = { drums: SHUFFLE, drumThreshold: 0.08, kick: 'rock', boogie: true, dist: 0.35, swing: 0.3, bass: 'pluck', bassPattern: 'walking', pad: 'organ', lead: 'brass', arp: 'random', arpVoice: 'piano', root: 55, scale: MIXOLYDIAN, progressions: [[0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4]], bpm: [138, 176], brightness: 0.65, space: 0.45, echo: 0.35, gearVoice: 'brass' };
const DNBS: Over = { drums: DNB, drumThreshold: 0.08, kick: 'punch', bass: 'reese', bassPattern: 'dnb', pad: 'warm', lead: 'bell', arp: 'updown', arpVoice: 'bell', sevenths: true, progressions: [[0, 5, 3, 4], [0, 3, 5, 6]], barsPerChord: 2, bpm: [160, 176], brightness: 0.6, space: 0.75, echo: 0.55, gearVoice: 'strings' };
const CHIPS: Over = { drums: CHIP, drumThreshold: 0.08, kick: 'chip', bass: 'chip', bassPattern: 'eighths', pad: 'none', lead: 'chip', arp: 'up', arpVoice: 'square', bpm: [120, 160], brightness: 0.85, space: 0.2, echo: 0.25, gearVoice: 'glass' };
const CLASSIC: Over = { drums: NONE, drumThreshold: 9, kick: 'soft', orchestral: true, pad: 'strings', bass: 'cello', bassPattern: 'alberti', lead: 'strings', arp: 'alberti', arpVoice: 'piano', brightness: 0.5, space: 0.85, echo: 0.2, gearVoice: 'choir' };
const XMAS: Over = { drums: { ...ROCK, jingle: 'x.x.x.x.x.x.x.x.' }, drumThreshold: 0.2, kick: 'rock', pad: 'strings', bass: 'pluck', bassPattern: 'eighths', lead: 'bell', arp: 'updown', arpVoice: 'bell', brightness: 0.6, space: 0.8, echo: 0.35, gearVoice: 'brass' };

const T = (id: string, pack: string, name: string, cs: string, en: string, tags: readonly string[], s: MusicStyle): MusicTrack =>
  ({ id, pack, name, cs, en, tags, style: s });

// --- DRIVE MUSIC (the original pack, now 10 tracks) -----------------------------------------
const BASE_TEXT: Record<string, [string, string, string, string[]]> = {
  synthwave: ['NIGHT DRIVE SYNTHWAVE', 'Synthwave z osmdesátek, který roste s rychlostí: na semaforu plochy, ve městě basa a beat, na dálnici hnaný arpeggiátor.', '80s synthwave that grows with speed: pads at the lights, bass and beat in town, a racing arpeggio on the motorway.', ['synthwave']],
  techno: ['MOTORWAY TECHNO', 'Techno na čtyři doby s acid basou, která zakvílí, když zrychlíš.', 'Four-on-the-floor techno with an acid bass that screams when you accelerate.', ['techno']],
  lofi: ['LO-FI CITY CRUISE', 'Pohodový lo-fi beat s elektrickým pianem a praskáním desky na pomalé projížďky městem.', 'Relaxed lo-fi beat with electric piano and vinyl crackle for slow city cruising.', ['lofi', 'chill']],
  ambient: ['AMBIENT LANDSCAPE', 'Vznášivý ambient na dlouhé cesty: pomalé akordy, skleněné zvonky v zatáčkách a jemné bicí jen v rychlosti.', 'Floating ambient for long trips: slow chords, glassy bells in the bends and soft drums only at speed.', ['ambient', 'chill']],
  epic: ['EPIC FILM SCORE', 'Hudba jako z filmového traileru: smyčce a violoncella, taiko bubny při jízdě a žestě, když šlápneš na plyn.', 'Film-trailer score: strings and cellos, taiko drums when you cruise and brass when you floor it.', ['epic', 'cinematic']],
};

const DRIVE_MUSIC: MusicTrack[] = [
  ...BASE_STYLES.map((s) => {
    const [name, cs, en, tags] = BASE_TEXT[s.id] as [string, string, string, string[]];
    return T(s.id, 'drive-music', name, cs, en, tags, s);
  }),
  T('deephouse', 'drive-music', 'DEEP HOUSE SUNSET', 'Teplý deep house s elektrickým pianem a basou na offbeat – na večerní pobřeží.', 'Warm deep house with electric piano and an off-beat bass for the evening coast road.', ['house', 'chill'],
    style('deephouse', { root: 60, scale: DORIAN, sevenths: true, progressions: [[0, 3, 0, 3], [5, 3, 4, 0]], bpm: [112, 124], drums: FOUR_FLOOR, drumThreshold: 0.08, pad: 'epiano', bass: 'pluck', bassPattern: 'offbeat', lead: 'flute', arp: 'random', arpVoice: 'pluck', brightness: 0.5, gearVoice: 'organ' })),
  T('nudisco', 'drive-music', 'NU-DISCO BOULEVARD', 'Diskotékové smyčce a oktávová basa, která tě sama rozhoupe.', 'Disco strings and an octave-jumping bass that makes the car bounce.', ['disco', 'funk'],
    style('nudisco', { root: 57, scale: DORIAN, progressions: [[0, 3, 0, 3], [1, 4, 0, 3]], bpm: [108, 122], drums: { ...FOUR_FLOOR, clap: false }, drumThreshold: 0.08, pad: 'strings', bass: 'saw', bassPattern: 'eighths', lead: 'square', arp: 'up', arpVoice: 'pluck', brightness: 0.7, gearVoice: 'strings' })),
  T('trance', 'drive-music', 'TRANCE HIGHWAY', 'Euforický trance: supersaw melodie a valící se basa, když se dálnice otevře.', 'Euphoric trance: a supersaw melody and a rolling bass when the motorway opens up.', ['trance'],
    style('trance', { root: 57, progressions: [[5, 3, 0, 4], [5, 6, 0, 4]], bpm: [126, 140], drums: FOUR_FLOOR, drumThreshold: 0.08, pad: 'saw', bass: 'saw', bassPattern: 'rolling', lead: 'supersaw', arp: 'updown', arpVoice: 'saw', brightness: 0.75, space: 0.8, gearVoice: 'choir' })),
  T('darksynth', 'drive-music', 'DARKSYNTH PURSUIT', 'Temný a nebezpečný synth – jako honička nočním městem.', 'Dark, dangerous synth – like a chase through the city at night.', ['synthwave', 'dark'],
    style('darksynth', { root: 52, scale: PHRYGIAN, progressions: [[0, 0, 1, 0], [5, 1, 0, 6]], bpm: [96, 124], kick: 'hard', dist: 0.4, bass: 'dist', bassPattern: 'eighths', pad: 'saw', lead: 'saw', arp: 'up', arpVoice: 'square', brightness: 0.55, gearVoice: 'choir' })),
  T('citypop', 'drive-music', 'CITY POP 1984', 'Japonský city pop: barevné akordy, slunce a pobřežní silnice.', 'Japanese city pop: colourful chords, sunshine and a coastal road.', ['citypop', 'funk'],
    style('citypop', { root: 64, scale: MAJOR, sevenths: true, progressions: [[3, 2, 1, 4], [3, 4, 2, 5]], bpm: [92, 112], swing: 0.1, drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hatBusy: 'xxxxxxxxxxxxxxxx' }, pad: 'epiano', bass: 'pluck', bassPattern: 'eighths', lead: 'brass', arp: 'random', arpVoice: 'bell', brightness: 0.65, gearVoice: 'brass' })),
];

// --- Generative genre packs (10 tracks each) ------------------------------------------------
type Row = [string, string, string, string, Over];

function pack(packId: string, template: Over, tags: readonly string[], rows: readonly Row[]): MusicTrack[] {
  return rows.map(([id, name, cs, en, over]) => T(id, packId, name, cs, en, tags, style(id, template, over)));
}

const TECHNO_PACK = pack('techno', TECHNO, ['techno'], [
  ['tc-warehouse', 'WAREHOUSE 4AM', 'Tmavé skladové techno s valící se sub basou.', 'Dark warehouse techno with a rolling sub bass.', { root: 53, bpm: [124, 136], bassPattern: 'rolling', pad: 'none' }],
  ['tc-detroit', 'MOTOR CITY CHORDS', 'Detroitské akordy se smyčci a teplou basou.', 'Detroit-style chords with strings and a warm bass.', { root: 60, scale: DORIAN, sevenths: true, pad: 'strings', bass: 'saw', progressions: [[0, 3, 0, 4], [5, 3, 0, 6]], barsPerChord: 1, bpm: [120, 130], arpVoice: 'pluck' }],
  ['tc-dub', 'DUB TUNNEL', 'Hluboké dub techno s ozvěnou, která se táhne tunelem.', 'Deep dub techno with echoes that trail down the tunnel.', { root: 55, sevenths: true, echo: 0.95, space: 0.95, bpm: [116, 126], brightness: 0.4 }],
  ['tc-industrial', 'STEEL PRESS', 'Industriální techno: zkreslený kopák a kovová basa.', 'Industrial techno: a distorted kick and a metallic bass.', { root: 49, scale: PHRYGIAN, kick: 'tekno', dist: 0.5, bass: 'dist', bassPattern: 'rolling', bpm: [128, 140], brightness: 0.8, pad: 'none' }],
  ['tc-hypnotic', 'HYPNOTIC LOOP', 'Hypnotická smyčka, která se pomalu mění s každým kilometrem.', 'A hypnotic loop that slowly evolves with every kilometre.', { root: 57, progressions: [[0, 0, 0, 0], [0, 0, 0, 1]], bpm: [124, 132], echo: 0.75 }],
  ['tc-melodic', 'MELODIC NIGHT', 'Melodické techno s velkými plochami a melodií.', 'Melodic techno with big pads and a soaring line.', { root: 62, progressions: [[0, 5, 3, 4], [0, 5, 6, 4]], barsPerChord: 1, pad: 'saw', lead: 'saw', arp: 'updown', arpVoice: 'saw', bpm: [120, 128], gearVoice: 'choir' }],
  ['tc-minimal', 'MINIMAL CLICK', 'Minimal: suché kliky, tichá basa a hodně prostoru.', 'Minimal: dry clicks, a quiet bass and lots of space.', { root: 52, pad: 'none', bass: 'pluck', bpm: [122, 128], brightness: 0.45, space: 0.3 }],
  ['tc-peak', 'PEAK TIME', 'Peak-time techno pro plný sál – a plnou dálnici.', 'Peak-time techno for a full club – and a full motorway.', { root: 58, bpm: [128, 138], bass: 'saw', bassPattern: 'rolling', lead: 'supersaw', arp: 'up', arpVoice: 'saw', brightness: 0.75 }],
  ['tc-berlin', 'BERLIN BUNKER', 'Studené berlínské techno z betonového bunkru.', 'Cold Berlin techno from a concrete bunker.', { root: 50, bassPattern: 'rolling', bpm: [126, 134], space: 0.85, brightness: 0.5 }],
  ['tc-rave93', 'RAVE 1993', 'Rave z devadesátek: varhanní stab akordy a pískavá melodie.', 'Nineties rave: organ stab chords and a piercing melody.', { root: 57, progressions: [[0, 5, 6, 4]], barsPerChord: 1, pad: 'organ', bpm: [130, 140], brightness: 0.75 }],
]);

const TEKNO_PACK = pack('tekno', TEKNO, ['tekno', 'free party'], [
  ['tk-freeparty', 'FREE PARTY', 'Free tekno z pole za městem: zkreslený kopák a valící se basa.', 'Free tekno from a field outside town: distorted kick and rolling bass.', { root: 53 }],
  ['tk-soundsystem', 'SOUNDSYSTEM WALL', 'Zeď reproduktorů: tvrdý a hutný tekno groove.', 'A wall of speakers: a hard, dense tekno groove.', { root: 50, dist: 0.7 }],
  ['tk-mental', 'MENTAL TEKNO', 'Mentální tekno s ječícím syntezátorem.', 'Mental tekno with a screaming synth.', { root: 52, scale: PHRYGIAN, lead: 'screech', bpm: [175, 190] }],
  ['tk-acid', 'ACID TEKNO', 'Tekno s kvílející 303 basou.', 'Tekno with a squealing 303 bass.', { root: 55, bass: 'acid', bassPattern: 'acid', dist: 0.45 }],
  ['tk-tribe', 'TRIBE', 'Kmenové bubny a tekno – tribe styl.', 'Tribal drums meet tekno – tribe style.', { root: 57, drums: { ...TRIBAL, clap: false, snare: '............x...' }, arp: 'pulse' }],
  ['tk-hardtek', 'HARDTEK', 'Hardtek: rychlý, tvrdý a nekompromisní.', 'Hardtek: fast, hard and uncompromising.', { root: 49, scale: HARMONIC, bpm: [175, 188], dist: 0.8 }],
  ['tk-ragga', 'RAGGA STEPPER', 'Raggatek s houpavým rytmem.', 'Raggatek with a bouncing groove.', { root: 55, swing: 0.18, bpm: [165, 175], lead: 'brass' }],
  ['tk-squat', 'SQUAT 5AM', 'Pět ráno v opuštěné hale: temné a hypnotické.', 'Five in the morning in an abandoned hall: dark and hypnotic.', { root: 51, brightness: 0.5, echo: 0.8 }],
  ['tk-teknival', 'TEKNIVAL', 'Velký teknival: melodie nad zkreslenou basou.', 'A big teknival: a melody above the distorted bass.', { root: 57, lead: 'saw', arp: 'updown', arpVoice: 'saw', progressions: [[0, 5, 3, 4]], barsPerChord: 1 }],
  ['tk-tribecore', 'TRIBECORE', 'Tribecore na hraně 190 BPM.', 'Tribecore on the edge of 190 BPM.', { root: 53, drums: { ...TRIBAL, clap: false }, bpm: [178, 192], dist: 0.75 }],
]);

const HARD_PACK = pack('hardstyle', HARD, ['hardstyle'], [
  ['hs-euphoric', 'EUPHORIC SUNRISE', 'Euforický hardstyle: reverse basa a melodie do východu slunce.', 'Euphoric hardstyle: reverse bass and a melody into the sunrise.', { root: 57 }],
  ['hs-raw', 'RAW POWER', 'Raw hardstyle s ječícím screechem.', 'Raw hardstyle with a screaming screech.', { root: 52, scale: PHRYGIAN, lead: 'screech', progressions: [[0, 0, 1, 0], [0, 6, 1, 0]], dist: 0.9, bpm: [148, 158] }],
  ['hs-anthem', 'FESTIVAL ANTHEM', 'Festivalová hymna – ruce nahoru, plyn dolů.', 'A festival anthem – hands up, foot down.', { root: 60, progressions: [[5, 3, 0, 4], [3, 4, 5, 4]] }],
  ['hs-reverse', 'REVERSE BASS', 'Klasická reverse basa, která tlačí auto dopředu.', 'The classic reverse bass that pushes the car forward.', { root: 55, pad: 'none', lead: 'saw' }],
  ['hs-classic', 'CLASSIC 2008', 'Hardstyle jako v roce 2008: melodický a pohodový.', 'Hardstyle like 2008: melodic and feel-good.', { root: 62, bpm: [140, 148], dist: 0.6, brightness: 0.7 }],
  ['hs-screech', 'SCREECH MACHINE', 'Stroj na screeche: agresivní a nevypočitatelný.', 'A screech machine: aggressive and unpredictable.', { root: 50, scale: HARMONIC, lead: 'screech', bpm: [150, 160] }],
  ['hs-uptempo', 'UPTEMPO', 'Uptempo: hardstyle zrychlený až k 180 BPM.', 'Uptempo: hardstyle pushed up to 180 BPM.', { root: 53, bpm: [160, 182], dist: 0.95, lead: 'screech' }],
  ['hs-hardcore', 'HARDCORE RUSH', 'Hardcore se supersaw melodií a dunícím kopákem.', 'Hardcore with a supersaw melody and a pounding kick.', { root: 57, bpm: [165, 190], bassPattern: 'rolling' }],
  ['hs-emotional', 'EMOTIONAL DROP', 'Dojemná melodie v duru, pak drop.', 'An emotional major-key melody, then the drop.', { root: 64, scale: MAJOR, progressions: [[0, 4, 5, 3], [3, 4, 0, 5]] }],
  ['hs-nightfall', 'NIGHTFALL', 'Temný hardstyle na noční dálnici.', 'Dark hardstyle for the night motorway.', { root: 51, brightness: 0.6, space: 0.9 }],
]);

const CORE_PACK = pack('metalcore', CORE, ['metalcore', 'metal'], [
  ['mc-breakdown', 'BREAKDOWN BRIDGE', 'Metalcore, kde brzdění spustí breakdown.', 'Metalcore where braking triggers a breakdown.', {}],
  ['mc-dropd', 'DROP D DRIVE', 'Riffy v ladění drop D na rychlou jízdu.', 'Drop D riffs for fast driving.', { riff: 'x.xx.xx.P---x.xx' }],
  ['mc-anthem', 'STADIUM CHORUS', 'Velký melodický refrén jako na stadionu.', 'A big melodic chorus like in a stadium.', { root: 52, scale: MAJOR, progressions: [[0, 4, 5, 3]], pad: 'saw', lead: 'supersaw' }],
  ['mc-djent', 'DJENT GRID', 'Djent: synkopované chugy v přesné mřížce.', 'Djent: syncopated chugs on a precise grid.', { root: 47, riff: 'x.x..x.x..x.x.x.', breakdown: 'x...x..x..x.x...', pad: 'glass', bpm: [110, 140] }],
  ['mc-melodic', 'MELODIC SCARS', 'Melodický metalcore s čistou kytarou v arpeggiu.', 'Melodic metalcore with a clean arpeggiated guitar.', { root: 54, arp: 'updown', gearVoice: 'strings' }],
  ['mc-blast', 'BLAST LANE', 'Blastbeaty na dálnici, breakdown na semaforu.', 'Blast beats on the motorway, a breakdown at the lights.', { root: 50, scale: PHRYGIAN, bpm: [130, 180], drums: { ...METAL, hatBusy: 'xxxxxxxxxxxxxxxx', snare: '..x...x...x...x.' } }],
  ['mc-halftime', 'HALF-TIME HEAVY', 'Těžký half-time groove, který drtí asfalt.', 'A heavy half-time groove that crushes the tarmac.', { root: 48, bpm: [90, 120], riff: 'x...x.x.P---x...' }],
  ['mc-synth', 'SYNTHCORE', 'Metalcore se syntezátory a elektronickými plochami.', 'Metalcore with synths and electronic pads.', { root: 53, pad: 'saw', arpVoice: 'square', arp: 'up' }],
  ['mc-sorrow', 'SORROW', 'Smutný, ale tvrdý: melancholická melodie nad riffy.', 'Sad but heavy: a melancholic melody over the riffs.', { root: 51, scale: HARMONIC, pad: 'strings', bpm: [100, 140] }],
  ['mc-overdrive', 'OVERDRIVE', 'Riffy na plný plyn.', 'Riffs at full throttle.', { root: 52, bpm: [130, 168], riff: 'xxxxxxxxP---xxxx' }],
]);

const ACID_PACK = pack('acid', ACID, ['acid', 'house'], [
  ['ac-303', 'SILVER BOX 303', 'Klasická stříbrná krabička: kvílející a bublající basa.', 'The classic silver box: a squealing, bubbling bass.', { root: 57 }],
  ['ac-squelch', 'SQUELCH', 'Acid, který čvachtá víc s každým šlápnutím na plyn.', 'Acid that squelches more with every push of the throttle.', { root: 52, dist: 0.35 }],
  ['ac-house', 'ACID HOUSE 88', 'Acid house z roku 1988 s varhanním akordem.', 'Acid house from 1988 with an organ chord.', { root: 60, pad: 'organ', bpm: [118, 126] }],
  ['ac-trance', 'ACID TRANCE', 'Acid basa pod trance melodií.', 'An acid bass under a trance melody.', { root: 57, lead: 'supersaw', pad: 'saw', progressions: [[0, 5, 3, 4]], barsPerChord: 1, bpm: [130, 140] }],
  ['ac-techno', 'ACID TECHNO', 'Tvrdé acid techno.', 'Hard acid techno.', { root: 53, kick: 'tekno', bpm: [132, 145], dist: 0.4 }],
  ['ac-smiley', 'SMILEY FACE', 'Veselý acid se smajlíkem.', 'Happy acid with a smiley face.', { root: 62, scale: DORIAN, bpm: [122, 130], brightness: 0.8 }],
  ['ac-rain', 'ACID RAIN', 'Temný acid jako noční déšť.', 'Dark acid like rain at night.', { root: 50, scale: PHRYGIAN, brightness: 0.5, echo: 0.8 }],
  ['ac-jack', 'JACK THE GROOVE', 'Houpavý chicagský groove.', 'A swinging Chicago groove.', { root: 55, swing: 0.2, pad: 'epiano', bpm: [118, 126] }],
  ['ac-desert', 'DESERT ACID', 'Acid v pouštní stupnici.', 'Acid in a desert scale.', { root: 54, scale: HARMONIC }],
  ['ac-overdrive', 'OVERDRIVE 303', 'Přebuzená 303 na hraně zkreslení.', 'An overdriven 303 on the edge of distortion.', { root: 56, dist: 0.55, bpm: [128, 140] }],
]);

const METAL_PACK = pack('metal', METALS, ['metal'], [
  ['mt-gallop', 'IRON GALLOP', 'Cvalový heavy metal riff – jako kůň v plném trysku.', 'A galloping heavy-metal riff – like a horse at full speed.', {}],
  ['mt-thrash', 'THRASH ZONE', 'Rychlý thrash s ostrými riffy.', 'Fast thrash with sharp riffs.', { root: 52, scale: PHRYGIAN, riff: 'xxxxxxxxxxxxP---', bpm: [130, 180] }],
  ['mt-doom', 'DOOM VALLEY', 'Pomalý, těžký doom.', 'Slow, heavy doom.', { root: 45, bpm: [60, 90], riff: 'P-------P---P---', pad: 'organ', bassLow: 26 }],
  ['mt-power', 'POWER QUEST', 'Power metal: dvojkopáky, sbor a hrdinská melodie.', 'Power metal: double kicks, a choir and a heroic melody.', { root: 57, scale: MAJOR, pad: 'choir', progressions: [[0, 4, 5, 3], [0, 3, 4, 4]], bpm: [130, 176] }],
  ['mt-black', 'FROST BLAST', 'Ledový black metal s tremolem.', 'Icy black metal with tremolo picking.', { root: 50, riff: 'xxxxxxxxxxxxxxxx', pad: 'choir', drums: { ...METAL, snare: '..x...x...x...x.' }, bpm: [140, 180], brightness: 0.85 }],
  ['mt-heavy', 'HEAVY ROAD 80s', 'Heavy metal z osmdesátek na otevřenou silnici.', 'Eighties heavy metal for the open road.', { root: 52, riff: 'x.x.P---x.x.P---', drums: ROCK, bpm: [110, 140] }],
  ['mt-speed', 'SPEED KING', 'Speed metal: čím rychleji jedeš, tím rychleji hraje.', 'Speed metal: the faster you drive, the faster it plays.', { root: 54, bpm: [140, 190] }],
  ['mt-symphonic', 'SYMPHONIC STORM', 'Symfonický metal se smyčci a sborem.', 'Symphonic metal with strings and a choir.', { root: 50, scale: HARMONIC, pad: 'strings', gearVoice: 'choir', orchestral: true }],
  ['mt-groove', 'GROOVE MACHINE', 'Groove metal se synkopovaným riffem.', 'Groove metal with a syncopated riff.', { root: 47, riff: 'x..x.x..x.xx.x..', bpm: [100, 130] }],
  ['mt-nu', 'NU STEEL', 'Nu metal s podladěnou kytarou.', 'Nu metal with a down-tuned guitar.', { root: 46, riff: 'x...x.x...x.x.x.', pad: 'glass', bpm: [96, 120], swing: 0.15 }],
]);

const RNR_PACK = pack('rocknroll', RNR, ['rock and roll', 'rock'], [
  ['rr-boogie', 'JUKEBOX BOOGIE', 'Boogie z jukeboxu: kytara, saxofon a shuffle.', 'Jukebox boogie: guitar, sax and a shuffle beat.', {}],
  ['rr-diner', 'DINER 1957', 'Rock\'n\'roll z bistra u silnice v roce 1957.', 'Rock and roll from a roadside diner in 1957.', { root: 60, lead: 'piano' }],
  ['rr-hotrod', 'HOT ROD RUMBLE', 'Hot rod rock s burácející kytarou.', 'Hot-rod rock with a rumbling guitar.', { root: 52, dist: 0.55, lead: 'guitar', bpm: [150, 184] }],
  ['rr-twist', 'TWIST NIGHT', 'Twist celou noc.', 'Twist all night long.', { root: 57, swing: 0.15, bpm: [150, 170] }],
  ['rr-surf', 'SURF CRUISER', 'Surf rock s ozvěnou jako vlny.', 'Surf rock with echoes like waves.', { root: 52, scale: HARMONIC, swing: 0, echo: 0.85, lead: 'guitar', drums: ROCK, progressions: [[0, 0, 3, 3, 4, 3, 0, 4]] }],
  ['rr-rockabilly', 'ROCKABILLY SLAP', 'Rockabilly s plácavou basou.', 'Rockabilly with a slap bass.', { root: 55, bpm: [160, 190] }],
  ['rr-piano', 'PIANO POUNDER', 'Divoké piano, které buší do kláves.', 'A wild piano pounding the keys.', { root: 53, lead: 'piano', pad: 'none', arp: 'up' }],
  ['rr-sax', 'SAX ON ROUTE 66', 'Saxofon na Route 66.', 'A saxophone on Route 66.', { root: 58, lead: 'brass', bpm: [130, 160] }],
  ['rr-blues', 'BLUE SUEDE BLUES', 'Pomalejší blues s houpavým rytmem.', 'A slower blues with a swinging beat.', { root: 52, bpm: [96, 128], swing: 0.33 }],
  ['rr-garage', 'GARAGE ROCK', 'Garážový rock: hlučný a přímočarý.', 'Garage rock: loud and straight ahead.', { root: 57, swing: 0, dist: 0.6, drums: ROCK, lead: 'guitar' }],
]);

const DNB_PACK = pack('dnb', DNBS, ['drum and bass', 'dnb'], [
  ['db-liquid', 'LIQUID SUNSET', 'Liquid drum & bass se zvonky a teplou basou.', 'Liquid drum & bass with bells and a warm bass.', { root: 60 }],
  ['db-neuro', 'NEURO GRID', 'Neurofunk: zkreslená reese basa.', 'Neurofunk: a distorted reese bass.', { root: 50, scale: PHRYGIAN, dist: 0.35, bass: 'dist', pad: 'none', lead: 'saw', brightness: 0.7 }],
  ['db-jungle', 'JUNGLE AMEN', 'Jungle s rozsekaným breakbeatem.', 'Jungle with a chopped breakbeat.', { root: 57, drums: JUNGLE, swing: 0.1, pad: 'strings' }],
  ['db-roller', 'MIDNIGHT ROLLER', 'Půlnoční roller – minimalistický a tlačící.', 'A midnight roller – minimal and driving.', { root: 53, pad: 'none', arp: 'pulse', arpVoice: 'square' }],
  ['db-atmos', 'ATMOSPHERIC', 'Atmosférický DnB s obrovským prostorem.', 'Atmospheric DnB with a huge space.', { root: 62, scale: LYDIAN, space: 1, echo: 0.8 }],
  ['db-jumpup', 'JUMP UP', 'Jump up: skákavá basa a veselý groove.', 'Jump up: a bouncy bass and a cheeky groove.', { root: 55, bass: 'acid', bassPattern: 'acid', lead: 'square' }],
  ['db-dancefloor', 'DANCEFLOOR', 'Taneční DnB s melodií a supersaw.', 'Dancefloor DnB with a supersaw melody.', { root: 57, lead: 'supersaw', pad: 'saw' }],
  ['db-halftime', 'HALFTIME', 'Halftime: pomalejší, těžký groove.', 'Halftime: a slower, heavy groove.', { root: 52, bpm: [80, 90], drums: { ...DNB, kick: 'x...........x...', snare: '........x.......' } }],
  ['db-autobahn', 'AUTOBAHN 174', 'Přesně 174 BPM na dálnici bez omezení.', 'Exactly 174 BPM for the derestricted motorway.', { root: 58, bpm: [168, 178] }],
  ['db-soul', 'SOULFUL', 'Soulový DnB s elektrickým pianem.', 'Soulful DnB with an electric piano.', { root: 63, scale: DORIAN, pad: 'epiano' }],
]);

const CHIP_PACK = pack('chiptune', CHIPS, ['chiptune', '8-bit'], [
  ['ch-level1', 'LEVEL 1', 'Úvodní level 8bitové hry.', 'The first level of an 8-bit game.', { root: 60, scale: MAJOR, progressions: [[0, 3, 4, 0], [5, 3, 4, 4]] }],
  ['ch-boss', 'BOSS FIGHT', 'Souboj s bossem: rychlé a napínavé.', 'Boss fight: fast and tense.', { root: 52, scale: HARMONIC, bpm: [140, 176] }],
  ['ch-racer', 'PIXEL RACER', 'Pixelové závody na plný plyn.', 'Pixel racing at full throttle.', { root: 57, bpm: [140, 170] }],
  ['ch-castle', 'CASTLE STAGE', 'Hradní level s temnou melodií.', 'A castle stage with a dark melody.', { root: 50, scale: PHRYGIAN, bpm: [110, 140] }],
  ['ch-space', 'SPACE SHOOTER', 'Vesmírná střílečka.', 'A space shooter.', { root: 55, echo: 0.5 }],
  ['ch-dungeon', 'DUNGEON CRAWL', 'Plížení podzemím.', 'Crawling through a dungeon.', { root: 48, bpm: [96, 124], brightness: 0.6 }],
  ['ch-highscore', 'HIGH SCORE', 'Nový rekord! Vítězná melodie.', 'New high score! A victory tune.', { root: 64, scale: MAJOR, progressions: [[0, 4, 5, 3]] }],
  ['ch-overworld', 'OVERWORLD', 'Putování po mapě světa.', 'Wandering the world map.', { root: 62, scale: MAJOR, progressions: [[0, 3, 0, 4], [3, 4, 0, 0]], bpm: [110, 140] }],
  ['ch-credits', 'END CREDITS', 'Závěrečné titulky po dohrání hry.', 'The end credits after beating the game.', { root: 59, scale: MAJOR, sevenths: true, progressions: [[3, 4, 2, 5]], bpm: [100, 128] }],
  ['ch-turbo', 'TURBO CARTRIDGE', 'Turbo cartridge – nejrychlejší hra v kazetě.', 'The turbo cartridge – the fastest game on the cart.', { root: 53, bpm: [150, 190] }],
]);

// --- Song packs: classical themes and Christmas carols -----------------------------------
type SongRow = [string, string, string, string, string, Over];

function songPack(packId: string, template: Over, tags: readonly string[], rows: readonly SongRow[]): MusicTrack[] {
  return rows.map(([id, songId, name, cs, en, over]) => T(id, packId, name, cs, en, tags, style(id, template, over, { song: song(songId) })));
}

const CLASSICAL_PACK = songPack('classical', CLASSIC, ['classical'], [
  ['cl-ode', 'odeToJoy', 'ODE TO JOY', 'Beethoven: Óda na radost – s orchestrem, který roste s rychlostí.', 'Beethoven: Ode to Joy – with an orchestra that grows with your speed.', { root: 62, scale: MAJOR, bpm: [90, 132], lead: 'brass', gearVoice: 'choir' }],
  ['cl-canon', 'canonInD', 'CANON IN D', 'Pachelbel: Kánon D dur se smyčci a cembalem.', 'Pachelbel: Canon in D with strings and harpsichord.', { root: 62, scale: MAJOR, bpm: [56, 84], arpVoice: 'harpsichord', bassPattern: 'drone' }],
  ['cl-elise', 'furElise', 'FÜR ELISE', 'Beethoven: Pro Elišku na klavír.', 'Beethoven: Für Elise on the piano.', { root: 57, scale: HARMONIC, bpm: [100, 140], lead: 'piano', pad: 'none', arp: 'up', bass: 'pluck' }],
  ['cl-mountain', 'mountainKing', 'MOUNTAIN KING', 'Grieg: V jeskyni horského krále – zrychluje s tebou až do šílenství.', 'Grieg: In the Hall of the Mountain King – speeds up with you into madness.', { root: 59, bpm: [70, 176], lead: 'strings', drumThreshold: 0.3, drums: { kick: 'x.......x.......', snare: '', hat: '', hatBusy: '', tom: 'x...x...x...x...' }, bassPattern: 'ostinato' }],
  ['cl-nacht', 'nachtmusik', 'EINE KLEINE NACHTMUSIK', 'Mozart: Malá noční hudba pro smyčce.', 'Mozart: A Little Night Music for strings.', { root: 55, scale: MAJOR, bpm: [110, 140], arpVoice: 'harpsichord' }],
  ['cl-vltava', 'vltava', 'VLTAVA (THE MOLDAU)', 'Smetana: Vltava – řeka teče s tvou jízdou.', 'Smetana: The Moldau – the river flows with your drive.', { root: 64, bpm: [84, 120], lead: 'flute', bassPattern: 'ostinato' }],
  ['cl-largo', 'largo', 'NEW WORLD LARGO', 'Dvořák: Largo ze symfonie Z Nového světa.', 'Dvořák: Largo from the New World Symphony.', { root: 60, scale: MAJOR, bpm: [52, 72], lead: 'flute', bassPattern: 'drone' }],
  ['cl-danube', 'blueDanube', 'BLUE DANUBE WALTZ', 'Strauss: Na krásném modrém Dunaji – valčík za volantem.', 'Strauss: The Blue Danube – a waltz at the wheel.', { root: 62, scale: MAJOR, bpm: [120, 168], bass: 'pluck' }],
  ['cl-toccata', 'toccata', 'TOCCATA IN D MINOR', 'Bach: Toccata d moll na varhany.', 'Bach: Toccata in D minor on the organ.', { root: 62, bpm: [56, 88], lead: 'organ', pad: 'organ', bass: 'sub', bassPattern: 'drone', arp: 'up', arpVoice: 'piano', gearVoice: 'organ' }],
  ['cl-minuet', 'minuetG', 'MINUET IN G', 'Bach/Petzold: Menuet G dur na cembalo.', 'Bach/Petzold: Minuet in G on the harpsichord.', { root: 55, scale: MAJOR, bpm: [96, 132], lead: 'harpsichord', arpVoice: 'harpsichord', pad: 'none' }],
]);

const XMAS_PACK = songPack('christmas', XMAS, ['christmas', 'vanoce'], [
  ['xm-jingle', 'jingleBells', 'JINGLE BELLS', 'Rolničky v houpavém big-band aranžmá s rolničkami.', 'Jingle Bells in a swinging big-band arrangement with sleigh bells.', { root: 60, scale: MAJOR, swing: 0.25, bpm: [100, 150], bassPattern: 'walking', lead: 'brass' }],
  ['xm-wewish', 'weWish', 'WE WISH YOU A MERRY CHRISTMAS', 'Veselé Vánoce přejem vám – s orchestrem a rolničkami.', 'We Wish You a Merry Christmas – with an orchestra and sleigh bells.', { root: 55, scale: MAJOR, drums: { ...WALTZ, jingle: 'x.x.x.x.x.x.' }, bpm: [110, 150], bassPattern: 'alberti', lead: 'brass' }],
  ['xm-silent', 'silentNight', 'SILENT NIGHT', 'Tichá noc jako hrací skříňka se sborem.', 'Silent Night as a music box with a choir.', { root: 60, scale: MAJOR, drums: NONE, drumThreshold: 9, pad: 'choir', bassPattern: 'drone', bass: 'sub', bpm: [56, 76], gearVoice: 'strings' }],
  ['xm-tannen', 'tannenbaum', 'O CHRISTMAS TREE', 'Ó jedličko s flétnou a smyčci.', 'O Christmas Tree with a flute and strings.', { root: 55, scale: MAJOR, drums: { ...WALTZ, jingle: 'x...x...x...' }, lead: 'flute', bassPattern: 'alberti', bpm: [80, 112] }],
  ['xm-deck', 'deckTheHalls', 'DECK THE HALLS (8-BIT)', 'Deck the Halls jako 8bitová hra.', 'Deck the Halls as an 8-bit game.', { ...CHIPS, root: 60, scale: MAJOR, drums: { ...CHIP, jingle: 'x.x.x.x.x.x.x.x.' }, bpm: [110, 156] }],
  ['xm-joy', 'joyToTheWorld', 'JOY TO THE WORLD (SYNTHWAVE)', 'Joy to the World v neonovém synthwave.', 'Joy to the World in neon synthwave.', { root: 60, scale: MAJOR, kick: 'punch', drums: { ...FOUR_FLOOR, clap: true, jingle: '..x...x...x...x.' }, pad: 'saw', bass: 'saw', lead: 'saw', arpVoice: 'saw', bpm: [96, 124] }],
  ['xm-hark', 'harkTheHerald', 'HARK THE HERALD (EPIC)', 'Hark the Herald jako epický filmový trailer.', 'Hark the Herald as an epic film trailer.', { root: 60, scale: MAJOR, orchestral: true, pad: 'choir', lead: 'brass', bass: 'cello', bassPattern: 'ostinato', drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: '', hatBusy: '..x...x...x...x.', tom: 'x..x..x.x..x.xx.', jingle: 'x.x.x.x.x.x.x.x.' }, bpm: [78, 108] }],
  ['xm-ocome', 'oComeAllYe', 'O COME ALL YE FAITHFUL', 'Pojďte, věrní – katedrální varhany.', 'O Come All Ye Faithful – cathedral organ.', { root: 55, scale: MAJOR, drums: NONE, drumThreshold: 9, pad: 'organ', lead: 'organ', bass: 'sub', bassPattern: 'drone', bpm: [66, 92], gearVoice: 'choir', orchestral: true }],
  ['xm-noel', 'firstNoel', 'THE FIRST NOEL (LO-FI)', 'The First Noel jako pohodový lo-fi beat.', 'The First Noel as a cosy lo-fi beat.', { root: 60, scale: MAJOR, pad: 'epiano', bass: 'pluck', bassPattern: 'alberti', lead: 'flute', vinyl: true, swing: 0.2, drums: { ...WALTZ, jingle: '..x...x...x.' }, bpm: [72, 96] }],
  ['xm-wenceslas', 'wenceslas', 'GOOD KING WENCESLAS (ROCK)', 'Good King Wenceslas – Dobrý král Václav – jako rock\'n\'roll.', 'Good King Wenceslas as rock and roll.', { ...RNR, root: 55, scale: MAJOR, progressions: DEFAULTS.progressions, lead: 'guitar', drums: { ...SHUFFLE, jingle: 'x.x.x.x.x.x.x.x.' }, bpm: [120, 168] }],
  ['xm-bells', 'carolOfTheBells', 'CAROL OF THE BELLS (METAL)', 'Koleda zvonů v metalové verzi.', 'Carol of the Bells as heavy metal.', { ...METALS, root: 55, scale: MINOR, riff: 'x.x.xxx.x.xx', drums: { kick: 'x.x.x.x.x.x.', snare: '....x.......', hat: 'x...x...x...', hatBusy: 'x.x.x.x.x.x.', kickBusy: 'xxxxxxxxxxxx', jingle: 'x.x.x.x.x.x.' }, bpm: [120, 176], lead: 'guitar', pad: 'choir' }],
  ['xm-godrest', 'godRestYe', 'GOD REST YE (TECHNO)', 'God Rest Ye Merry Gentlemen jako vánoční techno.', 'God Rest Ye Merry Gentlemen as Christmas techno.', { ...TECHNO, root: 52, scale: MINOR, drums: { ...FOUR_FLOOR, jingle: '..x...x...x...x.' }, lead: 'square', bpm: [120, 132] }],
  ['xm-greensleeves', 'greensleeves', 'WHAT CHILD IS THIS', 'Greensleeves (What Child Is This) na cembalo a smyčce.', 'Greensleeves (What Child Is This) on harpsichord and strings.', { ...CLASSIC, root: 57, scale: MINOR, lead: 'harpsichord', arpVoice: 'harpsichord', bpm: [84, 116] }],
  ['xm-auld', 'auldLangSyne', 'AULD LANG SYNE (TRANCE)', 'Silvestrovská Auld Lang Syne jako trance hymna.', 'New Year\'s Auld Lang Syne as a trance anthem.', { root: 60, scale: MAJOR, drums: { ...FOUR_FLOOR, jingle: '..x...x...x...x.' }, kick: 'punch', pad: 'saw', bass: 'saw', bassPattern: 'rolling', lead: 'supersaw', arpVoice: 'saw', bpm: [120, 138], gearVoice: 'choir' }],
  ['xm-kings', 'weThreeKings', 'WE THREE KINGS', 'My tři králové – tajemná cesta za hvězdou s bubny.', 'We Three Kings – a mysterious journey after the star, with drums.', { root: 64, scale: MINOR, lead: 'flute', drums: { ...WALTZ, tom: 'x..x..x..x.x', jingle: 'x...x...x...' }, bassPattern: 'drone', bass: 'cello', bpm: [84, 120] }],
]);

export const TRACKS: readonly MusicTrack[] = [
  ...DRIVE_MUSIC, ...TECHNO_PACK, ...TEKNO_PACK, ...HARD_PACK, ...CORE_PACK, ...ACID_PACK,
  ...CLASSICAL_PACK, ...METAL_PACK, ...RNR_PACK, ...DNB_PACK, ...CHIP_PACK, ...XMAS_PACK,
];

/** Music pack ids in garage order. */
export const MUSIC_PACK_IDS = ['drive-music', 'christmas', 'techno', 'tekno', 'hardstyle', 'acid', 'dnb', 'metalcore', 'metal', 'rocknroll', 'classical', 'chiptune'] as const;
