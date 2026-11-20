# User settings — verified behaviour

## Virtual gearing (SHORT / MEDIUM / ORIGINAL)

Shown before Phase 1 as "Full revs at ~100 / ~130 / ~160 KM/H". Traced through the code:

| UI | Stored value (`settings.gearing`) | Effect |
|---|---|---|
| SHORT | `fun` | final drive × 1.6 (160/100) |
| MEDIUM (default) | `normal` | final drive × 1.23 (160/130) |
| ORIGINAL | `real` | final drive × 1 (profile as written) |

- Implemented by `withGearing()` in `src/core/settings.ts`, applied in `EngineSession.geared()` whenever the
  profile, gearing or shift style changes. Only `gearbox.finalDrive` changes.
- A shorter final drive means more engine RPM at the same road speed (`rpm = wheel rpm × gear ratio × final drive`),
  so the automatic gearbox reaches the high-rev part of the sound at lower speeds.
- It is **not** a Demo target speed: Demo scenarios (`src/motion/demoScenarios.ts`) and the GPS source never read it.
  Audio only follows the resulting RPM.
- The old labels came from how the K20A felt with the automatic gearbox. They were never exact: the speed at the
  limiter in top gear ranges from about 150 to 400 km/h depending on the engine. That is why the UI now names the
  setting by what it does instead of a speed, which also removes the old "KM/H" label shown in MPH mode.
- Stored values are unchanged, so saved settings keep working.

## Shift style (COMFORT / SPORT / TRACK)

`withShiftStyle()` moves the light-throttle upshift / downshift points toward the full-throttle ones
(sport: 35 % / 25 %, track: 60 % / 45 %). It currently affects only shift timing; richer Drive Profiles are Phase 4.

## Language

`settings.language` is `null` until the user picks one; then the browser language decides (Czech or Slovak → Czech,
otherwise English). Switching re-renders React without a reload; the audio session is not touched.

## Local data

Everything is stored only in this browser through `src/storage/storage.ts`:

| Key | Schema | Content |
|---|---|---|
| `revline.settings.v1` | v2 (v1 = bare object from earlier releases, migrated on load) | preferences |
| `revline.favorites.v1` | v1 | favorite engine ids |
| `revline.recentEngines.v1` | v1 | last used engine ids, newest first, max 3 |

Corrupted JSON, wrong types or out-of-range values fall back to defaults per field and never crash the app.
Data written by a newer build is ignored (not overwritten) until the user changes a setting.
Settings → Local data offers Reset Favorites / Last Used / All (with confirmation). No location data is ever stored.
