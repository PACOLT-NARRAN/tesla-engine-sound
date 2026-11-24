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
