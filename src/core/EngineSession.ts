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
import { settingsSchema, withGearing, type Gearing, type Settings, type ShiftStyle, type Theme, type Transmission } from './settings.ts';
import { applyDriveProfile, getDriveProfile, type DriveProfileId } from '../drivetrain/driveProfiles.ts';
import { canCreateCustomProfile, canUseEngine, canUseManual, effectiveDriveProfile, resolveEntitlements, type Entitlements, type PlanOverride } from '../entitlements/entitlements.ts';
import {
  CUSTOM_ENGINES_SCHEMA, MAX_CUSTOM_ENGINES, buildCustomProfile, isCustomId, upsertSpec, validateSpec, type CustomEngineSpec,
} from '../studio/customEngine.ts';
import { PREVIEW_SECONDS, revPedalAt } from './preview.ts';
import { ENGINE_CATALOG } from '../profiles/catalog.ts';
import { layoutGroup } from '../garage/garage.ts';
import { STATISTICS_SCHEMA, StatsTracker, dayKey, emptyStatistics, type Statistics } from '../engagement/stats.ts';
import { ACHIEVEMENTS_SCHEMA, awardAchievements, type AchievementId, type AchievementState, type EngagementContext } from '../engagement/achievements.ts';
import { USER_PROFILE_SCHEMA, cleanText, type UserProfile } from '../engagement/profileCard.ts';
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
  /** Garage preview in progress (only while the ignition is off). */
  preview: { id: string; status: 'loading' | 'playing' } | null;
  /** Developer Mode plan simulator ('auto' = real plan). */
  planOverride: PlanOverride;
  entitlements: Entitlements;
  /** Drive Profile actually running (a locked choice falls back to COMFORT on a GPS drive). */
  activeDrive: { id: DriveProfileId; locked: boolean; preview: boolean };
  /** Gearbox actually running (manual needs PRO on a GPS drive). */
  activeTransmission: Transmission;
  /** Sound Studio engines saved in this browser. */
  customEngines: readonly CustomEngineSpec[];
  /** Local statistics (snapshot; refreshed when they are saved, not every tick). */
  stats: Statistics;
  achievements: AchievementState;
  userProfile: UserProfile;
  /** Achievements just awarded, shown briefly on the Drive screen. */
  achievementToast: { ids: readonly AchievementId[]; at: number } | null;
}

/** Result of saving a Sound Studio engine. */
export type SaveCustomResult = 'saved' | 'locked' | 'invalid' | 'full';

/** Preview id used for the unsaved engine open in the Sound Studio editor. */
export const STUDIO_DRAFT_ID = 'studio-draft';

export type ResetScope = 'favorites' | 'recent' | 'stats' | 'all';

/** Statistics are written at most this often while driving (plus on milestones and engine off). */
const STATS_SAVE_MS = 15_000;

/** High-frequency values, mutated in place every tick and read by the HUD via requestAnimationFrame. */
export interface Telemetry {
  motion: MotionState;
  drivetrain: DrivetrainState;
  /** Increments on every simulation tick. */
  frame: number;
  /** Last shift request and its result, for short HUD feedback (performance.now ms). */
  lastShift: { outcome: ShiftOutcome; at: number } | null;
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
  private previewTimer: ReturnType<typeof setInterval> | null = null;
  private previewToken = 0;
  private customProfiles = new Map<string, EngineProfile>();
  private readonly tracker: StatsTracker;
  private lastStatsSave = 0;

