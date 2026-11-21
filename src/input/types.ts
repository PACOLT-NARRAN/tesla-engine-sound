/**
 * Typed input layer. Every physical input (keyboard, mouse / steering wheel, native scroll,
 * touch) is turned into a small set of normalized DRIVE ACTIONS by an adapter. The rest of the
 * app only ever sees actions, so a future Tesla-specific adapter can be added without touching
 * the drivetrain or the UI.
 */

/** What the driver asked for. More actions (E/Q/M, mode toggle) arrive with manual mode. */
export type DriveAction = 'shift-down' | 'shift-up' | 'toggle-transmission';

/**
 * Which adapter produced / observed an event.
 * - keyboard: arrow / page keys
 * - wheel: DOM `wheel` events (mouse wheel, touchpad, a steering wheel mapped to a mouse wheel)
 * - scroll-trap: native scrolling caught by the optional scroll trap (wheel that only scrolls)
 * - touch: pointer / touch input (logged only)
 * - window: focus, blur, visibility, page scroll (logged only)
 * - tesla: reserved for a future adapter that uses a dedicated Tesla API, if one ever exists
 */
export type InputAdapterId = 'keyboard' | 'wheel' | 'scroll-trap' | 'touch' | 'window' | 'tesla';

export type InputEventKind = 'wheel' | 'scroll' | 'keydown' | 'keyup' | 'pointerdown' | 'focus' | 'blur' | 'visibility';

/** Result of handing an action to the session. */
export type ShiftOutcome =
  | 'applied'
  | 'ignition-off'
  | 'no-gear' // car standing / neutral: there is no automatic gear to offset
  | 'at-limit' // already in 1st / top gear
  | 'out-of-range' // first / top gear, or the gear would pass the rev limiter
  | 'over-rev' // manual: downshift would pass the rev limiter
  | 'would-stall' // manual: upshift would drop below idle
  | 'locked' // needs REVLINE PRO
  | 'switched' // automatic ↔ manual changed
  | 'debounced' // too soon after the previous step of the same gesture
  | 'blocked'; // a settings sheet is open, or driving input is disabled

/** One diagnostics log line. Never contains coordinates or anything personal. */
export interface InputLogEntry {
  id: number;
  /** ms since page load (performance.now). */
  t: number;
  kind: InputEventKind;
  adapter: InputAdapterId;
  /** Short description of the event target, e.g. `div.cockpit`. */
  target: string;
  dx: number | null;
  dy: number | null;
  deltaMode: number | null;
  key: string | null;
  code: string | null;
  action: DriveAction | null;
  outcome: ShiftOutcome | null;
  note: string | null;
}
