import type { InputDiagnostics } from './InputDiagnostics.ts';
import { NotchAccumulator, StepLimiter, describeTarget, keyToAction, wheelDeltaPx } from './normalize.ts';
import type { DriveAction, InputAdapterId, InputEventKind, InputLogEntry, ShiftOutcome } from './types.ts';

export interface InputControllerOptions {
  /** Hands a normalized action to the session and reports what happened. */
  onAction: (action: DriveAction) => ShiftOutcome;
  /** Driving input is active only on the Drive screen with the ignition on. */
  isDriveEnabled: () => boolean;
  /** True for targets that must keep their normal behaviour (open settings sheets). */
  isBlocked: (target: EventTarget | null) => boolean;
  /** Developer Mode log; null in normal use (nothing is recorded). */
  diagnostics: InputDiagnostics | null;
  now?: () => number;
}

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

interface WheelLike extends Event { deltaX: number; deltaY: number; deltaZ: number; deltaMode: number }
interface KeyLike extends Event { key: string; code: string; repeat: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }
interface PointerLike extends Event { pointerType?: string }
interface ScrollBox { scrollTop: number; scrollHeight: number; clientHeight: number }

/**
 * Listens to raw DOM input, normalizes it to DriveActions and (in Developer Mode) logs every
 * event so a real car can tell us what its steering-wheel scroll button actually produces.
 */
export class InputController {
  private readonly wheelAcc = new NotchAccumulator();
  private readonly trapAcc = new NotchAccumulator();
  private readonly keys = new StepLimiter();
  private readonly now: () => number;
  private readonly cleanups: (() => void)[] = [];
  private trap: (Listen & ScrollBox) | null = null;
  private lastScroll: { target: EventTarget | null; t: number } = { target: null, t: -Infinity };

  private readonly o: InputControllerOptions;

  constructor(o: InputControllerOptions) {
    this.o = o;
    this.now = o.now ?? (() => performance.now());
  }

  /** Attach to `window` (wheel, keys, pointer, focus) and `document` (scroll capture, visibility). */
  attach(win: Listen, doc: Listen): () => void {
    this.on(win, 'wheel', (e) => this.onWheel(e as WheelLike), { passive: false });
    this.on(win, 'keydown', (e) => this.onKeyDown(e as KeyLike));
    this.on(win, 'keyup', (e) => {
      const k = e as KeyLike;
      this.log(e, 'keyup', 'keyboard', { key: k.key, code: k.code });
    });
    this.on(win, 'pointerdown', (e) => this.log(e, 'pointerdown', 'touch', { note: (e as PointerLike).pointerType ?? null }), { passive: true });
    this.on(win, 'focus', (e) => this.log(e, 'focus', 'window'));
    this.on(win, 'blur', (e) => this.log(e, 'blur', 'window'));
    this.on(doc, 'visibilitychange', (e) => this.log(e, 'visibility', 'window', { note: typeof document === 'undefined' ? null : document.visibilityState }));
    // Scroll does not bubble; capture sees scrolling of the page and of any element.
    this.on(doc, 'scroll', (e) => {
      if (this.trap && e.target === (this.trap as unknown)) return; // handled by onTrapScroll
      // A scrolling list fires many events: log at most one per target every 150 ms.
      const t = this.now();
      if (e.target === this.lastScroll.target && t - this.lastScroll.t < 150) return;
      this.lastScroll = { target: e.target, t };
      const box = e.target as Partial<ScrollBox> | null;
      this.log(e, 'scroll', 'window', { dy: typeof box?.scrollTop === 'number' ? box.scrollTop : null, note: 'native scroll (no shift)' });
    }, { capture: true, passive: true });
    return () => this.detach();
  }

