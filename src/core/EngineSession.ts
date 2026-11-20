import { EngineAudioEngine, type AudioDebugInfo } from '../audio/EngineAudioEngine.ts';
import { SoundBankLoader, buildPlaceholderBank } from '../audio/SoundBankLoader.ts';
import type { SoundBank } from '../audio/types.ts';
import { VirtualDrivetrain } from '../drivetrain/VirtualDrivetrain.ts';
import { DemoMotionSource } from '../motion/DemoMotionSource.ts';
import { DEMO_SCENARIOS } from '../motion/demoScenarios.ts';
import { GeolocationMotionSource } from '../motion/GeolocationMotionSource.ts';
import { MotionEstimator } from '../motion/MotionEstimator.ts';
import { DEFAULT_PROFILE_ID, ENGINE_PROFILES, getProfile } from '../profiles/registry.ts';
import type { DrivetrainState } from '../types/drivetrain.ts';
import type { MotionSource, MotionSourceStatus, MotionState } from '../types/motion.ts';
import type { EngineProfile } from '../types/profile.ts';
import { detectLanguage, type Language } from '../i18n/index.ts';
import { FAVORITES_SCHEMA, RECENT_SCHEMA, pushRecent, reconcileIds, toggleFavorite } from '../storage/engineLists.ts';
import { DEV_OPTIONS_SCHEMA } from '../input/devOptions.ts';
import type { ShiftOutcome } from '../input/types.ts';
import { LocalStore, type StoredSchema } from '../storage/storage.ts';
import { settingsSchema, withGearing, withShiftStyle, type Gearing, type Settings, type ShiftStyle, type Theme } from './settings.ts';
import { Store } from './Store.ts';

export type IgnitionState = 'off' | 'starting' | 'on';
export type AudioStatus = 'idle' | 'loading' | 'ready' | 'running' | 'suspended' | 'error';

export interface SessionState extends Settings {
  ignition: IgnitionState;
  mode: 'gps' | 'demo';
  sourceStatus: MotionSourceStatus;
  motionQuality: MotionState['quality'];
  audioStatus: AudioStatus;
  bankKind: SoundBank['kind'] | null;
  /** Audio problem to show the user (localized in the UI); `detail` is English developer info. */
  audioIssue: { kind: 'no-webaudio' } | { kind: 'bank-failed'; detail: string } | null;
  online: boolean;
  /** Favorite engine ids, in the order the user added them. */
  favorites: readonly string[];
  /** Last used engine ids, newest first, at most three. */
  recentEngines: readonly string[];
  /** Effective UI language: the saved choice, else the browser language. */
  locale: Language;
  /** Developer Mode option (see src/input/devOptions.ts). */
  scrollTrap: boolean;
}

export type ResetScope = 'favorites' | 'recent' | 'all';

/** High-frequency values, mutated in place every tick and read by the HUD via requestAnimationFrame. */
export interface Telemetry {
  motion: MotionState;
  drivetrain: DrivetrainState;
  /** Increments on every simulation tick. */
  frame: number;
}

const TICK_MS = 20;

/**
 * Orchestrates the pipeline: MotionSource -> MotionEstimator -> VirtualDrivetrain -> EngineAudioEngine.
 * Demo and GPS differ ONLY in the MotionSource. Lives outside React.
 */
export class EngineSession {
  readonly store: Store<SessionState>;
  readonly telemetry: Telemetry;
  private readonly estimator = new MotionEstimator();
  private readonly drivetrain: VirtualDrivetrain;
  private readonly audio = new EngineAudioEngine();
  private readonly loader: SoundBankLoader;
  private source: MotionSource | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private profile: EngineProfile;
  private profileToken = 0;
  private readonly storage: LocalStore;
  private readonly settingsSchema: StoredSchema<Settings>;

