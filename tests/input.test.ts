import assert from 'node:assert/strict';
import test from 'node:test';
import { InputController } from '../src/input/InputController.ts';
import { InputDiagnostics, formatEntry } from '../src/input/InputDiagnostics.ts';
import { DEV_OPTIONS_SCHEMA } from '../src/input/devOptions.ts';
import { NOTCH_PX, NotchAccumulator, STEP_MS, StepLimiter, describeTarget, directionToAction, keyToAction, wheelDeltaPx } from '../src/input/normalize.ts';
import type { DriveAction, ShiftOutcome } from '../src/input/types.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';

test('wheel deltas are normalised to pixels for every deltaMode', () => {
  assert.equal(wheelDeltaPx(100, 0), 100);
  assert.equal(wheelDeltaPx(3, 1), 90);
  assert.equal(wheelDeltaPx(-1, 2), -300);
  assert.equal(wheelDeltaPx(Number.NaN, 0), 0);
});

test('direction: down = shift down, up = shift up', () => {
  assert.equal(directionToAction(53), 'shift-down');
  assert.equal(directionToAction(-1), 'shift-up');
  assert.equal(directionToAction(0), null);
  assert.equal(keyToAction('ArrowDown'), 'shift-down');
  assert.equal(keyToAction('PageUp'), 'shift-up');
  assert.equal(keyToAction('a'), null);
});

test('accumulator: small deltas add up to one notch', () => {
  const a = new NotchAccumulator();
  assert.equal(a.feed(15, 0), null);
  assert.equal(a.feed(15, 10), null);
  assert.deepEqual(a.feed(15, 20), { action: 'shift-down', debounced: false });
  assert.equal(a.feed(-10, 1000), null);
  assert.deepEqual(a.feed(-NOTCH_PX, 1010), { action: 'shift-up', debounced: false });
});

test('accumulator: a fast spin is debounced to one step per STEP_MS', () => {
  const a = new NotchAccumulator();
  assert.equal(a.feed(120, 0)?.debounced, false);
  assert.equal(a.feed(120, 16)?.debounced, true);
  assert.equal(a.feed(120, 32)?.debounced, true);
  assert.equal(a.feed(120, STEP_MS + 1)?.debounced, false);
});

test('accumulator: stale partial notch and reversed direction are dropped', () => {
  const a = new NotchAccumulator();
  a.feed(30, 0);
  assert.equal(a.feed(30, 1000), null, 'old partial forgotten');
  a.feed(30, 1010);
  assert.equal(a.feed(-30, 1020), null, 'reverse restarts the notch');
});

test('step limiter for keys', () => {
  const l = new StepLimiter();
  assert.ok(l.allow(0));
  assert.ok(!l.allow(100));
  assert.ok(l.allow(STEP_MS));
});

test('describeTarget is short and safe', () => {
  assert.equal(describeTarget({ tagName: 'DIV', id: 'x', className: 'cockpit ignition-on extra' }), 'div#x.cockpit.ignition-on');
  assert.equal(describeTarget(null), '—');
  assert.equal(describeTarget({}), 'object');
});

test('diagnostics: ring buffer keeps the newest entries, counters keep counting', () => {
  const d = new InputDiagnostics(3);
  let calls = 0;
  d.subscribe(() => calls++);
  for (let i = 0; i < 5; i++) {
    d.record({ t: i, kind: 'wheel', adapter: 'wheel', target: 'div', dx: 0, dy: 100, deltaMode: 0, key: null, code: null, action: 'shift-down', outcome: i % 2 ? 'applied' : 'debounced', note: null });
  }
  assert.equal(d.list().length, 3);
  assert.equal(d.list()[0]?.t, 2);
  const s = d.summary();
  assert.equal(s.total, 5);
  assert.equal(s.wheelLike, 5);
  assert.equal(s.applied, 2);
  assert.equal(calls, 5);
  assert.match(d.toText(), /5 events/);
  d.clear();
  assert.equal(d.summary().total, 0);
  assert.equal(d.summary().last, null);
});

test('formatEntry shows deltas, mode, key and outcome', () => {
  const line = formatEntry({ id: 1, t: 1234, kind: 'wheel', adapter: 'wheel', target: 'div.cockpit', dx: 0, dy: 100, deltaMode: 0, key: null, code: null, action: 'shift-down', outcome: 'applied', note: null });
  assert.equal(line, '1.23s wheel [wheel] div.cockpit dx=0 dy=100 mode=0 → shift-down (applied)');
});

// --- InputController with plain EventTargets (no DOM needed) -----------------------------

function wheel(deltaY: number, deltaMode = 0): Event {
  return Object.assign(new Event('wheel', { cancelable: true }), { deltaX: 0, deltaY, deltaZ: 0, deltaMode });
}
function key(k: string, repeat = false): Event {
  return Object.assign(new Event('keydown', { cancelable: true }), { key: k, code: k, repeat });
}

function setup(opts: { enabled?: boolean; blocked?: boolean } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  const diag = new InputDiagnostics();
  const actions: DriveAction[] = [];
  let now = 0;
  const state = { enabled: opts.enabled ?? true, blocked: opts.blocked ?? false, outcome: 'applied' as ShiftOutcome };
  const c = new InputController({
    onAction: (a) => (actions.push(a), state.outcome),
    isDriveEnabled: () => state.enabled,
    isBlocked: () => state.blocked,
    diagnostics: diag,
    now: () => now,
  });
  const off = c.attach(win, doc);
  return { win, doc, diag, actions, c, off, state, tick: (ms: number) => (now += ms) };
}

