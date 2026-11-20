import type { InputEventKind, InputLogEntry } from './types.ts';

export const LOG_LIMIT = 150;

export interface InputSummary {
  total: number;
  byKind: Record<InputEventKind, number>;
  /** Wheel events, or native scroll caught by the scroll trap, seen since the last clear. */
  wheelLike: number;
  /** Actions actually applied to the drivetrain. */
  applied: number;
  last: InputLogEntry | null;
}

const emptyCounts = (): Record<InputEventKind, number> => ({
  wheel: 0, scroll: 0, keydown: 0, keyup: 0, pointerdown: 0, focus: 0, blur: 0, visibility: 0,
});

/**
 * In-memory ring buffer of raw input events for Developer Mode. Nothing is persisted or sent.
 * Counters keep counting past the buffer limit.
 */
export class InputDiagnostics {
  private entries: InputLogEntry[] = [];
  private nextId = 1;
  private counts = emptyCounts();
  private wheelLike = 0;
  private applied = 0;
  private readonly listeners = new Set<() => void>();

  private readonly limit: number;

  constructor(limit = LOG_LIMIT) {
    this.limit = limit;
  }

  record(e: Omit<InputLogEntry, 'id'>): InputLogEntry {
    const entry: InputLogEntry = { ...e, id: this.nextId++ };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    this.counts[e.kind]++;
    if (e.kind === 'wheel' || e.adapter === 'scroll-trap') this.wheelLike++;
    if (e.outcome === 'applied') this.applied++;
    this.emit();
    return entry;
  }

  /** Oldest first. */
  list(): readonly InputLogEntry[] {
    return this.entries;
  }

  summary(): InputSummary {
    const total = Object.values(this.counts).reduce((a, b) => a + b, 0);
    return { total, byKind: { ...this.counts }, wheelLike: this.wheelLike, applied: this.applied, last: this.entries.at(-1) ?? null };
  }

  clear(): void {
    this.entries = [];
    this.counts = emptyCounts();
    this.wheelLike = 0;
    this.applied = 0;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Plain-text export for COPY LOG (newest last). */
  toText(): string {
    const s = this.summary();
    const head = `REVLINE input log — ${s.total} events (wheel ${s.byKind.wheel}, scroll ${s.byKind.scroll}, keydown ${s.byKind.keydown}, pointer ${s.byKind.pointerdown}), wheel-like ${s.wheelLike}, applied ${s.applied}`;
    return [head, ...this.entries.map(formatEntry)].join('\n');
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

const num = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(1));

export function formatEntry(e: InputLogEntry): string {
  const parts = [`${(e.t / 1000).toFixed(2)}s`, e.kind, `[${e.adapter}]`, e.target];
  if (e.dx !== null) parts.push(`dx=${num(e.dx)}`);
  if (e.dy !== null) parts.push(`dy=${num(e.dy)}`);
  if (e.deltaMode !== null) parts.push(`mode=${e.deltaMode}`);
  if (e.key !== null) parts.push(`key=${e.key}`);
  if (e.code !== null) parts.push(`code=${e.code}`);
  if (e.action) parts.push(`→ ${e.action}${e.outcome ? ` (${e.outcome})` : ''}`);
  else if (e.outcome) parts.push(`(${e.outcome})`);
  if (e.note) parts.push(e.note);
  return parts.join(' ');
}

/** Shared instance; only fed when Developer Mode (?debug=1) is on. */
export const inputDiagnostics = new InputDiagnostics();
