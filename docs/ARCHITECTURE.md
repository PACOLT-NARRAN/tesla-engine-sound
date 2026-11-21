# Architecture

```
 GeolocationMotionSource ─┐            (only the input differs between GPS and Demo)
 DemoMotionSource ────────┴─► RawFix ─► MotionEstimator ─► MotionState ─► VirtualDrivetrain ─► DrivetrainState
                                                                                              │       + events
                                                                                              ▼
                                                              EngineAudioEngine (Web Audio) ◄─┘
                                                                                              │
                                                 Telemetry (mutable, read by HUD via rAF) ◄───┘
```

`EngineSession` (src/core) owns the chain, runs a 50 Hz simulation tick (`setInterval`), and exposes:
- `store` — low-frequency state (ignition, mode, GPS/audio status, settings) for React via `useSyncExternalStore`;
- `telemetry` — high-frequency values mutated in place; HUD components read them in `requestAnimationFrame`
  and write to DOM refs, so React does **not** re-render on every GPS fix or audio tick.

## Modules

| Folder | Responsibility | Browser APIs |
|--------|----------------|--------------|
| `src/motion` | Sources (GPS, demo scenarios) and `MotionEstimator`: validation, coords.speed vs. Haversine fallback, outlier gate, alpha-beta filter, stationary hysteresis + rest anchor, stale/lost detection, short dead-reckoning between fixes. | Geolocation (source only) |
| `src/drivetrain` | `gearbox.ts` (RPM through ratio × final drive, load-dependent shift lines, hysteresis), `throttle.ts` (acceleration + resistance → virtual pedal, overrun), `VirtualDrivetrain` (clutch slip at launch, shift transients with ignition cut / rev-match, inertia + slew limit, limiter, start-up flare). | none |
| `src/profiles` | One JSON per engine in `engines/`, auto-discovered with `import.meta.glob`, validated by `schema.ts`. | none |
| `src/audio` | `SoundBankLoader` (manifest → decoded buffers, per-profile, cached), `layerMix.ts` (pure crossfade/gain math), `EngineAudioEngine` (graph + automation), `placeholder/` (TODO synth). | Web Audio |
| `src/core` | `EngineSession`, `Store`, persisted settings (no GPS data persisted). | localStorage |
| `src/components`, `src/pages`, `src/hooks` | React UI. | DOM |

Pure modules (`motion`, `drivetrain`, `layerMix`, `synthEngine`, `profiles/schema`) are tested in Node
with `node --test` (TypeScript type-stripping; no test framework dependency).

## Motion estimation details

- Reject: non-finite/out-of-range coordinates, accuracy > 50 m, non-increasing timestamps, > 90 m/s,
  implied |Δv/Δt| > 12 m/s² (re-sync after 3 consecutive outliers to avoid lock-out).
- Speed: `coords.speed` when present; else Haversine distance / Δt (Δt ≥ 0.25 s), with movement inside
  30 % of the accuracy radius treated as jitter, and — while parked — anything within the accuracy circle
  around the rest position treated as zero.
- Filter: alpha-beta (α 0.5 good fix / 0.2 poor fix, β 0.15) gives smoothed speed and acceleration.
- Stationary: enter < 0.45 m/s, leave > 0.9 m/s.
- Between fixes the estimate is extrapolated for ≤ 1.2 s; after 3 s it is "stale" (acceleration 0, speed held),
  after 10 s "lost". The drivetrain also limits RPM slew (14 000 rpm/s up, 9 000 down), so a bad fix can't make
  the engine jump.

## Adding an engine

1. Add `src/profiles/engines/<id>.json` (copy an existing one; `id` must match the file name).
2. Optional: convert audio with `npm run audio:import -- --repo … --engine <id>`.
No code changes.

## Future hooks (not implemented)

- Accounts/payments: add a gate around `EngineSession.selectProfile` / profile list; profiles already carry an `id`.
- PWA: static assets + per-profile audio under `public/audio/` are cacheable; add a service worker and web manifest.

## Platform foundation (Phase 1)

