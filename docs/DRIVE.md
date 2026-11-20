# Drive Profiles, manual shifting and entitlements

## Drive Profiles (`src/drivetrain/driveProfiles.ts`)

Typed data. The drivetrain and audio engine contain no profile-specific branches.

| field | COMFORT | SPORT | TRACK | effect |
|---|---|---|---|---|
| upshiftRpmFactor | 0 | 0.35 | 0.75 | relaxed upshift point between the engine's gentle and full-throttle shift RPM |
| downshiftRpmFactor | 0 | 0.25 | 0.55 | how early the gearbox downshifts |
| gearHoldTime (s) | 0 | 0.3 | 0.6 | extra wait between automatic shifts |
| shiftCooldown (×) | 1.25 | 1 | 0.7 | shift duration |
| holdGearOnLift | no | yes | yes | engine braking: stay in gear when lifting off |
| throttleResponse | 0.7 | 1 | 1.4 | pedal follow speed |
| loadResponse | 0.75 | 1 | 1.35 | RPM follow speed (less smoothing) |
| throttleBlipAmount | 0.15 | 0.35 | 0.55 | rev-match blip on downshifts |
| audioTransitionSmoothing | 1.8 | 1 | 0.55 | audio parameter smoothing |
| engineBraking | 0.3 | 0.65 | 1 | off-throttle sound level |
| overrunAmount (×) | 0.25 | 1 | 1.4 | lift-off crackle |
| crackleAmount (×) | 0.3 | 1 | 1.4 | downshift exhaust crack |

SPORT matches the behaviour REVLINE had before Drive Profiles existed. Limits are in
`DRIVE_PROFILE_LIMITS`. The settings field is still called `shiftStyle` so that stored settings
keep working.

## Gearbox

- **Automatic** (default): the gearbox shifts by itself. The paddles, the wheel scroll and ↑/↓
  override it by up to ±2 gears for 15 s.
- **Manual**: the driver selects every gear (paddles, scroll, ↑/↓, E/Q); M toggles.
  - Neutral is available only while standing.
  - An upshift that would drop below idle × 0.85 is refused (`would-stall`).
  - A downshift that would pass limiter − 150 rpm is refused (`over-rev`).
  - Two automatic recoveries: 1st when the car stops, and one gear down before a stall.
  - The limiter is reached normally if the driver does not upshift.
- Refused requests are shown for 1.4 s under the gear (OVER-REV, TOO LOW, LIMIT, PRO ONLY).

## Entitlements (`src/entitlements/entitlements.ts`)

- Capabilities: `manual-shifting`, `drive-profile.sport`, `drive-profile.track`. COMFORT is
  always free.
- `PRODUCT.earlyAccess = true`: everyone is PRO until purchases exist (€9.99 lifetime is set in
  the same object).
- On a GPS drive, a locked choice is kept but COMFORT / automatic runs. In Demo, the locked
  profile and manual shifting play as a preview.
- Developer Mode → **Simulate plan** (AUTO / FREE / PRO) tests the locked states. It is stored in
  `revline.developer.v1` v2.

## Tesla manual test

1. Settings → Drive profile.
   1. Drive the same road in COMFORT, then in TRACK.
   2. TRACK should hold gears much longer, crackle more on lift-off and blip on downshifts.
2. Press the right-hand paddles ▲/▼ while driving in automatic. HUD shows `AUTO −1`.
3. Press A/M (or Settings → Gearbox → MANUAL). HUD shows `MANUAL`.
   1. Accelerate. The engine must reach the limiter in gear until you press ▲.
   2. Press ▼ at speed until `OVER-REV` appears.
   3. Stop. The gear returns to 1.
