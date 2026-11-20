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
