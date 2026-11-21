import type { DriveProfileId } from '../drivetrain/driveProfiles.ts';
import type { LayoutGroup } from '../garage/garage.ts';
import type { MotionQuality } from '../types/motion.ts';
import { ID_PATTERN, asRecord, pickNumber, type StoredSchema } from '../storage/storage.ts';

/**
 * Local driving statistics (pure, unit tested). Stored only in this browser.
 *
 * What is NEVER recorded: positions, routes, speeds, timestamps of individual drives.
 * Only totals, the set of engines / layouts / Drive Profiles used and the calendar DAYS
 * REVLINE was used on (for the streak).
 *
 * COUNTING RULES (also in docs/ENGAGEMENT.md):
 * - Active driving time grows only while the engine is ON (not a Garage preview), the car
 *   MOVES (filtered speed >= MOVING_SPEED_MS) and — on GPS — the signal is usable (good/poor).
 *   An open app, a parked car or revving with the REV pedal never adds time.
 * - Each tick adds at most MAX_TICK_S, so a throttled background tab cannot add a burst.
 * - A SESSION is one ignition cycle (START → ENGINE OFF) that reached SESSION_MIN_S of active
 *   driving time. It is counted once, at the moment it crosses the threshold.
 * - An ACTIVE DAY is a local calendar day with at least one counted session. The streak is the
 *   number of consecutive active days ending today (or yesterday, so it survives until you drive).
 * - An engine counts as TRIED after ENGINE_TRY_S of active driving with it (total). Its layout and
 *   the Drive Profile count the same way (DRIVE_PROFILE_TRY_S).
 * - Top RPM is the highest simulated RPM while the engine runs (it is not a speed record).
 */

export const MOVING_SPEED_MS = 1.5; // ≈ 5 km/h
export const MAX_TICK_S = 0.5;
export const SESSION_MIN_S = 60;
export const ENGINE_TRY_S = 30;
export const DRIVE_PROFILE_TRY_S = 30;
/** Manual shifting time a Demo session needs to complete the "manual Demo" challenge. */
export const MANUAL_DEMO_S = 60;
export const MAX_ACTIVE_DAYS = 400;
export const MAX_ENGINE_ENTRIES = 300;
export const MAX_SECONDS = 1e9;

const DRIVE_IDS: readonly DriveProfileId[] = ['comfort', 'sport', 'track'];
const LAYOUTS: readonly LayoutGroup[] = ['v', 'inline', 'boxer', 'rotary'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface Statistics {
  ignitions: number;
  sessions: number;
  /** Active driving seconds (GPS + Demo). */
  driveSeconds: number;
  gpsSeconds: number;
  demoSeconds: number;
  autoSeconds: number;
  manualSeconds: number;
  maxRpm: number;
  /** Active driving seconds per engine id. */
  engineSeconds: Record<string, number>;
  /** Layouts of the engines tried. */
  layoutsTried: LayoutGroup[];
  driveProfileSeconds: Record<DriveProfileId, number>;
  /** Local days (YYYY-MM-DD) with a counted session, ascending. */
  activeDays: string[];
  bestStreak: number;
  /** Demo sessions driven with manual shifting (challenge). */
  manualDemoSessions: number;
  /** Sound Studio engines created (new saves, not edits). */
  enginesCreated: number;
}

export function emptyStatistics(): Statistics {
  return {
    ignitions: 0, sessions: 0, driveSeconds: 0, gpsSeconds: 0, demoSeconds: 0, autoSeconds: 0, manualSeconds: 0,
    maxRpm: 0, engineSeconds: {}, layoutsTried: [], driveProfileSeconds: { comfort: 0, sport: 0, track: 0 },
    activeDays: [], bestStreak: 0, manualDemoSessions: 0, enginesCreated: 0,
  };
}

// --- Derived values ------------------------------------------------------------------------

export function enginesTried(s: Statistics): string[] {
  return Object.keys(s.engineSeconds).filter((id) => (s.engineSeconds[id] ?? 0) >= ENGINE_TRY_S);
}

export function driveProfilesUsed(s: Statistics): DriveProfileId[] {
  return DRIVE_IDS.filter((id) => s.driveProfileSeconds[id] >= DRIVE_PROFILE_TRY_S);
}

/** Most-driven engine among `exists` (deleted custom engines are skipped), null if none. */
export function favoriteEngine(s: Statistics, exists: (id: string) => boolean): string | null {
  let best: string | null = null;
  let bestS = 0;
  for (const [id, sec] of Object.entries(s.engineSeconds)) {
    if (sec > bestS && exists(id)) {
      best = id;
      bestS = sec;
    }
  }
  return best;
}

/** Local calendar day of an epoch-ms time, "YYYY-MM-DD". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day before `key` (DST-safe: calendar arithmetic, not 24 h). */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() - 1);
  return dayKey(date.getTime());
}

