import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineRpmInGear, selectGear, upshiftRpm, wheelRpm } from '../src/drivetrain/gearbox.ts';
import { estimateThrottle, isOverrun } from '../src/drivetrain/throttle.ts';
import { VirtualDrivetrain } from '../src/drivetrain/VirtualDrivetrain.ts';
import { testProfile } from './helpers.ts';

const p = testProfile();
const gb = p.gearbox;
const kmh = (v: number) => v / 3.6;

test('RPM = wheel rpm × gear ratio × final drive', () => {
  const v = kmh(100);
  const wr = wheelRpm(v, gb.tireRadiusM);
  assert.ok(Math.abs(wr - 768.8) < 1, `wheel rpm ${wr}`);
  assert.ok(Math.abs(engineRpmInGear(v, 3, gb) - wr * 1.83 * 3.9) < 1e-6);
});

test('RPM is not a linear function of speed alone: depends on gear', () => {
  const v = kmh(80);
  const r3 = engineRpmInGear(v, 3, gb);
  const r5 = engineRpmInGear(v, 5, gb);
  assert.ok(r3 > r5 * 1.5, `3rd ${r3} vs 5th ${r5}`);
  assert.equal(engineRpmInGear(v, 0, gb), 0);
});

test('gear selection: neutral at standstill, first when pulling away', () => {
  assert.equal(selectGear({ currentGear: 0, speedMs: 0, throttle: 0, sinceLastShift: 5, stationary: true }, gb, p.idleRPM, p.limiterRPM), 0);
  assert.equal(selectGear({ currentGear: 0, speedMs: 1, throttle: 0.3, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM), 1);
});

test('gear selection: upshift when RPM passes the shift point', () => {
  const v = kmh(70); // ~4200 rpm in 1st
  assert.equal(selectGear({ currentGear: 1, speedMs: v, throttle: 0.2, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM), 2);
});

test('hard acceleration holds gears longer than gentle driving', () => {
  assert.ok(upshiftRpm(1, gb, p.limiterRPM) > upshiftRpm(0.1, gb, p.limiterRPM) + 3000);
  const v = kmh(55); // ~3300 rpm in 1st
  assert.equal(selectGear({ currentGear: 1, speedMs: v, throttle: 0.1, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM), 2);
  assert.equal(selectGear({ currentGear: 1, speedMs: v, throttle: 1, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM), 1);
});

test('downshift when slowing in a tall gear', () => {
  const v = kmh(30);
  assert.equal(selectGear({ currentGear: 5, speedMs: v, throttle: 0, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM), 4);
});

test('shift hysteresis: speed dithering around a shift point does not hunt gears', () => {
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  // Settle at a steady 60 km/h cruise.
  for (let i = 0; i < 400; i++) dt.update(0.02, { speed: kmh(Math.min(60, i * 0.5)), accel: i * 0.5 < 60 ? 1.0 : 0, stationary: false });
  for (let i = 0; i < 300; i++) dt.update(0.02, { speed: kmh(60), accel: 0, stationary: false });
  // Dither speed ±1.5 km/h and acceleration ±0.6 m/s² (typical GPS noise) for 20 s.
  const directions: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const v = kmh(60 + Math.sin(i * 0.4) * 1.5);
    const accel = Math.cos(i * 0.4) * 0.6;
    for (const e of dt.update(0.02, { speed: v, accel, stationary: false })) if (e.type === 'shift') directions.push(e.direction);
  }
  assert.ok(directions.length <= 1, `shifted ${directions.join(',')} while dithering`);
});

test('shift hysteresis: thresholds leave a dead band between up- and downshift', () => {
  // Just after an upshift the engine sits ABOVE the downshift line, so it will not immediately shift back.
  for (const throttle of [0, 0.3, 0.6, 1]) {
    for (let g = 1; g < gb.gearRatios.length; g++) {
      for (let kph = 5; kph < 250; kph += 1) {
        const v = kmh(kph);
        const up = selectGear({ currentGear: g, speedMs: v, throttle, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM);
        if (up === g + 1) {
          const back = selectGear({ currentGear: g + 1, speedMs: v, throttle, sinceLastShift: 5, stationary: false }, gb, p.idleRPM, p.limiterRPM);
          assert.ok(back >= g + 1, `would hunt ${g}->${g + 1}->${back} at ${kph} km/h, throttle ${throttle}`);
        }
      }
    }
  }
});

test('drivetrain: full-throttle pull goes through several gears with RPM drops', () => {
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  let v = 0;
  let maxGear = 0;
  let drops = 0;
  let prevRpm = 0;
  for (let i = 0; i < 1500; i++) {
    v = Math.min(kmh(220), v + 4.5 * 0.02);
    const ev = dt.update(0.02, { speed: v, accel: 4.5, stationary: false });
    const s = dt.state;
    maxGear = Math.max(maxGear, s.gear);
    if (ev.some((e) => e.type === 'shift' && e.direction === 'up')) prevRpm = s.rpm;
    if (s.shifting && s.shiftProgress > 0.9 && prevRpm - s.rpm > 1000) {
      drops++;
      prevRpm = Infinity;
    }
    assert.ok(s.rpm <= p.limiterRPM + 150 && s.rpm >= 0, `rpm in range ${s.rpm}`);
  }
  assert.ok(maxGear >= 4, `reached gear ${maxGear}`);
  assert.ok(drops >= 2, `observed ${drops} upshift rpm drops`);
});

test('drivetrain: RPM rate is bounded even if speed input jumps (GPS glitch)', () => {
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  for (let i = 0; i < 200; i++) dt.update(0.02, { speed: kmh(30), accel: 0, stationary: false });
  const before = dt.state.rpm;
  dt.update(0.02, { speed: kmh(120), accel: 0, stationary: false });
  assert.ok(dt.state.rpm - before < 300, `jumped ${dt.state.rpm - before} rpm in one tick`);
});

test('throttle estimate grows with acceleration; overrun on lift-off', () => {
  const lo = estimateThrottle(kmh(50), 0.5, 2, gb, p.dynamics);
  const hi = estimateThrottle(kmh(50), 3.5, 2, gb, p.dynamics);
  assert.ok(hi > lo && hi <= 1 && lo >= 0);
  assert.equal(estimateThrottle(kmh(50), -2, 2, gb, p.dynamics), 0);
  assert.equal(isOverrun(kmh(80), -1.2), true);
  assert.equal(isOverrun(kmh(80), 0.2), false);
  assert.equal(isOverrun(0, -1), false);
});

test('decelerating to a stop ends in neutral at idle', () => {
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  let v = kmh(90);
  for (let i = 0; i < 300; i++) dt.update(0.02, { speed: v, accel: 0, stationary: false });
  for (let i = 0; i < 1200 && v > 0; i++) {
    v = Math.max(0, v - 3 * 0.02);
    dt.update(0.02, { speed: v, accel: v > 0 ? -3 : 0, stationary: v === 0 });
  }
  for (let i = 0; i < 150; i++) dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  assert.equal(dt.state.gear, 0);
  assert.ok(Math.abs(dt.state.rpm - p.idleRPM) < 80, `rpm ${dt.state.rpm}`);
});

test('launch: RPM never dips below the locked-gear RPM while the clutch engages', () => {
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  for (let i = 0; i < 100; i++) dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  let v = 0;
  let prev = 0;
  let dips = 0;
  for (let i = 0; i < 150; i++) {
    v += 2 * 0.02;
    dt.update(0.02, { speed: v, accel: 2, stationary: false });
    if (dt.state.gear === 1 && !dt.state.shifting && i > 20 && dt.state.rpm < prev - 150) dips++;
    prev = dt.state.rpm;
  }
  assert.equal(dips, 0);
});

test('lift-off holds the gear (no upshift on overrun below the hard shift point)', () => {
  const g = selectGear({ currentGear: 3, speedMs: kmh(120), throttle: 0, sinceLastShift: 5, stationary: false, overrun: true }, gb, p.idleRPM, p.limiterRPM);
  assert.equal(g, 3);
  assert.equal(selectGear({ currentGear: 3, speedMs: kmh(120), throttle: 0, sinceLastShift: 5, stationary: false, overrun: false }, gb, p.idleRPM, p.limiterRPM), 4);
});

test('gearing modes shorten the final drive so full revs come at lower road speed', async () => {
  const { withGearing, GEARING_FACTOR } = await import('../src/core/settings.ts');
  const p = testProfile();
  const fd = p.gearbox.finalDrive;
  assert.equal(withGearing(p, 'real'), p);
  const fun = withGearing(p, 'fun');
  assert.ok(Math.abs(fun.gearbox.finalDrive / p.gearbox.finalDrive - GEARING_FACTOR.fun) < 1e-9);
  assert.equal(p.gearbox.finalDrive, fd);
});

test('scroll shifting: down drops a gear (max two), up returns, auto resumes after the hold time', async () => {
  const { MANUAL_HOLD_S } = await import('../src/drivetrain/VirtualDrivetrain.ts');
  const dt = new VirtualDrivetrain(testProfile());
  dt.ignite();
  const cruise = (n: number) => { for (let i = 0; i < n; i++) dt.update(0.02, { speed: kmh(70), accel: 0, stationary: false }); };
  for (let i = 0; i < 400; i++) dt.update(0.02, { speed: kmh(Math.min(70, i * 0.5)), accel: 1, stationary: false });
  cruise(300);
  const auto = dt.state.gear;
  assert.ok(auto >= 3, `auto gear ${auto}`);
  const rpmAuto = dt.state.rpm;
  dt.manualShift(-1); cruise(60);
  assert.equal(dt.state.gear, auto - 1);
  dt.manualShift(-1); cruise(60);
  dt.manualShift(-1); cruise(60);
  assert.equal(dt.state.gear, auto - 2, 'never more than two below automatic');
  assert.ok(dt.state.rpm > rpmAuto * 1.4, 'revs rise after downshifts');
  dt.manualShift(1); cruise(60);
  assert.equal(dt.state.gear, auto - 1);
  cruise(Math.ceil((MANUAL_HOLD_S + 2) / 0.02));
  assert.equal(dt.state.gear, auto, 'back to automatic');
  assert.equal(dt.state.manualOffset, 0);
});

test('manual downshift never over-revs the engine', () => {
  const p = testProfile();
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  for (let i = 0; i < 1500; i++) dt.update(0.02, { speed: kmh(Math.min(170, i * 0.4)), accel: 2, stationary: false });
  dt.manualShift(-1); dt.manualShift(-1);
  for (let i = 0; i < 100; i++) dt.update(0.02, { speed: kmh(170), accel: 0, stationary: false });
  assert.ok(dt.state.rpm <= p.limiterRPM + 150);
  assert.ok(dt.state.manualOffset > -2, 'refused a downshift that would pass the limiter');
});

test('REV pedal free-revs when stationary and crackles on release', () => {
  const p = testProfile();
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  for (let i = 0; i < 100; i++) dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  dt.setRevPedal(true);
  let maxRpm = 0;
  for (let i = 0; i < 60; i++) { dt.update(0.02, { speed: 0, accel: 0, stationary: true }); maxRpm = Math.max(maxRpm, dt.state.rpm); }
  assert.ok(maxRpm > p.redlineRPM * 0.8, `revved to ${maxRpm}`);
  assert.equal(dt.state.load, 1);
  assert.equal(dt.state.gear, 0);
  dt.setRevPedal(false);
  const ev = dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  assert.ok(ev.some((e) => e.type === 'overrun-start'));
  for (let i = 0; i < 150; i++) dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  assert.ok(dt.state.rpm < p.idleRPM * 1.3, 'falls back to idle');
});

test('manualShift reports why a request was refused', () => {
  const dt = new VirtualDrivetrain(testProfile());
  assert.equal(dt.manualShift(-1), 'not-running');
  dt.ignite();
  for (let i = 0; i < 50; i++) dt.update(0.02, { speed: 0, accel: 0, stationary: true });
  assert.equal(dt.manualShift(-1), 'no-gear', 'standing car has no automatic gear');
  for (let i = 0; i < 400; i++) dt.update(0.02, { speed: kmh(Math.min(70, i * 0.5)), accel: 1, stationary: false });
  for (let i = 0; i < 300; i++) dt.update(0.02, { speed: kmh(70), accel: 0, stationary: false });
  assert.equal(dt.manualShift(-1), 'applied');
  assert.equal(dt.manualShift(-1), 'applied');
  assert.equal(dt.manualShift(-1), 'at-limit');
});

test('manual downshift in first gear is refused, not silently reverted', () => {
  const dt = new VirtualDrivetrain(testProfile());
  dt.ignite();
  for (let i = 0; i < 100; i++) dt.update(0.02, { speed: kmh(8), accel: 0.5, stationary: false });
  assert.equal(dt.state.gear, 1);
  assert.equal(dt.manualShift(-1), 'out-of-range');
  assert.equal(dt.state.manualOffset, 0);
});
