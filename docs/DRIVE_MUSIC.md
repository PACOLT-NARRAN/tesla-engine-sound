# DRIVE MUSIC pack (update 31)

Five "engines" that are generative music instead of an engine sound. Everything is composed and
synthesised live in the browser: no samples, no recordings, no third-party music.

| Engine | Style | Tempo |
|---|---|---|
| NIGHT DRIVE SYNTHWAVE | 80s synthwave, A minor | 86–118 BPM |
| MOTORWAY TECHNO | four-on-the-floor, acid bass | 112–134 BPM |
| LO-FI CITY CRUISE | swung beat, electric piano, vinyl crackle | 72–92 BPM |
| AMBIENT LANDSCAPE | slow lydian chords, glass bells | 64–88 BPM |
| EPIC FILM SCORE | strings, cellos, taiko, brass | 78–108 BPM |

## How the drive plays the music

| Driving | Music |
|---|---|
| Standing still | pad chords and an occasional soft bell |
| Speed | tempo rises; layers join: bass, kick, hats, snare, arpeggio, busy hats at motorway speed |
| Accelerating | brighter filter, louder notes, a lead melody (a 2-bar motif repeated with variation) |
| Braking | the music "sinks": low-pass closes, drums go half-time, more reverb |
| Steering (GPS course change) | arpeggio and melody move to the side you turn to, bells sparkle there, the echo swirls |
| Hold REV (standing) | riser and a snare roll build up; release = crash and a 2-bar drop |
| NITRO | riser + full energy |
| Upshift | new section (crash, other chord progression), at most every 4 bars |
| Downshift | drum fill on the last beat, at most every 2 bars |

Layer changes happen on bar lines, so the music never stumbles.

## Code

- `src/audio/music/musicStyles.ts`: the five styles (pure data).
- `src/audio/music/musicBrain.ts`: the composer (pure, unit tested in `tests/music.test.ts`).
- `src/audio/music/MusicEngine.ts`: Web Audio instruments, echo, generated reverb, master filter.
  Notes are scheduled 0.35 s ahead of the audio clock; finished notes disconnect themselves.
- `src/profiles/musicEngines.ts`: the pack's profiles and catalog entries (`audio.music`).
- `MotionEstimator` now reports `turnRate` (deg/s) from `coords.heading`, or from the bearing
  between positions at least 5 m apart when the car's browser gives no heading.

The debug overlay (`?debug=1`) shows the style, BPM, active layers and the turn rate.

## Measured in the sandbox

48 s offline renders (Chromium, one slow CPU, scheduled progressively like the live app)
took 8.5–17 s, i.e. 18–35 % of real time. Not yet measured in the car.

# Update 32: 12 music packs, songs, gear instruments, Garage tabs

## Packs (125 tracks)

| Pack | Tracks | Price (example) |
|---|---|---|
| HUDBA JÍZDY / DRIVE MUSIC | 10 (5 original + deep house, nu-disco, trance, darksynth, city pop) | 4.99 € |
| VÁNOČNÍ EDICE / CHRISTMAS | 15 carols, each in a different style | 4.99 € |
| TECHNO, TEKNO, HARDSTYLE, ACID, DRUM & BASS, METALCORE, METAL, ROCK'N'ROLL, CLASSICAL, 8-BIT CHIPTUNE | 10 each | 2.99 € |

Generative tracks are variations of a genre template (key, tempo, grooves, sounds) in
`src/audio/music/tracks.ts`. Song tracks play a written melody from `src/audio/music/songData.ts`
(traditional carols and classical themes, all public domain, typed from memory as note text:
`E4.2` = pitch + length in 16ths; chords one per bar, `F,C` = two per bar).

Christmas: Jingle Bells, We Wish You a Merry Christmas, Silent Night, O Christmas Tree, Deck the
Halls (8-bit), Joy to the World (synthwave), Hark the Herald (epic), O Come All Ye Faithful (organ),
The First Noel (lo-fi), Good King Wenceslas (rock'n'roll), Carol of the Bells (metal), God Rest Ye
(techno), What Child Is This / Greensleeves, Auld Lang Syne (trance), We Three Kings.

Classical: Ode to Joy, Canon in D, Für Elise, In the Hall of the Mountain King (speeds up with you),
Eine kleine Nachtmusik, Vltava, New World Largo, Blue Danube, Toccata in D minor, Minuet in G.

## Gears add instruments

| Gear | Adds |
|---|---|
| 2 | a sustained counter-line (strings / brass / organ / choir, per style) |
| 3 | sparkling bells |
| 4 | a choir |
| 5 | a harmony voice under the melody |
| 6+ | faster sparkle |

Upshift = a 4-note rising fanfare (and a new section every 4+ bars); downshift = a drum or timpani fill.
Metalcore: braking turns the riff into a breakdown.

## New instruments

Distorted guitars (palm-mute chugs, power chords, boogie), hardstyle kick with a tail and reverse
bass, screech lead, supersaw, reese bass, 303 acid, chip square/triangle, organ, choir, piano,
harpsichord, timpani, sleigh bells. Hats, sleigh bells and the crash are pre-rendered once per
track (cheaper than filtering noise on every hit); pads use two voices per note and stop when
their tail is ~35 dB down.

## Garage

Tabs VŠE / MOTORY / ZÁBAVNÉ ZVUKY / HUDBA with counts; music and fun tabs show one shortcut chip
per pack. "⚙ Filtry": hide FREE engines, hide what is not unlocked, show fun sounds / music under
VŠE (music is off by default so the 125 tracks do not flood the list). A search looks in every tab.
The tab and the filters are remembered (`revline.garageView.v1`).

## Pulling away

The revs no longer jump to about a quarter of the dial when the car starts moving: the clutch
"bites" over 1.1 s and the RPM rise is limited while pulling away (1 400–4 200 rpm/s by throttle).
Measured on the test V8: 0.2 s after pulling away ≈1 200 rpm instead of ≈1 930 rpm.

## Measured in the sandbox

40 s offline renders (one slow CPU core): 20–46 % of real time depending on the style
(rock'n'roll and the Christmas big band are the heaviest). Not yet measured in the car.
