# Audio inventory: Velkostatkar/qb-changesound

Phase 1 findings. Source: https://github.com/Velkostatkar/qb-changesound (branch `main`, 7 commits).

> **Verification limits.** The build sandbox could read the repository's file listings and text files
> through the GitHub web UI, but it could **not download the binary audio files** (`github.com`
> and `raw.githubusercontent.com` were unreachable from the shell). File names, folder layout and
> `config.lua` below are verified. Stream counts and codecs inside each `.awc` are **not** verified;
> the import tool prints them (`audio-source/decoded/<id>/streams.json`) the first time you run it.

## What the FiveM resource does

`config.lua` maps a menu label to a GTA audio "game name" (README: `/cs` opens the menu). The text of
`client.lua` and `fxmanifest.lua` could not be read through the web view; resources like this normally
apply the name with the `ForceUseAudioGameObject` native and register the `.awc` banks and `.rel` files
as streamed DLC audio in the manifest. None of that runs in a browser; it is reference only.

## Engines (`config.lua` → `Config.EngineSounds`)

| Menu label (verbatim)            | Sound name   | Player bank                       | NPC bank                              |
|----------------------------------|--------------|-----------------------------------|---------------------------------------|
| avesv                            | `avesv`      | `sfx/dlc_avesv/avesv.awc`         | `sfx/dlc_avesv/avesv_npc.awc`         |
| Aud/Lamb 5.2L V10                | `lambov10`   | `sfx/dlc_lambov10/lambov10.awc`   | `…/lambov10_npc.awc`                  |
| Dragster Twin-Charged V8SCT      | `musv8`      | `sfx/dlc_musv8/musv8.awc`         | `…/musv8_npc.awc`                     |
| shonen                           | `shonen`     | `sfx/dlc_shonen/shonen.awc`       | `…/shonen_npc.awc`                    |
| Tyta 2JZ-GTE 3.0L I6-T           | `toysupmk4`  | `sfx/dlc_toysupmk4/toysupmk4.awc` | `…/toysupmk4_npc.awc`                 |
| Nian RB26DETT 2.6L I6-TT         | `rb26dett`   | `sfx/dlc_rb26dett/rb26dett.awc`   | `…/rb26dett_npc.awc`                  |
| Mzd 13B-REW 1.3L Twin-Rotor      | `rotary7`    | `sfx/dlc_rotary7/rotary7.awc`     | `…/rotary7_npc.awc`                   |
| Pgni-AMG M297 7.3L V12           | `m297zonda`  | `sfx/dlc_m297zonda/m297zonda.awc` | `…/m297zonda_npc.awc`                 |
| diablov12                        | `diablov12`  | `sfx/dlc_diablov12/diablov12.awc` | `…/diablov12_npc.awc`                 |
| f40v8                            | `f40v8`      | `sfx/dlc_f40v8/f40v8.awc`         | `…/f40v8_npc.awc`                     |
| f50v12                           | `f50v12`     | `sfx/dlc_f50v12/f50v12.awc`       | `…/f50v12_npc.awc`                    |
| ferrarif12                       | `ferrarif12` | `sfx/dlc_ferrarif12/ferrarif12.awc` | `…/ferrarif12_npc.awc`              |
| murciev12                        | `murciev12`  | `sfx/dlc_murciev12/murciev12.awc` | `…/murciev12_npc.awc`                 |
| Pgni-AMG M158 6.0L V12TT         | `m158huayra` | `sfx/dlc_m158huayra/m158huayra.awc` | `…/m158huayra_npc.awc`              |
| Hnd K20A 2.0L I4                 | `k20a`       | `sfx/dlc_k20a/k20a.awc`           | `…/k20a_npc.awc`                      |
| Rsche RS 4.0L Flat-6             | `gt3flat6`   | `sfx/dlc_gt3flat6/gt3flat6.awc`   | `…/gt3flat6_npc.awc`                  |
| Frd-Shlby Predator 5.2L V8SC     | `predatorv8` | `sfx/dlc_predatorv8/predatorv8.awc` | `…/predatorv8_npc.awc`              |
| p60b40                           | `p60b40`     | `sfx/dlc_p60b40/p60b40.awc`       | `…/p60b40_npc.awc`                    |
| Brbs 850 6.0L V8-TT              | `brabus850`  | `sfx/dlc_brabus850/brabus850.awc` | `…/brabus850_npc.awc`                 |
| sestov10                         | `sestov10`   | `sfx/dlc_sestov10/sestov10.awc`   | `…/sestov10_npc.awc`                  |

