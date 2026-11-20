import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineDistance, offsetNorth } from '../src/utils/geo.ts';

test('haversine: zero distance for identical points', () => {
  assert.equal(haversineDistance(50, 14, 50, 14), 0);
});

test('haversine: Prague -> Brno ≈ 185 km', () => {
  const d = haversineDistance(50.0755, 14.4378, 49.1951, 16.6068);
  assert.ok(Math.abs(d - 185_000) < 2_000, `got ${d}`);
});

test('haversine: one degree of latitude ≈ 111.2 km', () => {
  const d = haversineDistance(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111_195) < 50, `got ${d}`);
});

test('offsetNorth round-trips through haversine', () => {
  const p = offsetNorth(48.2, 16.37, 25);
  assert.ok(Math.abs(haversineDistance(48.2, 16.37, p.lat, p.lon) - 25) < 0.01);
});