/** Consecutive active days ending at `day`. */
function runEndingAt(days: ReadonlySet<string>, day: string): number {
  let n = 0;
  let k = day;
  while (days.has(k)) {
    n++;
    k = previousDay(k);
  }
  return n;
}

/** Current streak: ends today, or yesterday if today has no session yet. */
export function currentStreak(activeDays: readonly string[], today: string): number {
  const set = new Set(activeDays);
  if (set.has(today)) return runEndingAt(set, today);
  return runEndingAt(set, previousDay(today));
}

/** Adds a day (kept sorted, unique, bounded) and updates the best streak. */
export function addActiveDay(s: Statistics, day: string): Statistics {
  if (s.activeDays.includes(day)) return s;
  const activeDays = [...s.activeDays, day].sort().slice(-MAX_ACTIVE_DAYS);
  const streak = runEndingAt(new Set(activeDays), day);
  return { ...s, activeDays, bestStreak: Math.max(s.bestStreak, streak) };
}

// --- Tracker -------------------------------------------------------------------------------

/** What the session reports every simulation tick (no position, ever). */
export interface TickSample {
  mode: 'gps' | 'demo';
  transmission: 'auto' | 'manual';
  driveProfile: DriveProfileId;
  engineId: string;
  layout: LayoutGroup;
  /** Filtered vehicle speed, m/s — used only to decide "moving", never stored. */
  speed: number;
  quality: MotionQuality;
  rpm: number;
  /** Epoch ms (for the calendar day). */
  now: number;
}

/** Things that changed in a way that may unlock an achievement (save soon). */
export type Milestone = 'session' | 'engine-tried' | 'layout' | 'drive-profile' | 'manual-demo';

interface Cycle {
  active: number;
  counted: boolean;
  demoManual: number;
  manualDemoCounted: boolean;
}

/**
 * Accumulates statistics in memory. The owner decides when to persist (batched — see
 * EngineSession). Pure apart from the clock passed in each sample.
 */
export class StatsTracker {
  private s: Statistics;
  private cycle: Cycle | null = null;

  constructor(initial: Statistics) {
    this.s = initial;
  }

  get stats(): Statistics {
    return this.s;
  }

  get inCycle(): boolean {
    return this.cycle !== null;
  }

  replace(s: Statistics): void {
    this.s = s;
  }

  /** Engine started (START, not a Garage preview). */
  startCycle(): void {
    this.s = { ...this.s, ignitions: this.s.ignitions + 1 };
    this.cycle = { active: 0, counted: false, demoManual: 0, manualDemoCounted: false };
  }

  endCycle(): void {
    this.cycle = null;
  }

  noteEngineCreated(): void {
    this.s = { ...this.s, enginesCreated: this.s.enginesCreated + 1 };
  }