  constructor(baseUrl: string, storage: LocalStore = new LocalStore()) {
    this.storage = storage;
    this.settingsSchema = settingsSchema(DEFAULT_SETTINGS);
    const settings = storage.load(this.settingsSchema).value;
    if (!DEMO_SCENARIOS.some((d) => d.id === settings.demoScenarioId)) settings.demoScenarioId = DEFAULT_SETTINGS.demoScenarioId;
    applyTheme(settings.theme);
    const customEngines = storage.load(CUSTOM_ENGINES_SCHEMA).value;
    const stats = storage.load(STATISTICS_SCHEMA).value;
    this.tracker = new StatsTracker(structuredClone(stats));
    this.rebuildCustomProfiles(customEngines);
    const { scrollTrap, plan: planOverride } = storage.load(DEV_OPTIONS_SCHEMA).value;
    const entitlements = resolveEntitlements(planOverride);
    const saved = this.findProfile(settings.profileId);
    this.profile = saved && canUseEngine(entitlements, { custom: isCustomId(saved.id) }) ? saved : (getProfile(DEFAULT_PROFILE_ID) ?? (ENGINE_PROFILES[0] as EngineProfile));
    settings.profileId = this.profile.id;
    const locale = settings.language ?? browserLanguage();
    applyLanguage(locale);

    // Favorites / Last Used: drop ids of engines that no longer exist (incl. deleted custom engines).
    const known = new Set([...ENGINE_PROFILES.map((p) => p.id), ...this.customProfiles.keys()]);
    const favorites = this.loadIdList(FAVORITES_SCHEMA, known);
    const recentEngines = this.loadIdList(RECENT_SCHEMA, known);
    const activeDrive = effectiveDriveProfile(entitlements, settings.shiftStyle, 'gps');
    const activeTransmission: Transmission = settings.transmission === 'manual' && canUseManual(entitlements, 'gps') ? 'manual' : 'auto';
    const drive = getDriveProfile(activeDrive.id);
    this.drivetrain = new VirtualDrivetrain(applyDriveProfile(withGearing(this.profile, settings.gearing), drive), drive);
    this.drivetrain.setTransmission(activeTransmission);
    this.audio.setDriveTuning(drive);
    this.loader = new SoundBankLoader(baseUrl);
    this.store = new Store<SessionState>({
      ...settings,
      ignition: 'off', mode: 'gps', sourceStatus: { kind: 'idle' }, motionQuality: 'waiting',
      audioStatus: 'idle', bankKind: null, audioIssue: null,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      favorites, recentEngines, locale, scrollTrap, preview: null,
      planOverride, entitlements, activeDrive, activeTransmission, customEngines,
      stats: structuredClone(stats), achievements: storage.load(ACHIEVEMENTS_SCHEMA).value,
      userProfile: storage.load(USER_PROFILE_SCHEMA).value, achievementToast: null,
    });
    // Award anything already earned before this build (e.g. five favorites) — silently.
    this.evaluateAchievements(false);
    this.telemetry = { motion: this.estimator.sample(Date.now()), drivetrain: this.drivetrain.state, frame: 0, lastShift: null };

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
      if (document.visibilityState === 'hidden') this.saveStats(false);
      if (document.visibilityState === 'visible' && this.store.get().ignition === 'on') void this.audio.resume().catch(() => undefined);
    });
    window.addEventListener('pagehide', () => this.saveStats(false));

  }

  get currentProfile(): EngineProfile {
    return this.profile;
  }

  /** Built-in or Sound Studio engine by id. */
  findProfile(id: string): EngineProfile | undefined {
    return getProfile(id) ?? this.customProfiles.get(id);
  }

  /** Every engine the Garage lists: built-in first, then Sound Studio engines. */
  allProfiles(): EngineProfile[] {
    return [...ENGINE_PROFILES, ...this.customProfiles.values()];
  }

  /** May this engine be selected now (custom engines need the Sound Studio capability)? */
  canSelect(id: string): boolean {
    return canUseEngine(this.store.get().entitlements, { custom: isCustomId(id) });
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
    this.stopPreview(false);
    try {
      this.audio.unlock();
    } catch {
      this.store.set({ audioStatus: 'error', audioIssue: { kind: 'no-webaudio' } });
      return;
    }
    this.store.set({ ignition: 'starting', audioStatus: 'loading' });
    this.markUsed(this.profile.id);
    this.tracker.startCycle();
    this.saveStats(true);
    const bank = await this.bankFor(this.profile);
    this.audio.start(bank, this.geared(this.profile), { ignition: true });
    this.drivetrain.setProfile(this.geared(this.profile));
    this.drivetrain.ignite();
    this.startLoop();
    this.store.set({ ignition: 'on', audioStatus: this.audio.context?.state === 'running' ? 'running' : 'suspended', bankKind: bank.kind });
    if (!this.source) this.startSource(this.store.get().mode);
  }

  shutdown(): void {
    this.tracker.endCycle();
    this.saveStats(true);
    this.stopSource();
    this.drivetrain.shutdown();
    this.audio.playShutdown();
    // Let the engine wind down audibly before stopping the loop.
    setTimeout(() => {
      if (this.store.get().ignition !== 'off') return;
      this.stopLoop();
      if (this.store.get().preview) return; // a Garage preview took over the audio
      this.audio.stop();
    }, 700);
    this.store.set({ ignition: 'off', audioStatus: 'ready', mode: 'gps', sourceStatus: { kind: 'idle' } });
    this.applyDrive();
  }

  async resumeAudio(): Promise<void> {
    await this.audio.resume().catch(() => undefined);
    this.store.set({ audioStatus: this.audio.context?.state === 'running' ? 'running' : 'suspended' });
  }

  // --- Profiles --------------------------------------------------------------

  async selectProfile(id: string): Promise<void> {
    const profile = this.findProfile(id);
    if (this.store.get().preview) this.stopPreview(true);
    if (!profile || profile.id === this.profile.id || !this.canSelect(id)) return;
    await this.activate(profile);
  }

  /** Makes `profile` the running engine (also used to hot-apply an edited custom engine). */
  private async activate(profile: EngineProfile): Promise<void> {
    const id = profile.id;
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
      this.audio.start(bank, this.geared(profile));
      this.store.set({ audioStatus: 'running', bankKind: bank.kind });
    } else {
      this.drivetrain.setProfile(this.geared(profile));
      await this.preload(profile);
    }
    this.loader.evictExcept(profile);
  }

  // --- Garage preview ------------------------------------------------------------

  /**
   * Plays a short rev sequence of any engine without selecting it. Only while the ignition is
   * off (call from a tap: audio unlock needs the gesture). Tapping the same engine again stops it.
   */
  async previewEngine(id: string): Promise<void> {
    const profile = this.findProfile(id);
    if (profile) await this.previewProfile(profile, id);
  }

  /** Sound Studio: preview the engine being edited, before it is saved (same rev sequence). */
  async previewDraft(spec: CustomEngineSpec): Promise<void> {
    if (validateSpec(spec).length) return;
    await this.previewProfile(this.customProfile({ ...spec, id: 'custom-draft' }), STUDIO_DRAFT_ID);
  }

  private async previewProfile(profile: EngineProfile, id: string): Promise<void> {
    if (this.store.get().ignition !== 'off') return;
    const current = this.store.get().preview;
    this.stopPreview(current !== null);
    if (current?.id === id) return;
    try {
      this.audio.unlock();
    } catch {
      this.store.set({ audioIssue: { kind: 'no-webaudio' } });
      return;
    }
    const token = ++this.previewToken;
    this.store.set({ preview: { id, status: 'loading' } });
    const bank = await this.bankFor(profile);
    if (token !== this.previewToken || this.store.get().ignition !== 'off') return;
    this.stopLoop(); // a just-switched-off engine must not keep driving the audio
    const dt = new VirtualDrivetrain(this.geared(profile), getDriveProfile(this.store.get().activeDrive.id));
    dt.ignite();
    this.audio.start(bank, this.geared(profile), { ignition: true });
    void this.audio.resume().catch(() => undefined);
    this.store.set({ preview: { id, status: 'playing' } });
    const step = TICK_MS / 1000;
    let t = 0;
    this.previewTimer = setInterval(() => {
      t += step;
      dt.setRevPedal(revPedalAt(t));
      const events = dt.update(step, { speed: 0, accel: 0, stationary: true });
      this.audio.update(dt.state, events);
      if (t >= PREVIEW_SECONDS) this.stopPreview(true);
    }, TICK_MS);
  }

  /** Ends a preview. `fade` plays the shut-down sound; false cuts it (engine about to start). */
  stopPreview(fade = true): void {
    const active = this.store.get().preview;
    if (!active && this.previewTimer === null) return;
    ++this.previewToken;
    if (this.previewTimer !== null) clearInterval(this.previewTimer);
    this.previewTimer = null;
    this.store.set({ preview: null });
    if (this.store.get().ignition !== 'off' || active?.status !== 'playing') return;
    if (!fade) return this.audio.stop();
    this.audio.playShutdown();
    const token = this.previewToken;
    setTimeout(() => {
      if (token !== this.previewToken || this.store.get().ignition !== 'off' || this.store.get().preview) return;
      this.audio.stop();
      this.loader.evictExcept(this.profile);
    }, 700);
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
    this.applyDrive();
  }

  /** Drive Profile (COMFORT / SPORT / TRACK). A locked choice is kept and previewable in Demo. */
  setShiftStyle(shiftStyle: ShiftStyle): void {
    this.store.set({ shiftStyle });
    this.persist();
    this.applyDrive();
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
    if (!this.findProfile(id)) return;
    const favorites = toggleFavorite(this.store.get().favorites, id);
    this.store.set({ favorites });
    this.storage.save(FAVORITES_SCHEMA, favorites);
    this.evaluateAchievements(true);
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
    if (scope === 'stats' || scope === 'all') {
      this.storage.remove(STATISTICS_SCHEMA.key);
      this.storage.remove(ACHIEVEMENTS_SCHEMA.key);
      const fresh = emptyStatistics();
      this.tracker.replace(fresh);
      // A drive in progress keeps counting from zero (its START is not counted again).
      this.store.set({ stats: structuredClone(fresh), achievements: { unlocked: {} }, achievementToast: null });
    }
    if (scope !== 'all') return;
    this.storage.clearAll([
      this.settingsSchema.key, FAVORITES_SCHEMA.key, RECENT_SCHEMA.key, DEV_OPTIONS_SCHEMA.key, CUSTOM_ENGINES_SCHEMA.key,
      STATISTICS_SCHEMA.key, ACHIEVEMENTS_SCHEMA.key, USER_PROFILE_SCHEMA.key,
    ]);
    this.store.set({ userProfile: USER_PROFILE_SCHEMA.defaults() });
    this.rebuildCustomProfiles([]);
    this.store.set({ customEngines: [] });
    if (isCustomId(this.profile.id)) void this.activate(getProfile(DEFAULT_PROFILE_ID) ?? (ENGINE_PROFILES[0] as EngineProfile));
    const d = DEFAULT_SETTINGS;
    const locale = browserLanguage();
    this.store.set({
      volume: d.volume, units: d.units, demoScenarioId: d.demoScenarioId, demoNoise: d.demoNoise,
      demoNoCoordsSpeed: d.demoNoCoordsSpeed, gearing: d.gearing, shiftStyle: d.shiftStyle, transmission: d.transmission, theme: d.theme,
      language: null, locale, scrollTrap: false, planOverride: 'auto',
    });
    this.audio.setVolume(d.volume);
    applyTheme(d.theme);
    applyLanguage(locale);
    this.applyDrive();
    // Settings key stays removed until the user changes something.
  }

  /** Storage schema versions and last load outcome, for Developer Mode. */
  storageReport(): ReadonlyMap<string, { version: number; storedVersion: number | null; outcome: string }> {
    return this.storage.report;
  }

  /** Steering-wheel scroll / keys: one gear down (-1) or up (+1) from what the automatic chose. */
  manualShift(direction: -1 | 1): ShiftOutcome {
    if (this.store.get().ignition !== 'on') return this.feedback('ignition-off');
    const r = this.drivetrain.manualShift(direction);
    return this.feedback(r === 'not-running' ? 'ignition-off' : r);
  }

  /** Preferred gearbox. MANUAL needs PRO on a GPS drive (Demo can preview it). */
  setTransmission(transmission: Transmission): ShiftOutcome {
    this.store.set({ transmission });
    this.persist();
    this.applyDrive();
    if (transmission === 'manual' && this.store.get().activeTransmission !== 'manual') return this.feedback('locked');
    return this.feedback('switched');
  }

  /** M key / A-M button. */
  toggleTransmission(): ShiftOutcome {
    return this.setTransmission(this.store.get().activeTransmission === 'manual' ? 'auto' : 'manual');
  }

  /** Developer Mode: simulate a FREE or PRO user. */
  setPlanOverride(planOverride: PlanOverride): void {
    this.store.set({ planOverride });
    this.saveDevOptions();
    this.applyDrive();
    // A custom engine that is no longer allowed is kept, but the default engine takes over.
    if (!this.canSelect(this.profile.id)) void this.activate(getProfile(DEFAULT_PROFILE_ID) ?? (ENGINE_PROFILES[0] as EngineProfile));
  }

  // --- Sound Studio ------------------------------------------------------------------

  /**
   * Saves a new or edited custom engine. Editing the engine that is running applies the change
   * immediately (the sound source may change, so its bank is reloaded).
   */
  async saveCustomEngine(spec: CustomEngineSpec): Promise<SaveCustomResult> {
    const st = this.store.get();
    if (!canCreateCustomProfile(st.entitlements)) return 'locked';
    if (validateSpec(spec, new Set(ENGINE_PROFILES.filter((p) => p.audio.converted).map((p) => p.id))).length) return 'invalid';
    const exists = st.customEngines.some((c) => c.id === spec.id);
    if (!exists && st.customEngines.length >= MAX_CUSTOM_ENGINES) return 'full';
    const customEngines = upsertSpec(st.customEngines, { ...spec, updatedAt: Date.now() });
    if (!this.storage.save(CUSTOM_ENGINES_SCHEMA, customEngines) && this.storage.available) return 'full';
    this.rebuildCustomProfiles(customEngines);
    this.store.set({ customEngines });
    if (!exists) {
      this.tracker.noteEngineCreated();
      this.saveStats(true);
    }
    const updated = this.customProfiles.get(spec.id);
    if (updated && this.profile.id === spec.id) await this.activate(updated);
    return 'saved';
  }

  /** Deletes a custom engine (the UI confirms first). Favorites / Last Used forget it too. */
  deleteCustomEngine(id: string): void {
    const st = this.store.get();
    if (!st.customEngines.some((c) => c.id === id)) return;
    if (st.preview?.id === id) this.stopPreview(false);
    const customEngines = st.customEngines.filter((c) => c.id !== id);
    this.storage.save(CUSTOM_ENGINES_SCHEMA, customEngines);
    this.rebuildCustomProfiles(customEngines);
    const favorites = st.favorites.filter((f) => f !== id);
    const recentEngines = st.recentEngines.filter((f) => f !== id);
    this.store.set({ customEngines, favorites, recentEngines });
    this.storage.save(FAVORITES_SCHEMA, favorites);
    this.storage.save(RECENT_SCHEMA, recentEngines);
    if (this.profile.id === id) void this.activate(getProfile(DEFAULT_PROFILE_ID) ?? (ENGINE_PROFILES[0] as EngineProfile));
  }

  private customProfile(spec: CustomEngineSpec): EngineProfile {
    return buildCustomProfile(spec, spec.sound.kind === 'bank' ? getProfile(spec.sound.bankId) : undefined);
  }

  private rebuildCustomProfiles(list: readonly CustomEngineSpec[]): void {
    this.customProfiles = new Map(list.map((c) => [c.id, this.customProfile(c)]));
  }

  /** Developer Mode: experimental scroll trap for steering wheels that only scroll the page. */
  setScrollTrap(scrollTrap: boolean): void {
    this.store.set({ scrollTrap });
    this.saveDevOptions();
  }

  private saveDevOptions(): void {
    const st = this.store.get();
    this.storage.save(DEV_OPTIONS_SCHEMA, { scrollTrap: st.scrollTrap, plan: st.planOverride });
  }

  private feedback(outcome: ShiftOutcome): ShiftOutcome {
    this.telemetry.lastShift = { outcome, at: typeof performance === 'undefined' ? Date.now() : performance.now() };
    return outcome;
  }

  /**
   * Recomputes entitlements, the running Drive Profile and gearbox from the user's choices and
   * the current mode, and pushes them into the drivetrain and audio. Never touches the selected
   * engine or the stored choices.
   */
  private applyDrive(): void {
    const st = this.store.get();
    const entitlements = resolveEntitlements(st.planOverride);
    const activeDrive = effectiveDriveProfile(entitlements, st.shiftStyle, st.mode);
    const activeTransmission: Transmission = st.transmission === 'manual' && canUseManual(entitlements, st.mode) ? 'manual' : 'auto';
    const drive = getDriveProfile(activeDrive.id);
    this.store.set({ entitlements, activeDrive, activeTransmission });
    this.drivetrain.setDriveProfile(drive);
    this.drivetrain.setProfile(this.geared(this.profile));
    this.drivetrain.setTransmission(activeTransmission);
    this.audio.setDriveTuning(drive);
    this.audio.setProfile(this.geared(this.profile));
  }

  /** On-screen REV pedal held / released. */
  setRevPedal(down: boolean): void {
    this.drivetrain.setRevPedal(down && this.store.get().ignition === 'on');
  }

  private geared(p: EngineProfile): EngineProfile {
    const st = this.store?.get();
    const id = st ? st.activeDrive.id : 'sport';
    return applyDriveProfile(withGearing(p, st ? st.gearing : 'normal'), getDriveProfile(id));
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
    this.applyDrive();
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
    const st = this.store.get();
    if (st.ignition !== 'on') return;
    const milestones = this.tracker.tick(dt, {
      mode: st.mode, transmission: st.activeTransmission, driveProfile: st.activeDrive.id,
      engineId: this.profile.id, layout: layoutGroup(this.profile),
      speed: motion.speed, quality: motion.quality, rpm: this.drivetrain.state.rpm, now: Date.now(),
    });
    if (milestones.length > 0 || t - this.lastStatsSave >= STATS_SAVE_MS) this.saveStats(true);
  }

  // --- Profile & statistics ------------------------------------------------------------

  /** Display name / vehicle (cleaned and length-limited). */
  setUserProfile(patch: Partial<UserProfile>): void {
    const cur = this.store.get().userProfile;
    const userProfile: UserProfile = {
      displayName: patch.displayName === undefined ? cur.displayName : cleanText(patch.displayName),
      vehicle: patch.vehicle === undefined ? cur.vehicle : cleanText(patch.vehicle),
    };
    this.store.set({ userProfile });
    this.storage.save(USER_PROFILE_SCHEMA, userProfile);
  }

  dismissAchievementToast(): void {
    this.store.set({ achievementToast: null });
  }

  /** Inputs of the achievement / challenge rules. */
  engagementContext(): EngagementContext {
    const st = this.store.get();
    return { stats: st.stats, favorites: st.favorites, customCount: st.customEngines.length, catalog: ENGINE_CATALOG, today: dayKey(Date.now()) };
  }

  /** Persists the statistics (batched) and publishes a snapshot to the UI. */
  private saveStats(evaluate: boolean): void {
    this.lastStatsSave = typeof performance === 'undefined' ? Date.now() : performance.now();
    const snapshot = structuredClone(this.tracker.stats);
    this.storage.save(STATISTICS_SCHEMA, snapshot);
    this.store.set({ stats: snapshot });
    if (evaluate) this.evaluateAchievements(true);
  }

  /** Awards newly met achievements once (never twice); `announce` shows the Drive toast. */
  private evaluateAchievements(announce: boolean): void {
    const st = this.store.get();
    const { state, awarded } = awardAchievements(st.achievements, this.engagementContext(), Date.now());
    if (awarded.length === 0) return;
    this.storage.save(ACHIEVEMENTS_SCHEMA, state);
    this.store.set({ achievements: state, achievementToast: announce ? { ids: awarded, at: Date.now() } : st.achievementToast });
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
      shiftStyle: s.shiftStyle, transmission: s.transmission, theme: s.theme, language: s.language,
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
  gearing: 'normal', shiftStyle: 'sport', transmission: 'auto', theme: 'dark', language: null,
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