| Folder / file | Responsibility |
|---|---|
| `src/storage/storage.ts` | `LocalStore`: the only place that touches `localStorage`. Versioned envelope `{ v, data }`, step-wise migrations, per-field sanitising, safe defaults, `clearAll()` for Reset Local Data. Tests use an in-memory backend. |
| `src/storage/engineLists.ts` | Favorites / Last Used: pure list functions + their schemas. Lists store stable engine ids only. |
| `src/i18n/` | Typed English/Czech dictionaries (`en.ts` is the reference; `cs.ts` must have every key — enforced by the type and a test). `translator(lang)` gives `t(key, params)`, `t.dyn()` for keys built from data ids, `t.num()` for locale number formatting. `useT()` re-renders on language change. |
| `src/profiles/catalog.ts` | User-facing product metadata per engine id (marketing name, localized description, origin, tags, tier, pack). Technical data stays in `engines/*.json`; audio stays in `public/audio/<id>/`. |
| `src/profiles/presentation.ts` | Title / subtitle / layout / induction text for an engine. Internal ids are never used as titles. |
| `src/components/DeveloperPanel.tsx` | Developer Mode (only with `?debug=1`): internal ids, storage schema state, profile load errors, Copy diagnostics (no coordinates). |

`EngineSession` owns favorites, recent engines and the effective `locale` in its `Store`, alongside settings.
Language, theme and reset actions never touch the AudioContext or the simulation loop.
See `docs/SETTINGS.md` for the verified meaning of every setting.

## Phase 2 — Input layer and diagnostics

`src/input/` holds the typed input layer (adapters → normalized `DriveAction` → `ShiftOutcome`)
and the in-memory diagnostics log shown in Developer Mode. `useManualShift` is now a thin hook
over `InputController`. See [INPUT.md](INPUT.md) for details and the Tesla test plan.

## Garage

`src/components/Garage.tsx` is a full-screen layer opened from the ENGINE button. It sits over
the Drive screen, so the engine, audio and GPS keep running while you browse.

- `src/garage/garage.ts`: pure logic, unit tested. It builds items from profile + catalog, handles
  filters (FREE/PRO/packs, induction, layout, favorites, last used, custom), runs the
  accent-insensitive AND search over name, layout, induction, tags, pack and description in both
  languages (never the internal bank id), and sorts.
- `src/garage/labels.ts`: localized search words.
- `src/profiles/packs.ts`: premium pack definitions. There are none yet; badges and the filter
  are ready for them.
- `EngineDetail.tsx`: full technical data, Preview, Select and DRIVE WITH THIS ENGINE.
- Preview (`EngineSession.previewEngine`, script in `src/core/preview.ts`) plays a 6.5 s rev
  sequence through the normal drivetrain and audio pipeline with the car standing still. It runs
  only while the ignition is off. Starting the engine or selecting another engine stops it.
- The old `EngineSelector` sheet was removed.

## Sound Studio (Phase 5)

Custom engines live in `src/studio/` and are documented in [STUDIO.md](STUDIO.md).

- The session joins built-in and custom engines through `findProfile()` / `allProfiles()`.
- Nothing else in the drivetrain or the audio pipeline knows that an engine is custom.

## Profile & Engagement

`src/engagement/` holds pure domain services (statistics tracker, achievements, collections,
challenges, share card). `EngineSession` feeds the tracker from its simulation tick and batches
storage writes; `ProfilePanel` only displays the results. See `docs/ENGAGEMENT.md`.

## Product tiers and entitlements

All feature checks go through `src/entitlements/entitlements.ts`; prices live only in
`products.ts` and `packs.ts`. The session separates the SELECTED engine (`profileId`) from the
RUNNING one (`activeEngine`): a locked engine plays in Demo, a GPS drive runs the fallback.
See `docs/MONETIZATION.md`.

## Your engine recording (Phase 8, local prototype)

`src/recording/` holds the "upload your engine recording" prototype. `recording.ts` is pure
(validation, measurements, waveform, the `LocalRecordingProcessor`); `browserAudio.ts` decodes
and plays with its own AudioContext; `contracts.ts` only describes a future backend. Nothing is
uploaded or stored. The screen (`RecordingLab.tsx`) opens from the Sound Studio. See
`docs/RECORDING.md`.

## Community (Phase 9, demo Marketplace)

`src/community/` holds the Marketplace domain: `models.ts` (types), `mockData.ts` (bundled demo
items), `api.ts` (the `MarketplaceApi` boundary, `MockMarketplaceApi`, search) and `install.ts`
(install / update / lock rules, local favorites and ratings, publication checks). Installing
saves the engine as a Sound Studio engine (`custom-cm…`), so the Garage and the drivetrain need
no new code. See `docs/COMMUNITY.md`.

## Backend proposal (Phase 10, not implemented)

There is still no server. `docs/BACKEND.md` compares Supabase, Firebase and Azure and recommends
Supabase (EU) + Stripe + a separate FFmpeg worker. It plugs into the three existing seams:
`resolveEntitlements()`, `RecordingBackend` (`src/recording/contracts.ts`) and `MarketplaceApi`
(`src/community/api.ts`). Nothing is built without approval.