  constructor(baseUrl: string, storage: LocalStore = new LocalStore()) {
    this.storage = storage;
    this.settingsSchema = settingsSchema(DEFAULT_SETTINGS);
    const settings = storage.load(this.settingsSchema).value;
    if (!DEMO_SCENARIOS.some((d) => d.id === settings.demoScenarioId)) settings.demoScenarioId = DEFAULT_SETTINGS.demoScenarioId;
    applyTheme(settings.theme);
    this.profile = getProfile(settings.profileId) ?? (ENGINE_PROFILES[0] as EngineProfile);
    settings.profileId = this.profile.id;
    const locale = settings.language ?? browserLanguage();
    applyLanguage(locale);

    // Favorites / Last Used: drop ids of engines that no longer exist.
    const known = new Set(ENGINE_PROFILES.map((p) => p.id));
    const favorites = this.loadIdList(FAVORITES_SCHEMA, known);
    const recentEngines = this.loadIdList(RECENT_SCHEMA, known);
    const { scrollTrap } = storage.load(DEV_OPTIONS_SCHEMA).value;
    this.drivetrain = new VirtualDrivetrain(withShiftStyle(withGearing(this.profile, settings.gearing), settings.shiftStyle));
    this.loader = new SoundBankLoader(baseUrl);
    this.store = new Store<SessionState>({
      ...settings,
      ignition: 'off', mode: 'gps', sourceStatus: { kind: 'idle' }, motionQuality: 'waiting',
      audioStatus: 'idle', bankKind: null, audioIssue: null,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      favorites, recentEngines, locale, scrollTrap,
    });
    this.telemetry = { motion: this.estimator.sample(Date.now()), drivetrain: this.drivetrain.state, frame: 0 };

    this.audio.setVolume(settings.volume);
    // Preload the selected engine's sound before the driver presses START.
    if (typeof window !== 'undefined') void this.preload(this.profile);
    this.audio.onStateChange((s) => {
      if (this.store.get().ignition !== 'on') return;
      this.store.set({ audioStatus: s === 'running' ? 'running' : 'suspended' });
    });
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.store.set({ online: true }));
    window.addEventListener('offline', () => this.store.set({ online: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.store.get().ignition === 'on') void this.audio.resume().catch(() => undefined);
    });

  }

  get currentProfile(): EngineProfile {
    return this.profile;
  }

  audioDebug(): AudioDebugInfo {
    return this.audio.debugInfo();
  }

  // --- Ignition --------------------------------------------------------------

  /** Call directly from a click/tap handler (audio unlock must happen inside the gesture). */
  async toggleIgnition(): Promise<void> {
    const st = this.store.get().ignition;
    if (st === 'on') return this.shutdown();
    if (st === 'starting') return;
    await this.ignite();
  }

  async ignite(): Promise<void> {
    try {
      this.audio.unlock();
    } catch {
      this.store.set({ audioStatus: 'error', audioIssue: { kind: 'no-webaudio' } });
      return;
    }
    this.store.set({ ignition: 'starting', audioStatus: 'loading' });
    this.markUsed(this.profile.id);
    const bank = await this.bankFor(this.profile);
    this.audio.start(bank, this.profile, { ignition: true });
    this.drivetrain.setProfile(this.geared(this.profile));
    this.drivetrain.ignite();
    this.startLoop();
    this.store.set({ ignition: 'on', audioStatus: this.audio.context?.state === 'running' ? 'running' : 'suspended', bankKind: bank.kind });
    if (!this.source) this.startSource(this.store.get().mode);
  }

  shutdown(): void {
    this.stopSource();
    this.drivetrain.shutdown();
    this.audio.playShutdown();
    // Let the engine wind down audibly before stopping the loop.
    setTimeout(() => {
      if (this.store.get().ignition !== 'off') return;
      this.audio.stop();
      this.stopLoop();
    }, 700);
    this.store.set({ ignition: 'off', audioStatus: 'ready', mode: 'gps', sourceStatus: { kind: 'idle' } });
  }

  async resumeAudio(): Promise<void> {
    await this.audio.resume().catch(() => undefined);
    this.store.set({ audioStatus: this.audio.context?.state === 'running' ? 'running' : 'suspended' });
  }

  // --- Profiles --------------------------------------------------------------

  async selectProfile(id: string): Promise<void> {
    const profile = getProfile(id);
    if (!profile || profile.id === this.profile.id) return;
    this.profile = profile;
    this.store.set({ profileId: id });
    this.persist();
    this.markUsed(id);
    const token = ++this.profileToken;
    if (this.store.get().ignition === 'on') {
      this.store.set({ audioStatus: 'loading' });
      const bank = await this.bankFor(profile);
      if (token !== this.profileToken) return;
      this.drivetrain.setProfile(this.geared(profile));
      this.audio.start(bank, profile);
      this.store.set({ audioStatus: 'running', bankKind: bank.kind });
    } else {
      this.drivetrain.setProfile(this.geared(profile));
      await this.preload(profile);
    }
    this.loader.evictExcept(profile.id);
  }

  // --- Modes -----------------------------------------------------------------

  /** Start Demo Mode. Ignites the engine first if needed (call from a tap). */
  async startDemo(scenarioId?: string): Promise<void> {
    if (scenarioId) this.store.set({ demoScenarioId: scenarioId });
    this.persist();
    if (this.store.get().ignition === 'off') {
      this.store.set({ mode: 'demo' });
      await this.ignite();
      return;
    }
    this.startSource('demo');
  }

  stopDemo(): void {
    this.startSource('gps');
  }

  setDemoOptions(o: Partial<Pick<Settings, 'demoNoise' | 'demoNoCoordsSpeed'>>): void {
    this.store.set(o);
    this.persist();
    if (this.store.get().mode === 'demo' && this.store.get().ignition === 'on') this.startSource('demo');
  }

  setVolume(v: number): void {
    this.audio.setVolume(v);
    this.store.set({ volume: v });
    this.persist();
  }

  setUnits(units: Settings['units']): void {
    this.store.set({ units });
    this.persist();
  }

  /** Shorter virtual gearing: the engine uses its whole rev range at lower road speeds. */
  setGearing(gearing: Gearing): void {
    this.store.set({ gearing });
    this.persist();
    this.drivetrain.setProfile(this.geared(this.profile));
  }

  setShiftStyle(shiftStyle: ShiftStyle): void {
    this.store.set({ shiftStyle });
    this.persist();
    this.drivetrain.setProfile(this.geared(this.profile));
  }

  setTheme(theme: Theme): void {
    this.store.set({ theme });
    this.persist();
    applyTheme(theme);
  }

  setLanguage(language: Language): void {
    this.store.set({ language, locale: language });
    this.persist();
    applyLanguage(language);
  }

  toggleFavorite(id: string): void {
    if (!getProfile(id)) return;
    const favorites = toggleFavorite(this.store.get().favorites, id);
    this.store.set({ favorites });
    this.storage.save(FAVORITES_SCHEMA, favorites);
  }

  /**
   * Reset Local Data. 'all' removes every stored REVLINE key and returns preferences to their
   * defaults in place — the running engine and audio are not interrupted.
   */
  resetLocalData(scope: ResetScope): void {
    if (scope === 'favorites' || scope === 'all') {
      this.storage.remove(FAVORITES_SCHEMA.key);
      this.store.set({ favorites: [] });
    }
    if (scope === 'recent' || scope === 'all') {
      this.storage.remove(RECENT_SCHEMA.key);
      this.store.set({ recentEngines: [] });
    }
    if (scope !== 'all') return;
    this.storage.clearAll([this.settingsSchema.key, FAVORITES_SCHEMA.key, RECENT_SCHEMA.key, DEV_OPTIONS_SCHEMA.key]);
    const d = DEFAULT_SETTINGS;
    const locale = browserLanguage();
    this.store.set({
      volume: d.volume, units: d.units, demoScenarioId: d.demoScenarioId, demoNoise: d.demoNoise,
      demoNoCoordsSpeed: d.demoNoCoordsSpeed, gearing: d.gearing, shiftStyle: d.shiftStyle, theme: d.theme,
      language: null, locale, scrollTrap: false,
    });
    this.audio.setVolume(d.volume);
    applyTheme(d.theme);
    applyLanguage(locale);
    this.drivetrain.setProfile(this.geared(this.profile));
    // Settings key stays removed until the user changes something.
  }

  /** Storage schema versions and last load outcome, for Developer Mode. */
  storageReport(): ReadonlyMap<string, { version: number; storedVersion: number | null; outcome: string }> {
    return this.storage.report;
  }

  /** Steering-wheel scroll / keys: one gear down (-1) or up (+1) from what the automatic chose. */
  manualShift(direction: -1 | 1): ShiftOutcome {
    if (this.store.get().ignition !== 'on') return 'ignition-off';
    const r = this.drivetrain.manualShift(direction);
    return r === 'not-running' ? 'ignition-off' : r;
  }

  /** Developer Mode: experimental scroll trap for steering wheels that only scroll the page. */
  setScrollTrap(scrollTrap: boolean): void {
    this.store.set({ scrollTrap });
    this.storage.save(DEV_OPTIONS_SCHEMA, { scrollTrap });
  }

  /** On-screen REV pedal held / released. */
  setRevPedal(down: boolean): void {
    this.drivetrain.setRevPedal(down && this.store.get().ignition === 'on');
  }

  private geared(p: EngineProfile): EngineProfile {
    const st = this.store.get();
    return withShiftStyle(withGearing(p, st.gearing), st.shiftStyle);
  }

  // --- Internals -------------------------------------------------------------

  private startSource(mode: 'gps' | 'demo'): void {
    this.stopSource();
    this.estimator.reset();
    const st = this.store.get();
    const src: MotionSource =
      mode === 'demo'
        ? new DemoMotionSource(DEMO_SCENARIOS.find((s) => s.id === st.demoScenarioId) ?? (DEMO_SCENARIOS[0] as (typeof DEMO_SCENARIOS)[number]), {
            noise: st.demoNoise,
            withoutCoordsSpeed: st.demoNoCoordsSpeed,
          })
        : new GeolocationMotionSource();
    this.source = src;
    this.store.set({ mode, sourceStatus: { kind: 'starting' } });
    src.start(
      (fix) => this.estimator.ingest(fix),
      (status) => {
        if (this.source === src) this.store.set({ sourceStatus: status });
      },
    );
  }

  private stopSource(): void {
    this.source?.stop();
    this.source = null;
  }

  private startLoop(): void {
    if (this.timer !== null) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopLoop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const t = performance.now();
    const dt = (t - this.lastTick) / 1000;
    this.lastTick = t;
    const motion = this.estimator.sample(Date.now());
    const events = this.drivetrain.update(dt, motion);
    this.audio.update(this.drivetrain.state, events);
    this.telemetry.motion = motion;
    this.telemetry.drivetrain = this.drivetrain.state;
    this.telemetry.frame++;
    if (motion.quality !== this.store.get().motionQuality) this.store.set({ motionQuality: motion.quality });
  }

  private async preload(profile: EngineProfile): Promise<void> {
    this.store.set({ audioStatus: 'loading' });
    const bank = await this.bankFor(profile);
    if (this.store.get().ignition === 'off') this.store.set({ audioStatus: 'ready', bankKind: bank.kind });
  }

  private async bankFor(profile: EngineProfile): Promise<SoundBank> {
    try {
      const bank = await this.loader.load(profile);
      this.store.set({ audioIssue: null });
      return bank;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.store.set({ audioIssue: { kind: 'bank-failed', detail } });
      return buildPlaceholderBank(profile);
    }
  }

  private persist(): void {
    const s = this.store.get();
    this.storage.save(this.settingsSchema, {
      profileId: s.profileId, volume: s.volume, units: s.units,
      demoScenarioId: s.demoScenarioId, demoNoise: s.demoNoise, demoNoCoordsSpeed: s.demoNoCoordsSpeed, gearing: s.gearing,
      shiftStyle: s.shiftStyle, theme: s.theme, language: s.language,
    });
  }

  private markUsed(id: string): void {
    const recentEngines = pushRecent(this.store.get().recentEngines, id);
    this.store.set({ recentEngines });
    this.storage.save(RECENT_SCHEMA, recentEngines);
  }

  private loadIdList(schema: StoredSchema<string[]>, known: ReadonlySet<string>): string[] {
    const { value, outcome } = this.storage.load(schema);
    const clean = reconcileIds(value, known);
    if (outcome !== 'missing' && outcome !== 'unavailable' && outcome !== 'future' && clean.length !== value.length) this.storage.save(schema, clean);
    return clean;
  }
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  profileId: DEFAULT_PROFILE_ID, volume: 0.8, units: 'kmh',
  demoScenarioId: DEMO_SCENARIOS[0]?.id ?? 'full-cycle', demoNoise: false, demoNoCoordsSpeed: false,
  gearing: 'normal', shiftStyle: 'sport', theme: 'dark', language: null,
};

function browserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function applyLanguage(lang: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef0f3' : '#050507');
}
