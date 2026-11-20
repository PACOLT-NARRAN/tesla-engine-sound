/**
 * Scripted driving cycles for Demo Mode. Each segment prescribes a longitudinal
 * acceleration; the scenario loops forever. Pure data + a pure integrator, so the
 * demo produces the same kind of input a real GPS would.
 */
export type DemoSegment =
  | { kind: 'hold'; duration: number }
  /** Accelerate at `accel` m/s² until `toKmh` (or for `duration` seconds). */
  | { kind: 'accel'; accel: number; toKmh: number; duration?: number }
  /** Brake/coast at `accel` (negative) m/s² until `toKmh`. */
  | { kind: 'decel'; accel: number; toKmh: number }
  /** Cruise for `duration` seconds with a gentle speed wobble. */
  | { kind: 'cruise'; duration: number; wobbleKmh?: number };

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  segments: DemoSegment[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'full-cycle',
    name: 'Full cycle',
    description: 'Idle, pull-away, shifts, cruise, flat-out, lift-off, stop',
    segments: [
      { kind: 'hold', duration: 3 },
      { kind: 'accel', accel: 1.8, toKmh: 60 },
      { kind: 'accel', accel: 1.1, toKmh: 80 },
      { kind: 'cruise', duration: 6, wobbleKmh: 2 },
      { kind: 'accel', accel: 4.2, toKmh: 170 },
      { kind: 'decel', accel: -0.9, toKmh: 120 },
      { kind: 'decel', accel: -3.2, toKmh: 0 },
    ],
  },
  {
    id: 'city',
    name: 'City',
    description: 'Short pulls to 50, traffic lights',
    segments: [
      { kind: 'hold', duration: 2.5 },
      { kind: 'accel', accel: 1.6, toKmh: 48 },
      { kind: 'cruise', duration: 5, wobbleKmh: 3 },
      { kind: 'decel', accel: -1.8, toKmh: 0 },
      { kind: 'hold', duration: 3 },
      { kind: 'accel', accel: 2.2, toKmh: 35 },
      { kind: 'decel', accel: -1.2, toKmh: 20 },
      { kind: 'accel', accel: 1.4, toKmh: 50 },
      { kind: 'cruise', duration: 4, wobbleKmh: 2 },
      { kind: 'decel', accel: -2.4, toKmh: 0 },
    ],
  },
  {
    id: 'acceleration',
    name: 'Acceleration',
    description: 'Brisk 0–100 km/h, then coast down',
    segments: [
      { kind: 'hold', duration: 2.5 },
      { kind: 'accel', accel: 2.8, toKmh: 100 },
      { kind: 'cruise', duration: 3 },
      { kind: 'decel', accel: -2.5, toKmh: 0 },
    ],
  },
  {
    id: 'highway',
    name: 'Highway',
    description: 'On-ramp, 130 cruise, overtake, exit',
    segments: [
      { kind: 'hold', duration: 2 },
      { kind: 'accel', accel: 2.6, toKmh: 100 },
      { kind: 'accel', accel: 1.4, toKmh: 130 },
      { kind: 'cruise', duration: 10, wobbleKmh: 3 },
      { kind: 'accel', accel: 2.4, toKmh: 155 },
      { kind: 'decel', accel: -0.6, toKmh: 130 },
      { kind: 'cruise', duration: 6, wobbleKmh: 2 },
      { kind: 'decel', accel: -1.5, toKmh: 60 },
      { kind: 'decel', accel: -2.5, toKmh: 0 },
    ],
  },
  {
    id: 'hard',
    name: 'Hard acceleration',
    description: 'Launch to 200 km/h at full load',
    segments: [
      { kind: 'hold', duration: 2.5 },
      { kind: 'accel', accel: 6.5, toKmh: 100 },
      { kind: 'accel', accel: 4.0, toKmh: 170 },
      { kind: 'accel', accel: 2.6, toKmh: 210 },
      { kind: 'decel', accel: -1.0, toKmh: 160 },
      { kind: 'decel', accel: -5.0, toKmh: 0 },
    ],
  },
  {
    id: 'deceleration',
    name: 'Deceleration',
    description: 'Quick run to 140, long engine-braking coast',
    segments: [
      { kind: 'hold', duration: 1.5 },
      { kind: 'accel', accel: 4.5, toKmh: 140 },
      { kind: 'decel', accel: -0.7, toKmh: 90 },
      { kind: 'decel', accel: -1.6, toKmh: 30 },
      { kind: 'decel', accel: -2.8, toKmh: 0 },
      { kind: 'hold', duration: 2 },
    ],
  },
];

export interface ScenarioCursor {
  segment: number;
  elapsed: number;
  speed: number; // m/s
  time: number;
}

export const createCursor = (): ScenarioCursor => ({ segment: 0, elapsed: 0, speed: 0, time: 0 });

/** Advance the scenario by dt seconds and return the new speed (m/s). Mutates the cursor. */
export function stepScenario(scenario: DemoScenario, cur: ScenarioCursor, dt: number): number {
  cur.time += dt;
  for (let guard = 0; guard < scenario.segments.length + 1; guard++) {
    const seg = scenario.segments[cur.segment];
    if (!seg) {
      cur.segment = 0;
      cur.elapsed = 0;
      continue;
    }
    cur.elapsed += dt;
    let done = false;
    switch (seg.kind) {
      case 'hold':
        cur.speed = 0;
        done = cur.elapsed >= seg.duration;
        break;
      case 'accel': {
        const target = seg.toKmh / 3.6;
        // Real cars pull less hard near their target: taper the last ~15%.
        const taper = Math.min(1, Math.max(0.35, (target - cur.speed) / (target * 0.15 + 0.5)));
        cur.speed = Math.min(target, cur.speed + seg.accel * taper * dt);
        done = cur.speed >= target - 1e-3 || (seg.duration !== undefined && cur.elapsed >= seg.duration);
        break;
      }
      case 'decel': {
        const target = seg.toKmh / 3.6;
        cur.speed = Math.max(target, cur.speed + seg.accel * dt);
        done = cur.speed <= target + 1e-3;
        break;
      }
      case 'cruise': {
        const w = (seg.wobbleKmh ?? 0) / 3.6;
        cur.speed += Math.sin(cur.elapsed * 0.9) * w * 0.9 * dt;
        done = cur.elapsed >= seg.duration;
        break;
      }
    }
    if (done) {
      cur.segment = (cur.segment + 1) % scenario.segments.length;
      cur.elapsed = 0;
    }
    return Math.max(0, cur.speed);
  }
  return cur.speed;
}
