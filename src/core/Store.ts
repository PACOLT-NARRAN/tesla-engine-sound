/** Minimal observable store for LOW-frequency UI state (works with useSyncExternalStore). */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  set(patch: Partial<T>): void {
    let changed = false;
    for (const k in patch) {
      if (!Object.is(patch[k], this.state[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}
