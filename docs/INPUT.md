# Input and steering-wheel diagnostics (Phase 2)

## Architecture

```
DOM events ──► InputController (src/input/InputController.ts)
                 ├─ adapters: keyboard · wheel · scroll-trap · touch (log only) · window (log only) · tesla (reserved)
                 ├─ normalize.ts: deltaMode → px, notch accumulator (40 px), debounce (220 ms), key map
                 ├─ DriveAction: 'shift-down' | 'shift-up'
                 └─ InputDiagnostics (ring buffer, 150 entries, Developer Mode only)
                         │
EngineSession.manualShift(±1) ──► VirtualDrivetrain.manualShift → ShiftOutcome
```

`ShiftOutcome` tells exactly why a request did or did not change gear:
`applied`, `ignition-off`, `no-gear` (car standing / neutral), `at-limit` (already in 1st / top gear),
`out-of-range` (first / top gear or the limiter), `debounced`, `blocked` (inside a sheet).

Driving input is active only with the ignition on and no panel open. Events inside an open
sheet are never captured, so lists keep scrolling.

## Scroll trap (experimental, Developer Mode)

If a steering wheel scrolls the page without firing `wheel` events, the page cannot see it
because the cockpit does not scroll. With the scroll trap the cockpit sits inside a scroll
container that is kept in the middle of a tall spacer; any native scroll offset is turned into
a shift and the container is re-centred. Stored as `revline.developer.v1`. Off by default,
because on a touch screen a swipe on the cockpit also scrolls it.

## Tesla manual test plan

1. Open `https://pacolt-narran.github.io/tesla-engine-sound/?debug=1`.
2. Start the engine (GPS or Demo → Highway) and drive / wait until a gear ≥ 2 is shown.
3. Roll the left steering-wheel scroll button down one notch, then up one notch.
4. Watch the overlay line `input` and `gear … manual …`.
5. Open DEV → Input diagnostics:
   - "Wheel input detected" + `wheel [wheel] … → shift-down (applied)`: wheel works.
   - Only `scroll [window]` lines: the wheel scrolls natively → enable Scroll trap, close the panel, repeat 3–5.
   - Only `keydown` lines: note the `key` / `code` values; a key adapter mapping is needed.
   - "No compatible wheel event detected" and nothing new in the log: the Tesla browser does not pass the button to web pages.
6. COPY LOG (or take a photo of the log) and send it.

## Tesla test result (21 November 2026)

- **Parked (P):** the left scroll wheel reaches the page as keyboard `ArrowUp` / `ArrowDown`
  (`keyup [keyboard] … key=ArrowDown`), so wheel shifting works through the key adapter.
- **Drive (D):** the car takes the scroll wheel for the cruise-control speed; the page receives
  no event at all (the diagnostics log stays silent). A web page cannot change this.
- Consequence: while driving, shifting is done on the touch screen. The ▲ / ▼ paddles therefore
  sit on the **driver's (left) side** together with the REV pedal in one control rail
  (`ShiftPaddles.tsx`, `.driver-rail`), within reach of the driver.
