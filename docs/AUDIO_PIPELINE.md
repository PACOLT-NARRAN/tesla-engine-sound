# Audio conversion pipeline (GTA `.awc` → web)

The runtime never touches GTA formats. A one-off, local Node script turns each engine's `.awc` into a
handful of small Opus loops plus a JSON manifest under `public/audio/<id>/`.

## Requirements

| Tool | Why | Install |
|------|-----|---------|
| Node ≥ 22.18 | runs the script | — |
| [vgmstream-cli](https://vgmstream.org) | decodes Rockstar AWC to WAV | Windows: download release zip · macOS: `brew install vgmstream` · Linux: release binary |
| ffmpeg with libopus | encodes loops | `winget install ffmpeg` / `brew install ffmpeg` / `apt install ffmpeg` |

Alternative to vgmstream: open the `.awc` in **CodeWalker** (Windows), export every stream as WAV into a
folder and pass `--wav-dir <folder>`.

## Run

```bash
git clone https://github.com/Velkostatkar/qb-changesound ../qb-changesound

# 1st run: copies originals, decodes, writes a stream report and a mapping GUESS, then stops.
npm run audio:import -- --repo ../qb-changesound --engine k20a

# Listen to audio-source/decoded/k20a/stream_*.wav, fix tools/audio-import/mapping/k20a.json,
# set "verified": true, then run again:
npm run audio:import -- --repo ../qb-changesound --engine k20a

# Everything at once (each engine still needs a verified mapping, or use --accept-guess):
npm run audio:import -- --repo ../qb-changesound --all
```

Options: `--codec opus|aac|wav` (default `opus`; `aac` gives `.m4a` for old iOS Safari), `--bitrate 96k`,
`--bands 8`, `--loop 0.45` (loop length in seconds), `--vgmstream <path>`, `--ffmpeg <path>`.

## What each step does

1. **Preserve originals** → `audio-source/original/<id>/` (`<id>.awc`, `<id>_npc.awc`, all `audioconfig/<id>_*`).
   `audio-source/` is git-ignored and never deployed.
2. **Decode** → `vgmstream-cli -m` lists the streams; each is exported with `vgmstream-cli -i -s N -o stream_NN.wav`.
3. **Report** → `audio-source/decoded/<id>/streams.json` (index, duration, sample rate, RMS).
4. **Mapping** (`tools/audio-import/mapping/<id>.json`):
   ```json
   {
     "profileId": "k20a",
     "verified": true,
     "on":  { "streams": [0, 1], "gains": [1, 0.85], "rpmStart": 850, "rpmEnd": 8600, "curve": null },
     "off": { "streams": [2, 3], "gains": [1, 0.85], "rpmStart": 850, "rpmEnd": 8600, "curve": null },
     "pops": [ { "stream": 5, "start": 1.20, "end": 1.31 } ]
   }
   ```
   - `on` = accel/load sweep(s), `off` = decel/overrun sweep(s). Several streams (engine + exhaust) are mixed with `gains`.
   - `rpmStart`/`rpmEnd`: RPM at the start and end of the sweep. If the sweep is not linear, give
     `curve: [[seconds, rpm], …]`. Values can be read from the `dat151` granular settings in CodeWalker, or by ear.
   - `pops`: optional time ranges cut out as backfire one-shots; otherwise the app uses its placeholder crackle.
   - The first run writes a guess (longest streams = on, next = off, RPM = profile idle→limiter) with `verified: false`.
5. **Loops**: for each of 8 log-spaced RPMs between idle and limiter, the script finds that moment in the sweep,
   takes ~0.45 s, refines the length by autocorrelation to a whole number of engine cycles (`120/rpm` s each),
   bakes a 20 ms equal-power crossfade into the seam and normalises loudness. A weak periodicity score is reported.
6. **Encode**: each loop is written **twice back-to-back** and encoded to Opus/WebM, mono, 96 kb/s.
   The manifest loops the **middle** period (`loopStart = 0.5·L`, `loopEnd = 1.5·L`), so codec priming
   delay or end padding can never land inside the loop — no click at the loop point.
7. **Publish**: `public/audio/<id>/{on,off}_<rpm>.webm` + `manifest.json`, and the profile gets
   `audio.converted: true`. Commit those files; GitHub Pages serves them.

Typical size per engine: 16 loops × ~10 KB ≈ 160–200 KB. Only the selected engine is downloaded.

## Runtime (how the loops are played)

`src/audio/EngineAudioEngine.ts`:

```
band loops (on + off per RPM band) ─► per-band gain (equal-power RPM crossfade, only 2 bands audible)
                                      playbackRate = rpm / bandRpm × pitch calibration
   ─► on-bus / off-bus (load: throttle vs. overrun)
   ─► low-pass "tone" (opens with load and RPM)
   ─► shift duck (ignition cut on upshift, swell on rev-matched downshift)
   ─► limiter flutter ─► engine level (RPM + load) × profile volume ─► master volume ─► compressor ─► speakers
pops (overrun crackle, upshift bark) ──────────────────────────────────────────► master
```

All changes use `setTargetAtTime` (25–60 ms time constants), so there are no zipper noises or clicks.
Loops are decoded once into memory, so losing the network after start-up doesn't interrupt sound.

## Placeholder (TODO)

`src/audio/placeholder/synthEngine.ts` generates loops of the same shape procedurally (firing-order
harmonics, combustion variation, pulsed noise, forced-induction whine) for profiles with
`audio.converted: false`. It is clearly labelled in the UI and should be deleted when all banks are converted.

## Per-stream curves (mapping v2)

A part's `streams` entry may be an object instead of a stream index:

```json
{ "stream": 8, "gain": 0.9, "curve": [[0.15, 5760], [9.6, 1380]], "skip": [[2.2, 3.85]] }
```

Each stream is then de-chirped on its own RPM curve and the constant-RPM results are mixed, so an
engine sweep and an exhaust sweep with different timing can be combined. `skip` drops a time range
(e.g. a gear-change noise burst). An optional top-level `"idle": { "stream": 12, "rpm": 852, "upTo": 1.25 }`
uses a steady idle recording for bands up to `rpm × upTo`. RPMs outside a sweep's range are reached
by resampling its nearest end. `tools/audio-import/mapping/k20a.json` is a worked example: RPM was
measured as 30 × the 2nd-order (firing) frequency of the inline-4.

## Mapping from the AWC metadata (automatic)

When the original `<id>.awc` (and the `audioconfig/<id>_*.nametable` files) are available, the importer
builds the mapping itself (`"source": "awc-metadata"`, see `tools/audio-import/lib/awc.mjs`):

- **Stream names.** Each AWC stream id is the low 29 bits of `joaat(name)`. Hashing the standard
  granular-engine names (`engine_accel`, `exhaust_accel`, `engine_decel`, `exhaust_decel`,
  `engine_idle`, `exhaust_idle`, `startup`, `shutdown`) plus every name in the bank's nametables
  identifies every stream: exhaust pops, dump-valve blow-offs, wastegate, doors, …
- **Exact RPM curves.** The granular sweeps carry a grain table (chunk `0x5A`: start sample + grain
  frequency). One grain is one engine cycle, so `rpm = 120 × grainHz`. On k20a the measured firing
  frequency is exactly 4.00 × the grain frequency on all four sweeps.
- **Effects.** `pops` (overrun crackle and upshift bark), `blowoff` (lift-off after a high-load pull),
  `startup` and `shutdown` are exported as one-shots and listed in the manifest. Doors, the wastegate
  and other extras are listed under `unused` in the mapping.

Re-run with `--remap` to rebuild an existing mapping from the metadata. If an engine has no metadata
(names not found, or no grain table) the importer falls back to the duration-based guess and stops.

### Idle mix (exhaust + engine)

When the AWC has both `exhaust_idle` and `engine_idle`, the mapping's `idle.with` names the second
recording. The importer picks a loop length that is (almost) a whole number of cycles of both,
extracts a seamless loop from each, stretches the second by the small remaining mismatch (<1 %)
and sums them (`idle.with.gain`, default 0.9).

### Turbo whistle and shift crack (runtime)

`audio.turbo` (0..1) adds a continuous synthesised whistle that fades in from ~25 % of the RPM range
(full at ~65 %), pitch rising with RPM, 40 % quieter on overrun. Default: 0.5 for turbo / twin-turbo /
twin-charged profiles, 0 otherwise. `audio.shiftBark` fires an exhaust crack on downshifts only
(upshifts stay clean), louder at higher throttle.

### Built-in PCM decoder, shared names, mixed sample rates

- Most FiveM engine packs store plain 16-bit PCM in their AWC. The importer now decodes those
  directly (`decodePcmAwc` in `lib/awc.mjs`, bit-identical to vgmstream within 1 LSB); vgmstream is
  only needed for other codecs.
- Stream names are resolved with the bank's own nametables plus the nametables of every other
  imported pack and a list of stock GTA V extras (`COMMON_NAMES`: exhaust/limiter pops, dump
  valves, `start_up` / `shut_down`). If no pop names resolve, short unnamed one-shots
  (0.06–0.6 s) are used as pops and marked `guessed` in the mapping.
- When the mapped loop streams use different sample rates (e.g. 32 kHz exhaust + 48 kHz engine),
  they are resampled (windowed sinc) to the highest rate before mixing.
- Verified on all 19 granular packs: the strongest spectral line of every accel sweep is an exact
  integer multiple of the grain frequency (e.g. 4.00x on the I4, 6.00x on the V12 exhaust),
  so rpm = 120 x grain Hz holds for all of them.
- `p60b40` is an older non-granular pack (8 constant-pitch loops at 22 kHz, no names); it still
  uses the synthesiser until it gets a hand-made mapping.

## Output stage (21 November 2026)

`src/audio/outputStage.ts` replaced the single master gain + compressor:

```
engine level → volume → low shelf 110 Hz (bass) → peak 55 Hz (bass) → drive ×2.5 (×5 with BOOST)
             → glue compressor (−20 dB, 3.5:1) → limiter (−3 dB, 20:1) → tanh soft clip (ceiling 0.94) → out
```

- Measured offline in Chromium on an engine-like test signal: about +7 dB average level at the same
  slider position, more at quiet levels (idle); VOLUME BOOST adds about +2–4 dB more. Peaks stay
  below 0.95, so nothing clips.
- Settings: `volumeBoost` (dock BOOST button and Settings) and `bassBoost` 0..1 (Settings slider,
  up to +12 dB shelf and +6 dB sub peak). Missing fields in older stored settings get the defaults
  (off / 0), so the settings schema version did not change.
- The car's own media volume still sets the speaker level; music and REVLINE share it.

### Sound quality, treble and stereo width (21 November 2026)

- **Source quality is the limit.** The engine banks in `public/audio` are 508 mono 16-bit WAV files:
  338 at 32 kHz (+ ~92 at 32.001–32.007 kHz), 69 at 48 kHz, 8 at 24 kHz, 1 at 44.1 kHz. A 32 kHz file
  holds sound only up to 16 kHz. The Web Audio graph itself works in 32-bit float at the car's
  output rate (48 kHz in the Tesla), so it adds no loss; upsampling cannot add detail that is not
  recorded. Better sound needs better recordings (48 kHz, ideally stereo) — see the recording TODO.
- **Treble** (`treble` 0..1): opens the load-dependent tone low-pass up to ×2 (max 15.5 kHz) and a
  +6 dB high shelf at 3.5 kHz.
- **Stereo width** (`stereoWidth` 0..1): mid/side from the mono signal — side = 13 ms delayed,
  280 Hz high-passed copy, ±0.6 at full width. L + R sums back to mono (no cancellation); bass
  below ~280 Hz stays mono for the subwoofer. Measured: side −9.7 dB under mid at full width,
  peaks < 0.9.
- **Subwoofer and front/rear:** a web page outputs two channels only; the car's own crossover sends
  the low end to the subwoofer. Front/rear balance and the subwoofer level are set in the car
  (Controls → Audio → Balance / Tone). The app says so in Settings.
