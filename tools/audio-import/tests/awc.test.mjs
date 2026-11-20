import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awcId, grainCurve, joaat, roleOf } from '../lib/awc.mjs';

test('joaat matches known RAGE hashes', () => {
  assert.equal(joaat('adder'), 0xb779a091);
  assert.equal(joaat('ADDER'), joaat('adder'));
  assert.equal(awcId('adder'), 0xb779a091 & 0x1fffffff);
});

test('roleOf classifies stream names', () => {
  assert.equal(roleOf('engine_accel'), 'engine_accel');
  assert.equal(roleOf('vehicle_extras_v_hi_exhaust_pop_01'), 'pop');
  assert.equal(roleOf('vehicles_extras_dump_valve_10a'), 'blowoff');
  assert.equal(roleOf('vehicles_extras_dump_valve_12_wastegate'), 'wastegate');
  assert.equal(roleOf('classic_gen_vehicle_door_close'), 'door');
  assert.equal(roleOf(undefined), 'unknown');
});

test('grainCurve gives a strictly monotonic rpm = 120 x Hz curve', () => {
  const grains = [];
  for (let i = 0; i < 200; i++) grains.push({ sample: i * 1600, hz: 10 + i * 0.2 + (i % 7 === 0 ? -0.5 : 0) });
  const c = grainCurve(grains, 32000);
  assert.ok(c.length > 5);
  assert.equal(c[0][1], 1140);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i][0] > c[i - 1][0]);
    assert.ok(c[i][1] > c[i - 1][1]);
  }
  const down = grainCurve(grains.map((g, i) => ({ sample: g.sample, hz: grains[grains.length - 1 - i].hz })), 32000);
  for (let i = 1; i < down.length; i++) assert.ok(down[i][1] < down[i - 1][1]);
});
