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
  override it for 15 s; repeated taps skip several gears (down to 1st / up to top, within the rev range).
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

## Driver rail and NITRO (21 November 2026)

- Rail order (left edge, top to bottom): **AUTO / MANUAL** switch, ▲, REV, ▼, **NITRO**.
- NITRO (`NitroButton.tsx`) is cosmetic: hold it for a gas-purge hiss (`EngineAudioEngine.setNitro`,
  high-passed noise with a 5 kHz peak, 17 Hz flutter and a low whoosh, through the output stage)
  and vapour jets that burst sideways from behind the tachometer (`NitroPurge`, CSS animation).
  It does not change RPM, gears or speed. `SessionState.nitro` is not persisted; it is released
  on pointer up / cancel, window blur, tab hide and ignition off.

## Update 29: gear logic and braking latency

- **Cruise floor** (`DriveProfileConfig.cruiseRpmFactor`: COMFORT 0.13, SPORT 0.20, TRACK 0.30 of the
  idle → limiter range). The automatic never settles below it, so it no longer lugs in a needlessly tall gear.
- **Steady cruising** (|accel| < 0.35 m/s² under a little throttle for 1.2 s) upshifts when RPM is above
  floor × 1.3 and the next gear stays above the floor, so it no longer holds a low gear at constant speed.
- **Upshift curve** `smoothstep(0.35, 1, throttle)`: a moderate EV pull shifts near the relaxed point;
  only a real push holds gears to the top. SPORT/TRACK relaxed shift points were lowered (0.25 / 0.55).
- **Braking** (accel < −1.2 m/s²): downshifts below floor × 1.2, at most every 0.45 s, with no upshifts.
- **Lift-off hold** (SPORT/TRACK) lasts 5 s unless the car brakes hard, then the gearbox settles again.
- **Braking latency**: `MotionEstimator` now trusts a clear fix-to-fix speed change at once
  (`fastResponseGain` 0.8 above max(0.6 m/s², 2.5 × running noise)), with alpha 0.75 and beta 0.3.
  Test `tests/latency.test.ts`: braking at 4 m/s² with 1 Hz GPS lags the true speed by about 1.6 km/h on
  average, compared with 12.9 km/h before (about 1 s behind). Pedal smoothing is 0.09 s up and 0.08 s down.
- `f/carspeed` (browser-car-speed) was reviewed. It adds a 3-reading median and acceleration limiting
  for reliability, which adds delay, so it was not adopted. Its stale and unknown handling is already covered here.

## Random engine

Hold **ENGINE** in the dock for 2 s to jump to a random engine you may drive (never the current one).
A tap still opens the Garage.

## Background sound (browser minimised)

The Tesla owner's manual says browser audio continues when the browser is minimised. The simulation clock
runs in a Web Worker (`src/core/tickClock.ts`), so hidden-page timer throttling does not freeze it.
The Media Session (`src/core/mediaSession.ts`) shows "REVLINE · engine" in the car's Miniplayer, with
play, pause and stop. Closing the browser tab itself ends the page, and with it the sound.