The `dlc_avesv` folder was opened and contains exactly `avesv.awc` and `avesv_npc.awc`; the other
19 folders follow the same naming in the listing.

## `audioconfig/` (binary metadata, not audio)

| File pattern                 | What it is in GTA V audio                                                                    | Present for |
|------------------------------|----------------------------------------------------------------------------------------------|-------------|
| `<id>_game.dat151.rel`       | Game objects: vehicle/engine audio settings (incl. granular-engine settings) that tell the game which sounds to use and how. | all 20 |
| `<id>_sounds.dat54.rel`      | Sound objects: the sound graph that points at waves inside the `.awc` container.              | all 20 |
| `<id>_amp.dat10.rel`         | Synth/effect presets (the "amp" patch).                                                      | gt3flat6, k20a, m158huayra, m297zonda, rb26dett, shonen |
| `*.nametable`                | String table with the readable names behind the hashes in the `.rel` file.                  | about half of the engines |
| `rb26dett_game.dat151`, `rb26dett_sounds.dat54` | Extra copies without `.rel` (probably a leftover export).               | rb26dett |

These are Rockstar RAGE binary formats. They can be inspected with CodeWalker (exports `.rel.xml`).
The web app does not read them; the relevant numbers (RPM range, which stream is accel/decel) are
entered once per engine in `tools/audio-import/mapping/<id>.json`.

## Format assessment

| Asset | Browser can decode? | Action |
|-------|---------------------|--------|
| `.awc` (Rockstar Audio Wave Container, magic `ADAT`) | **No.** No browser understands the container; on PC the payload is usually PCM or IMA ADPCM. | Convert: `vgmstream-cli` decodes AWC → WAV per stream (or export WAVs with CodeWalker). |
| `.dat151/.dat54/.dat10 .rel`, `.nametable` | Not audio. | Reference only; values transcribed into mapping files. |
| `_npc.awc` | Same as above. Lower-quality bank GTA uses for other people's cars. | Preserved, not converted by default. |

## What the banks contain (expected structure)

GTA V add-on engine banks of this kind are **granular engines**: the player `.awc` normally holds
several long streams, each a recording of the engine sweeping slowly through its RPM range, separated
into *engine* and *exhaust* for *accel (on load)* and *decel (off load)*, plus idle material. Those sweeps
are not loops and are not one-shot RPM samples, so they cannot be played as-is.

**Web plan:** decode every stream → listen and map which streams are the on/off sweeps and their RPM range →
cut short seamless loops at 8 RPM points from each sweep → encode to Opus. The browser runtime then plays
RPM-band layers with crossfades (see `AUDIO_PIPELINE.md`). This is the browser equivalent of what the
game's granular synthesiser does, done once offline instead of per grain.

## Current status in this project

- All 20 engines have a profile in `src/profiles/engines/<id>.json`. Their names are the labels from `config.lua`.
  Specs that the label doesn't state (redline, gearbox) are estimates and are marked as such in each description.
- **No bank has been converted yet** (binaries could not be downloaded here). Every profile has
  `audio.converted: false` and plays a procedural **placeholder** (`TODO(placeholder-audio)`), shown as
  `SYNTH PREVIEW` in the engine selector and `SOUND · SYNTH` in the HUD.
- Run the import tool once (see `AUDIO_PIPELINE.md`) and the real sound replaces the placeholder with no code change.
