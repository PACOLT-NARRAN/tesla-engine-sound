import assert from 'node:assert/strict';
import test from 'node:test';
import { DRIVE_PROFILES, DRIVE_PROFILE_IDS, DRIVE_PROFILE_LIMITS, applyDriveProfile, clampDriveProfile, getDriveProfile, type DriveProfileId } from '../src/drivetrain/driveProfiles.ts';
import { engineRpmInGear } from '../src/drivetrain/gearbox.ts';
import { OVER_REV_MARGIN, VirtualDrivetrain } from '../src/drivetrain/VirtualDrivetrain.ts';
import {
  PRODUCT, canUseManual, effectiveDriveProfile, hasCapability, isDriveProfileLocked, resolveEntitlements,
} from '../src/entitlements/entitlements.ts';
import { testProfile } from './helpers.ts';

const kmh = (v: number) => v / 3.6;
const DT = 0.02;

function run(dt: VirtualDrivetrain, seconds: number, speed: (t: number) => number, accel = 0) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) dt.update(DT, { speed: speed(i * DT), accel, stationary: speed(i * DT) < 0.2 });
}
const cruise = (dt: VirtualDrivetrain, v: number, s = 2, accel = 0) => run(dt, s, () => kmh(v), accel);

/** Accelerates gently from 0 to `to` km/h with a profile and returns the speeds of each upshift. */
function upshiftRpms(id: DriveProfileId): number[] {
  const p = applyDriveProfile(testProfile(), getDriveProfile(id));
  const dt = new VirtualDrivetrain(p, getDriveProfile(id));
  dt.ignite();
  const rpms: number[] = [];
  for (let i = 0; i < 3000; i++) {
    const v = Math.min(kmh(120), i * 0.015);
    const ev = dt.update(DT, { speed: v, accel: 1.2, stationary: false });
    for (const e of ev) if (e.type === 'shift' && e.direction === 'up') rpms.push(engineRpmInGear(v, e.from, p.gearbox));
  }
  return rpms;
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// --- Drive Profiles ------------------------------------------------------------------------

test('every profile stays within the safe limits', () => {
  for (const id of DRIVE_PROFILE_IDS) {
    const c = DRIVE_PROFILES[id];
    assert.deepEqual(clampDriveProfile(c), c, `${id} out of limits`);
    for (const [k, [lo, hi]] of Object.entries(DRIVE_PROFILE_LIMITS)) {
      const v = (c as unknown as Record<string, number>)[k] as number;
      assert.ok(v >= lo && v <= hi, `${id}.${k}`);
    }
  }
  const wild = clampDriveProfile({ ...DRIVE_PROFILES.track, throttleResponse: 99, overrunAmount: -5, gearHoldTime: Number.NaN });
  assert.equal(wild.throttleResponse, 2);
  assert.equal(wild.overrunAmount, 0);
  assert.equal(wild.gearHoldTime, 0);
});

test('profiles are ordered COMFORT < SPORT < TRACK on every aggressive parameter', () => {
  const [c, s, t] = DRIVE_PROFILE_IDS.map((id) => DRIVE_PROFILES[id]);
  assert.ok(c && s && t);
  for (const k of ['upshiftRpmFactor', 'downshiftRpmFactor', 'throttleResponse', 'loadResponse', 'throttleBlipAmount', 'engineBraking', 'overrunAmount', 'crackleAmount'] as const) {
    assert.ok(c[k] < s[k] && s[k] < t[k], k);
  }
  assert.ok(c.audioTransitionSmoothing > s.audioTransitionSmoothing && s.audioTransitionSmoothing > t.audioTransitionSmoothing);
  assert.ok(c.shiftCooldown > s.shiftCooldown && s.shiftCooldown > t.shiftCooldown);
  assert.equal(c.holdGearOnLift, false);
});

test('applyDriveProfile changes shift points, timing, response and crackle — not the engine identity', () => {
  const base = testProfile({ audio: { ...testProfile().audio, overrunPops: 0.5, shiftBark: 0.5 } });
  const c = applyDriveProfile(base, DRIVE_PROFILES.comfort);
  const t = applyDriveProfile(base, DRIVE_PROFILES.track);
  assert.equal(c.gearbox.shiftUpRPM.gentle, base.gearbox.shiftUpRPM.gentle);
  assert.ok(t.gearbox.shiftUpRPM.gentle > base.gearbox.shiftUpRPM.gentle + 2000);
  assert.equal(t.gearbox.shiftUpRPM.hard, base.gearbox.shiftUpRPM.hard);
  assert.ok(t.gearbox.shiftDuration < c.gearbox.shiftDuration);
  assert.ok(t.dynamics.engineResponse < c.dynamics.engineResponse, 'track RPM reacts faster');
  assert.ok(t.audio.overrunPops > c.audio.overrunPops * 4);
  assert.ok(t.audio.shiftBark > c.audio.shiftBark * 4);
  assert.equal(t.id, base.id);
  assert.equal(t.limiterRPM, base.limiterRPM);
});

test('measurable: TRACK upshifts at much higher RPM than COMFORT in the same drive', () => {
  const c = avg(upshiftRpms('comfort'));
  const s = avg(upshiftRpms('sport'));
  const t = avg(upshiftRpms('track'));
  assert.ok(c < s && s < t, `comfort ${Math.round(c)} sport ${Math.round(s)} track ${Math.round(t)}`);
  assert.ok(t - c > 1500, `difference ${Math.round(t - c)} rpm`);
});

test('measurable: TRACK throttle reacts faster than COMFORT', () => {
  // One-gear car, so both profiles compare the same gear.
  const oneGear = testProfile({ gearbox: { ...testProfile().gearbox, gearRatios: [1.2] } });
  const resp = (id: DriveProfileId) => {
    const dt = new VirtualDrivetrain(applyDriveProfile(oneGear, getDriveProfile(id)), getDriveProfile(id));
    dt.ignite();
    cruise(dt, 50, 3);
    run(dt, 0.25, () => kmh(50), 3.5); // sudden acceleration
    return dt.state.throttle;
  };
  assert.ok(resp('track') > resp('comfort') + 0.1, `track ${resp('track').toFixed(2)} comfort ${resp('comfort').toFixed(2)}`);
});

test('measurable: COMFORT upshifts when lifting off, SPORT/TRACK hold the gear (engine braking)', () => {
  const gearAfterLift = (id: DriveProfileId) => {
    const dt = new VirtualDrivetrain(applyDriveProfile(testProfile(), getDriveProfile(id)), getDriveProfile(id));
    dt.ignite();
    run(dt, 6, (t) => kmh(Math.min(60, t * 15)), 4); // hard pull to 60
    const g = dt.state.gear;
    run(dt, 4, (t) => kmh(60 - t), -0.3); // lift off, coasting
    return { before: g, after: dt.state.gear };
  };
  const c = gearAfterLift('comfort');
  const t = gearAfterLift('track');
  assert.ok(c.after > c.before, `comfort ${c.before}->${c.after}`);
  assert.ok(t.after <= t.before, `track ${t.before}->${t.after}`);
});

// --- Manual shifting -----------------------------------------------------------------------

function manualCar() {
  const dt = new VirtualDrivetrain(testProfile());
  dt.ignite();
  run(dt, 1.5, () => 0);
  dt.setTransmission('manual');
  return dt;
}

test('manual: neutral while standing, 1st boundary, upshift and downshift change the real gear', () => {
  const dt = manualCar();
  assert.equal(dt.state.transmission, 'manual');
  assert.equal(dt.state.gear, 0, 'standing in neutral');
  assert.equal(dt.manualShift(-1), 'at-limit', 'nothing below neutral');
  assert.equal(dt.manualShift(1), 'applied');
  run(dt, 0.2, () => 0);
  assert.equal(dt.state.gear, 1);
  assert.equal(dt.manualShift(-1), 'applied', 'back to neutral while standing');
  run(dt, 0.2, () => 0);
  assert.equal(dt.state.gear, 0);
  dt.manualShift(1);
  run(dt, 3, (t) => kmh(Math.min(30, t * 12)), 3);
  assert.equal(dt.state.gear, 1, 'manual mode never upshifts by itself');
  assert.equal(dt.manualShift(-1), 'at-limit', 'no neutral while moving');
  assert.equal(dt.manualShift(1), 'applied');
  cruise(dt, 30, 1);
  assert.equal(dt.state.gear, 2);
});

test('manual: RPM after a shift follows the new gear ratio', () => {
  const dt = manualCar();
  dt.manualShift(1);
  run(dt, 4, (t) => kmh(Math.min(50, t * 15)), 3);
  dt.manualShift(1);
  dt.manualShift(1);
  cruise(dt, 50, 2);
  assert.equal(dt.state.gear, 3);
  const expected3 = engineRpmInGear(kmh(50), 3, testProfile().gearbox);
  assert.ok(Math.abs(dt.state.rpm - expected3) < 250, `rpm ${Math.round(dt.state.rpm)} vs ${Math.round(expected3)}`);
  assert.equal(dt.manualShift(-1), 'applied');
  cruise(dt, 50, 2);
  const expected2 = engineRpmInGear(kmh(50), 2, testProfile().gearbox);
  assert.ok(Math.abs(dt.state.rpm - expected2) < 250, 'rpm rises to the 2nd-gear value');
  assert.ok(dt.state.rpm > expected3 + 500);
});

test('manual: shift events drive the sound (blip on downshift, cut on upshift)', () => {
  const dt = manualCar();
  dt.manualShift(1);
  run(dt, 4, (t) => kmh(Math.min(50, t * 15)), 2);
  dt.manualShift(1);
  const ev = dt.update(DT, { speed: kmh(50), accel: 1, stationary: false });
  assert.ok(ev.some((e) => e.type === 'shift' && e.direction === 'up' && e.from === 1 && e.to === 2));
  cruise(dt, 50, 1);
  dt.manualShift(-1);
  const ev2 = dt.update(DT, { speed: kmh(50), accel: 0, stationary: false });
  assert.ok(ev2.some((e) => e.type === 'shift' && e.direction === 'down'));
  let peakLoad = 0;
  for (let i = 0; i < 10; i++) {
    dt.update(DT, { speed: kmh(50), accel: 0, stationary: false });
    peakLoad = Math.max(peakLoad, dt.state.load);
  }
  assert.ok(peakLoad > 0.2, 'rev-match blip raises load');
});

test('manual: top-gear boundary', () => {
  const dt = manualCar();
  const top = testProfile().gearbox.gearRatios.length;
  dt.manualShift(1);
  run(dt, 10, (t) => kmh(Math.min(160, t * 20)), 3);
  for (let g = 1; g < top; g++) {
    assert.equal(dt.manualShift(1), 'applied', `to ${g + 1}`);
    cruise(dt, 160, 1);
  }
  assert.equal(dt.state.gear, top);
  assert.equal(dt.manualShift(1), 'at-limit');
});

test('manual: redline protection refuses an impossible downshift, engine never over-revs', () => {
  const p = testProfile();
  const dt = manualCar();
  dt.manualShift(1);
  run(dt, 8, (t) => kmh(Math.min(150, t * 20)), 3);
  for (let i = 0; i < 4; i++) { dt.manualShift(1); cruise(dt, 150, 0.8); }
  const g = dt.state.gear;
  assert.equal(g, 5);
  // 150 km/h in 2nd would be far beyond the limiter.
  assert.ok(engineRpmInGear(kmh(150), 2, p.gearbox) > p.limiterRPM);
  let r = dt.manualShift(-1);
  while (r === 'applied') { cruise(dt, 150, 0.5); r = dt.manualShift(-1); }
  assert.equal(r, 'over-rev');
  assert.ok(engineRpmInGear(kmh(150), dt.state.gear - 1, p.gearbox) > p.limiterRPM - OVER_REV_MARGIN);
  cruise(dt, 150, 2);
  assert.ok(dt.state.rpm <= p.limiterRPM + 150);
});

test('manual: an upshift that would stall is blocked, and lugging recovers one gear down', () => {
  const dt = manualCar();
  dt.manualShift(1);
  run(dt, 2, (t) => kmh(Math.min(15, t * 10)), 2);
  dt.manualShift(1);
  cruise(dt, 15, 1);
  // 15 km/h in 6th would be below idle.
  for (let i = 0; i < 3; i++) { dt.manualShift(1); cruise(dt, 15, 0.8); }
  let r = dt.manualShift(1);
  while (r === 'applied') { cruise(dt, 15, 0.8); r = dt.manualShift(1); }
  assert.equal(r, 'would-stall');
  const g = dt.state.gear;
  cruise(dt, 6, 3, -0.5); // slowing down without shifting
  assert.ok(dt.state.gear < g, 'anti-stall recovery shifted down');
  assert.ok(dt.state.rpm >= testProfile().idleRPM * 0.8);
});

test('manual: stopping in a high gear recovers to 1st', () => {
  const dt = manualCar();
  dt.manualShift(1);
  run(dt, 4, (t) => kmh(Math.min(50, t * 15)), 3);
  dt.manualShift(1); dt.manualShift(1);
  cruise(dt, 50, 1);
  run(dt, 6, (t) => Math.max(0, kmh(50 - t * 12)), -3);
  run(dt, 1, () => 0);
  assert.equal(dt.state.gear, 1);
});

test('switching automatic → manual keeps the gear; manual → automatic resumes automatic shifting', () => {
  const dt = new VirtualDrivetrain(testProfile());
  dt.ignite();
  run(dt, 8, (t) => kmh(Math.min(80, t * 12)), 2);
  cruise(dt, 80, 8);
  assert.equal(dt.state.shifting, false);
  const g = dt.state.gear;
  const rpm = dt.state.rpm;
  dt.setTransmission('manual');
  cruise(dt, 80, 1);
  assert.equal(dt.state.gear, g, 'no jump on switching');
  assert.ok(Math.abs(dt.state.rpm - rpm) < 200);
  dt.manualShift(-1);
  cruise(dt, 80, 1);
  dt.manualShift(-1);
  cruise(dt, 80, 20); // stays there, no 15 s return to automatic in manual mode
  assert.equal(dt.state.gear, g - 2);
  dt.setTransmission('auto');
  assert.equal(dt.state.transmission, 'auto');
  cruise(dt, 80, 6);
  assert.ok(dt.state.gear > g - 2, 'automatic upshifts again');
});

// --- Entitlements --------------------------------------------------------------------------

test('entitlements: early access unlocks everything today', () => {
  assert.equal(PRODUCT.earlyAccess, true);
  const e = resolveEntitlements('auto');
  assert.equal(e.plan, 'pro');
  assert.ok(hasCapability(e, 'manual-shifting'));
  assert.equal(PRODUCT.proLifetimePriceEur, 9.99);
});

test('entitlements: FREE locks SPORT/TRACK/manual on a GPS drive, never COMFORT', () => {
  const free = resolveEntitlements('auto', false);
  assert.equal(free.plan, 'free');
  assert.equal(isDriveProfileLocked(free, 'comfort'), false);
  assert.equal(isDriveProfileLocked(free, 'sport'), true);
  assert.deepEqual(effectiveDriveProfile(free, 'track', 'gps'), { id: 'comfort', locked: true, preview: false });
  assert.deepEqual(effectiveDriveProfile(free, 'comfort', 'gps'), { id: 'comfort', locked: false, preview: false });
  assert.equal(canUseManual(free, 'gps'), false);
});

test('entitlements: locked profiles and manual can be previewed in Demo', () => {
  const free = resolveEntitlements('free');
  assert.equal(free.simulated, true);
  assert.deepEqual(effectiveDriveProfile(free, 'track', 'demo'), { id: 'track', locked: true, preview: true });
  assert.equal(canUseManual(free, 'demo'), true);
  const pro = resolveEntitlements('pro');
  assert.deepEqual(effectiveDriveProfile(pro, 'track', 'gps'), { id: 'track', locked: false, preview: false });
  assert.equal(canUseManual(pro, 'gps'), true);
});
