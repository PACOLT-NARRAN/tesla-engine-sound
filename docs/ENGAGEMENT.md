# Profile & Engagement (Phase 6)

Local profile, statistics, achievements, collections, challenges and a shareable Garage card.
Everything is stored **only in this browser** — no backend, no sync, nothing is sent.

## Code

| File | Role |
|---|---|
| `src/engagement/stats.ts` | Statistics model, counting rules (`StatsTracker`), days / streak, storage schema |
| `src/engagement/achievements.ts` | Achievements (stable ids), collections, challenges (`ChallengeProvider`) |
| `src/engagement/profileCard.ts` | User profile (name, vehicle), share card + share text |
| `src/core/EngineSession.ts` | Feeds the tracker every tick, batches writes, awards achievements |
| `src/components/ProfilePanel.tsx` | PROFILE screen (display only — no rules in the component) |
| `src/components/AchievementToast.tsx` | Short "achievement unlocked" note on the Drive screen |
| `tests/engagement.test.ts` | Unit tests |

## Storage keys

- `revline.statistics.v1` — totals only.
- `revline.achievements.v1` — `{ unlocked: { id: epochMs } }`.
- `revline.profile.v1` — `{ displayName, vehicle }` (max 24 chars each, control characters removed).

Never stored: positions, routes, home location, speeds, per-drive timestamps.
Only the calendar DAYS with a session are kept (for the streak; max 400).

## Counting rules

- **Active driving time** grows only while the engine is ON (START, not a Garage preview),
  the car **moves** (filtered speed ≥ 1.5 m/s ≈ 5 km/h) and, on GPS, the signal is `good` or `poor`.
  An open app, a parked car, the REV pedal or a lost GPS signal add nothing.
  One tick adds at most 0.5 s (a throttled background tab cannot add a burst).
- **Session** = one ignition cycle (START → ENGINE OFF) with ≥ 60 s of active driving. Counted once,
  when it crosses 60 s.
- **Active day** = a local calendar day with a counted session. **Streak** = consecutive active days
  ending today, or yesterday (so it survives until you drive today). The best streak is kept.
- **Tried**: an engine after 30 s of active driving with it (total); its layout (V / inline / boxer /
  rotary) at the same moment. A Drive Profile after 30 s with it (Demo previews of locked profiles count).
- **Top RPM**: highest simulated RPM while the engine runs. It is not a speed value.
- **Manual Demo session**: a counted Demo session with ≥ 60 s of manual shifting.
- **Sound Studio engines created**: new saves (edits do not count).

Writes are batched: every 15 s while driving, immediately on a milestone (session, engine tried…),
on ENGINE OFF, when the tab is hidden and on `pagehide`.

## Achievements (ids are stable — never rename)

`first-ignition`, `five-engines`, `three-layouts`, `ten-sessions`, `seven-day-streak`,
`manual-driver` (10 min manual), `profile-explorer` (COMFORT+SPORT+TRACK), `garage-builder`
(5 favorites), `studio-creator`, `jdm-collector`, `italian-collection`.

`awardAchievements()` is idempotent: an awarded id keeps its first date and is never awarded again,
even if the condition stops being true (e.g. a favorite is removed). Achievements already earned
before this build (e.g. five favorites) are awarded silently when the app loads; later awards show
a 6-second toast on the Drive screen (only while no sheet is open).

## Collections and challenges

Collections come from the catalog: all engines, each origin with ≥ 2 engines, each premium pack.
Challenges are computed live from the statistics (`LOCAL_CHALLENGES`). A future online source
implements the same `ChallengeProvider` interface (`online: true`).

## Share card

Allow-listed fields only: display name, vehicle, favorite (most-driven) engine, driving time,
collection count, achievements count + newest three, streak, Garage theme, the public app URL
(without query string). Uses the Web Share API when available, otherwise the clipboard, otherwise
a text box to copy by hand.

## Community / leaderboard

Nothing online exists. The Profile says so. Future rankings may use time, collections,
achievements, challenges, Studio creations and streaks — never speed, acceleration or GPS
performance. No mock users are shown.

## Reset

Settings → Local data → RESET STATISTICS clears statistics and achievements (name, favorites
and engines stay). RESET ALL LOCAL DATA also clears the profile.
