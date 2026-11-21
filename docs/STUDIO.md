# Sound Studio

Users can create their own engines in the Garage (**+ SOUND STUDIO**, **EDIT**, or
**USE AS BASE IN SOUND STUDIO** on a built-in engine). Everything stays in this browser.

## What a custom engine is

A custom engine has two parts:

| Part | Source |
|---|---|
| **Behaviour profile** (layout, revs, gearbox, response) | The user's settings, turned into a normal `EngineProfile` by `buildCustomProfile()` |
| **Sound** | Either one of the project-owned **recorded banks** (`public/audio/<id>/`) or the **built-in synthesiser** |

The Studio never creates a new recording. The editor, the Garage card ("RECORDED SOUND" /
"SYNTH PREVIEW") and the detail row ("Recorded sound bank of …") say which source plays.
Your own recordings can be checked and previewed in **YOUR ENGINE RECORDING** (local prototype,
see [RECORDING.md](RECORDING.md)); they do not drive the engine sound yet.

## Files

- `src/studio/customEngine.ts`: the pure model, with no React and no registry.
  - Types, `LIMITS`, `validateSpec`, the editor draft (`toDraft` / `parseDraft`) and `generateRatios`.
  - `buildCustomProfile`, `specFromProfile` and `duplicateSpec`.
  - The storage schema `revline.customEngines.v1`.
- `src/components/SoundStudio.tsx`: the editor, a full-screen layer inside the Garage.
- `EngineSession`: `findProfile`, `allProfiles`, `canSelect`, `saveCustomEngine`, `deleteCustomEngine` and `previewDraft`.
- `src/entitlements/entitlements.ts`: `canCreateCustomProfile`, `canUseCustomGearing` and `canUseEngine`.
- `tests/studio.test.ts`.

## Parameter mapping

| Editor | Effect |
|---|---|
| Max RPM | Redline. The limiter is 200 RPM higher. Shift points are derived from idle..redline using the same proportions as the built-in engines. |
| Gearbox type | Shift duration and minimum time between shifts: dual-clutch 0.16 s, manual 0.38 s, automatic 0.5 s. |
| Gears / final drive / my ratios | Gear ratios. They are generated (close-ratio, strictly descending) unless the user enters their own. |
| Throttle response | `dynamics.engineResponse = 0.08 / k` and `throttleSensitivity = √k`. |
| Engine braking | How early the gearbox downshifts when coasting (the gentle downshift RPM). |
| Crackle | `audio.overrunPops`, the pops on lift-off. |
| Overrun sound | `audio.offLoad`, the loudness of the off-throttle layer (×0.6 to ×1.4). |
| Exhaust | Overall volume, the downshift crack and the synthesiser tone. |
| Turbo / supercharger | `audio.turbo` (the existing whistle) and `audio.supercharger` (a new RPM-locked whine). Each is only active for a matching induction. |

The Drive profile (COMFORT / SPORT / TRACK) is still applied on top, exactly as for built-in engines.

## Borrowed banks and the RPM mapping

A custom engine can rev differently from the bank it borrows. In that case `audio.bankRpm`
holds the bank's idle..limiter range. The audio engine (`soundRpm()` in `layerMix.ts`) maps
the engine's own idle..limiter linearly onto that range, so a recording is never pitched far
outside the range it was made for. The tachometer, the gearbox and the shift lights still use
the custom RPM.

Banks are cached by manifest (`bankCacheKey`). A custom engine and its source engine
therefore share one decoded bank.

## Validation

Each rule produces an inline message in both languages:

- Every number must be finite (NaN, Infinity and text are rejected) and within `LIMITS`, with the allowed number of decimals.
- The cylinder count must fit the layout. A rotary has 2 to 4 rotors.
- Idle must be at least 3,000 RPM below the max RPM.
- Custom ratios: one per gear, each between 0.40 and 6.00, and each gear at least 0.05 lower than the one before.
- The name is required (at most 40 characters). The description is at most 200 characters.

## Storage

- Engines are stored in `revline.customEngines.v1`, at most 50.
- On load, an entry that cannot be repaired into a valid engine is dropped; the app never crashes.
- Deleting an engine (after confirmation) also removes it from Favorites and Last Used.
- **RESET ALL LOCAL DATA** deletes all custom engines.

## Entitlements

| Plan | Can do |
|---|---|
| FREE | Open the Studio, design an engine and hear it with PREVIEW |
| PRO | Save engines, enter own ratios, and select / drive custom engines |

If PRO is missing (Developer Mode → Simulate plan → FREE):

- custom engines stay saved and listed;
- they cannot be selected;
- the default engine takes over.

These are UI checks, not payment security.