test('controller: wheel notch shifts and is logged with deltas', () => {
  const t = setup();
  const e = wheel(100);
  t.win.dispatchEvent(e);
  assert.deepEqual(t.actions, ['shift-down']);
  assert.ok(e.defaultPrevented, 'page does not scroll on the Drive screen');
  const last = t.diag.summary().last;
  assert.equal(last?.dy, 100);
  assert.equal(last?.deltaMode, 0);
  assert.equal(last?.outcome, 'applied');
  t.tick(300);
  t.win.dispatchEvent(wheel(-2, 1));
  assert.deepEqual(t.actions, ['shift-down', 'shift-up']);
});

test('controller: rejected shift is reported, not hidden', () => {
  const t = setup();
  t.state.outcome = 'no-gear';
  t.win.dispatchEvent(wheel(100));
  assert.equal(t.diag.summary().last?.outcome, 'no-gear');
  assert.equal(t.diag.summary().applied, 0);
});

test('controller: input inside a sheet is logged but not captured', () => {
  const t = setup({ blocked: true });
  const e = wheel(100);
  t.win.dispatchEvent(e);
  assert.equal(t.actions.length, 0);
  assert.ok(!e.defaultPrevented, 'sheet lists keep scrolling');
  assert.equal(t.diag.summary().last?.outcome, 'blocked');
});

test('controller: drive input off (ignition off) never shifts', () => {
  const t = setup({ enabled: false });
  t.win.dispatchEvent(wheel(100));
  t.win.dispatchEvent(key('ArrowDown'));
  assert.equal(t.actions.length, 0);
  assert.equal(t.diag.summary().byKind.wheel, 1);
  assert.equal(t.diag.summary().byKind.keydown, 1);
});

test('controller: keys shift, repeats are ignored, other keys only logged', () => {
  const t = setup();
  t.win.dispatchEvent(key('ArrowDown'));
  t.win.dispatchEvent(key('ArrowDown', true));
  t.tick(300);
  t.win.dispatchEvent(key('PageUp'));
  t.win.dispatchEvent(key('x'));
  assert.deepEqual(t.actions, ['shift-down', 'shift-up']);
  assert.equal(t.diag.summary().byKind.keydown, 4);
  assert.equal(t.diag.summary().last?.key, 'x');
});

test('controller: native scroll is logged; detach removes all listeners', () => {
  const t = setup();
  t.doc.dispatchEvent(new Event('scroll'));
  assert.equal(t.diag.summary().byKind.scroll, 1);
  assert.equal(t.diag.summary().wheelLike, 0, 'page scroll is not a shift source');
  t.off();
  t.win.dispatchEvent(wheel(100));
  assert.equal(t.actions.length, 0);
  assert.equal(t.diag.summary().total, 1);
});

test('controller: no diagnostics object means nothing is recorded', () => {
  const win = new EventTarget();
  const actions: DriveAction[] = [];
  const c = new InputController({ onAction: (a) => (actions.push(a), 'applied'), isDriveEnabled: () => true, isBlocked: () => false, diagnostics: null, now: () => 0 });
  c.attach(win, new EventTarget());
  win.dispatchEvent(wheel(100));
  assert.deepEqual(actions, ['shift-down']);
});

class FakeScroller extends EventTarget {
  scrollTop = 0;
  scrollHeight = 5000;
  clientHeight = 1000;
}

test('scroll trap: native scroll offset becomes a shift and the trap re-centres', () => {
  const t = setup();
  const el = new FakeScroller();
  const off = t.c.attachScrollTrap(el);
  assert.equal(el.scrollTop, 2000, 'starts centred');
  el.scrollTop = 2100; // wheel scrolled the page down
  el.dispatchEvent(new Event('scroll'));
  assert.deepEqual(t.actions, ['shift-down']);
  assert.equal(el.scrollTop, 2000);
  el.dispatchEvent(new Event('scroll')); // our own re-centring: ignored
  assert.equal(t.actions.length, 1);
  t.tick(300);
  el.scrollTop = 1900;
  el.dispatchEvent(new Event('scroll'));
  assert.deepEqual(t.actions, ['shift-down', 'shift-up']);
  assert.equal(t.diag.summary().wheelLike, 2);
  assert.equal(t.diag.summary().last?.adapter, 'scroll-trap');
  off();
  el.scrollTop = 2300;
  el.dispatchEvent(new Event('scroll'));
  assert.equal(t.actions.length, 2);
});

test('developer options persist and sanitise', () => {
  const backend = createMemoryBackend({ 'revline.developer.v1': JSON.stringify({ v: 1, data: { scrollTrap: 'yes' } }) });
  const store = new LocalStore(backend);
  assert.equal(store.load(DEV_OPTIONS_SCHEMA).value.scrollTrap, false);
  store.save(DEV_OPTIONS_SCHEMA, { scrollTrap: true });
  assert.equal(new LocalStore(backend).load(DEV_OPTIONS_SCHEMA).value.scrollTrap, true);
});