  /**
   * Optional scroll trap: a scroll container around the cockpit kept in the middle of a tall
   * spacer. If the steering wheel only scrolls (no wheel event), the scroll offset is read and
   * turned into shift actions, then the container is re-centred.
   */
  attachScrollTrap(el: Listen & ScrollBox): () => void {
    this.trap = el;
    this.recentre();
    const handler = () => this.onTrapScroll();
    el.addEventListener('scroll', handler, { passive: true });
    return () => {
      el.removeEventListener('scroll', handler);
      if (this.trap === el) this.trap = null;
      this.trapAcc.reset();
    };
  }

  detach(): void {
    while (this.cleanups.length) this.cleanups.pop()?.();
  }

  private on(t: Listen, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.cleanups.push(() => t.removeEventListener(type, fn, opts));
  }

  private onWheel(e: WheelLike): void {
    const base = { dx: e.deltaX, dy: e.deltaY, deltaMode: e.deltaMode };
    if (this.o.isBlocked(e.target)) return void this.log(e, 'wheel', 'wheel', { ...base, outcome: 'blocked', note: 'inside sheet' });
    if (!this.o.isDriveEnabled()) return void this.log(e, 'wheel', 'wheel', { ...base, note: 'drive input off' });
    e.preventDefault();
    const r = this.wheelAcc.feed(wheelDeltaPx(e.deltaY, e.deltaMode), this.now());
    this.log(e, 'wheel', 'wheel', { ...base, ...this.dispatch(r) });
  }

  private onKeyDown(e: KeyLike): void {
    const base = { key: e.key, code: e.code };
    // Browser shortcuts (Ctrl+Q, Cmd+M …) are never captured.
    if (e.ctrlKey || e.metaKey || e.altKey) return void this.log(e, 'keydown', 'keyboard', base);
    const action = keyToAction(e.key, e.code);
    if (!action) return void this.log(e, 'keydown', 'keyboard', base);
    if (this.o.isBlocked(e.target)) return void this.log(e, 'keydown', 'keyboard', { ...base, action, outcome: 'blocked', note: 'inside sheet' });
    if (!this.o.isDriveEnabled()) return void this.log(e, 'keydown', 'keyboard', { ...base, action, note: 'drive input off' });
    e.preventDefault();
    if (e.repeat) return void this.log(e, 'keydown', 'keyboard', { ...base, note: 'repeat ignored' });
    const outcome = this.keys.allow(this.now()) ? this.o.onAction(action) : 'debounced';
    this.log(e, 'keydown', 'keyboard', { ...base, action, outcome });
  }

  private onTrapScroll(): void {
    const el = this.trap;
    if (!el) return;
    const delta = el.scrollTop - this.centre(el);
    if (Math.abs(delta) < 1) return; // our own re-centring
    this.recentre();
    const fake = { target: el } as unknown as Event;
    if (!this.o.isDriveEnabled()) return void this.log(fake, 'scroll', 'scroll-trap', { dy: delta, note: 'drive input off' });
    const r = this.trapAcc.feed(delta, this.now());
    this.log(fake, 'scroll', 'scroll-trap', { dy: delta, ...this.dispatch(r) });
  }

  private dispatch(r: ReturnType<NotchAccumulator['feed']>): Pick<InputLogEntry, 'action' | 'outcome' | 'note'> {
    if (!r) return { action: null, outcome: null, note: 'partial notch' };
    if (r.debounced) return { action: r.action, outcome: 'debounced', note: null };
    return { action: r.action, outcome: this.o.onAction(r.action), note: null };
  }

  private centre(el: ScrollBox): number {
    return Math.max(0, Math.round((el.scrollHeight - el.clientHeight) / 2));
  }

  private recentre(): void {
    if (this.trap) this.trap.scrollTop = this.centre(this.trap);
  }

  private log(e: Event, kind: InputEventKind, adapter: InputAdapterId, extra: Partial<Omit<InputLogEntry, 'id' | 't' | 'kind' | 'adapter'>> = {}): void {
    const d = this.o.diagnostics;
    if (!d) return;
    d.record({
      t: this.now(), kind, adapter, target: describeTarget(e.target),
      dx: null, dy: null, deltaMode: null, key: null, code: null, action: null, outcome: null, note: null,
      ...extra,
    });
  }
}