  /** Returns the milestones reached in this tick (usually none). */
  tick(dt: number, x: TickSample): Milestone[] {
    const c = this.cycle;
    if (!c || !(dt > 0)) return [];
    const s = this.s;
    if (Number.isFinite(x.rpm) && x.rpm > s.maxRpm) s.maxRpm = Math.round(x.rpm);

    const usable = x.mode === 'demo' || x.quality === 'good' || x.quality === 'poor';
    if (!usable || !(x.speed >= MOVING_SPEED_MS)) return [];

    const step = Math.min(dt, MAX_TICK_S);
    const out: Milestone[] = [];
    s.driveSeconds += step;
    if (x.mode === 'demo') s.demoSeconds += step;
    else s.gpsSeconds += step;
    if (x.transmission === 'manual') s.manualSeconds += step;
    else s.autoSeconds += step;

    const before = s.engineSeconds[x.engineId] ?? 0;
    if (before === 0 && Object.keys(s.engineSeconds).length >= MAX_ENGINE_ENTRIES) {
      // Bounded map: forget the least-driven engine to make room.
      const least = Object.entries(s.engineSeconds).sort((a, b) => a[1] - b[1])[0];
      if (least) delete s.engineSeconds[least[0]];
    }
    s.engineSeconds[x.engineId] = before + step;
    if (before < ENGINE_TRY_S && before + step >= ENGINE_TRY_S) {
      out.push('engine-tried');
      if (x.layout !== 'other' && !s.layoutsTried.includes(x.layout)) {
        s.layoutsTried = [...s.layoutsTried, x.layout];
        out.push('layout');
      }
    }

    const dp = s.driveProfileSeconds[x.driveProfile];
    s.driveProfileSeconds[x.driveProfile] = dp + step;
    if (dp < DRIVE_PROFILE_TRY_S && dp + step >= DRIVE_PROFILE_TRY_S) out.push('drive-profile');

    c.active += step;
    if (!c.counted && c.active >= SESSION_MIN_S) {
      c.counted = true;
      this.s = addActiveDay({ ...s, sessions: s.sessions + 1 }, dayKey(x.now));
      out.push('session');
    }
    if (x.mode === 'demo' && x.transmission === 'manual') c.demoManual += step;
    if (c.counted && !c.manualDemoCounted && c.demoManual >= MANUAL_DEMO_S) {
      c.manualDemoCounted = true;
      this.s = { ...this.s, manualDemoSessions: this.s.manualDemoSessions + 1 };
      out.push('manual-demo');
    }
    return out;
  }
}

// --- Storage -------------------------------------------------------------------------------

const sec = (v: unknown) => pickNumber(v, 0, MAX_SECONDS, 0);
const count = (v: unknown) => Math.floor(pickNumber(v, 0, MAX_SECONDS, 0));

export function sanitizeStatistics(data: unknown): Statistics {
  const r = asRecord(data);
  const engineSeconds: Record<string, number> = {};
  for (const [id, v] of Object.entries(asRecord(r.engineSeconds)).slice(0, MAX_ENGINE_ENTRIES)) {
    const n = sec(v);
    if (ID_PATTERN.test(id) && n > 0) engineSeconds[id] = n;
  }
  const dps = asRecord(r.driveProfileSeconds);
  const layouts = Array.isArray(r.layoutsTried) ? r.layoutsTried : [];
  const days = Array.isArray(r.activeDays) ? r.activeDays : [];
  const activeDays = [...new Set(days.filter((d): d is string => typeof d === 'string' && DAY_PATTERN.test(d)))].sort().slice(-MAX_ACTIVE_DAYS);
  return {
    ignitions: count(r.ignitions),
    sessions: count(r.sessions),
    driveSeconds: sec(r.driveSeconds),
    gpsSeconds: sec(r.gpsSeconds),
    demoSeconds: sec(r.demoSeconds),
    autoSeconds: sec(r.autoSeconds),
    manualSeconds: sec(r.manualSeconds),
    maxRpm: Math.round(pickNumber(r.maxRpm, 0, 30000, 0)),
    engineSeconds,
    layoutsTried: LAYOUTS.filter((l) => layouts.includes(l)),
    driveProfileSeconds: { comfort: sec(dps.comfort), sport: sec(dps.sport), track: sec(dps.track) },
    activeDays,
    bestStreak: count(r.bestStreak),
    manualDemoSessions: count(r.manualDemoSessions),
    enginesCreated: count(r.enginesCreated),
  };
}

export const STATISTICS_SCHEMA: StoredSchema<Statistics> = {
  key: 'revline.statistics.v1',
  version: 1,
  defaults: emptyStatistics,
  sanitize: (data) => sanitizeStatistics(data),
};
