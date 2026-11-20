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
import { GEARING_FACTOR, SHIFT_STYLE, loadSettings, saveSettings, withGearing, withShiftStyle, type Gearing, type Settings, type ShiftStyle, type Theme } from './settings.ts';
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
  audioMessage: string | null;
  online: boolean;
}

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

  constructor(baseUrl: string) {
    const settings = loadSettings({
      profileId: DEFAULT_PROFILE_ID, volume: 0.8, units: 'kmh',
      demoScenarioId: DEMO_SCENARIOS[0]?.id ?? 'full-cycle', demoNoise: false, demoNoCoordsSpeed: false, gearing: 'normal', shiftStyle: 'sport', theme: 'dark',
    });
    if (!(settings.gearing in GEARING_FACTOR)) settings.gearing = 'normal';
    if (!(settings.shiftStyle in SHIFT_STYLE)) settings.shiftStyle = 'sport';
    if (settings.theme !== 'light') settings.theme = 'dark';
    applyTheme(settings.theme);
    this.profile = getProfile(settings.profileId) ?? (ENGINE_PROFILES[0] as EngineProfile);
    settings.profileId = this.profile.id;
    this.drivetrain = new VirtualDrivetrain(withShiftStyle(withGearing(this.profile, settings.gearing), settings.shiftStyle));
    this.loader = new SoundBankLoader(baseUrl);
    this.store = new Store<SessionState>({
      ...settings,
      ignition: 'off', mode: 'gps', sourceStatus: { kind: 'idle' }, motionQuality: 'waiting',
      audioStatus: 'idle', bankKind: null, audioMessage: null,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    });
    this.telemetry = { motion: this.estimator.sample(Date.now()), drivetrain: this.drivetrain.state, frame: 0 };

    this.audio.setVolume(settings.volume);
    this.audio.onStateChange((s) => {
      if (this.store.get().ignition !== 'on') return;
      this.store.set({ audioStatus: s === 'running' ? 'running' : 'suspended' });
    });
    window.addEventListener('online', () => this.store.set({ online: true }));
    window.addEventListener('offline', () => this.store.set({ online: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.store.get().ignition === 'on') void this.audio.resume().catch(() => undefined);
    });

    // Preload the selected engine's sound before the driver presses START.
    void this.preload(this.profile);
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
      this.store.set({ audioStatus: 'error', audioMessage: 'This browser cannot play Web Audio.' });
      return;
    }
    this.store.set({ ignition: 'starting', audioStatus: 'loading' });
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

  /** Steering-wheel scroll / keys: one gear down (-1) or up (+1) from what the automatic chose. */
  manualShift(direction: -1 | 1): void {
    if (this.store.get().ignition !== 'on') return;
    this.drivetrain.manualShift(direction);
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
      this.store.set({ audioMessage: null });
      return bank;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Engine audio failed to load.';
      this.store.set({ audioMessage: `${msg} Using the built-in placeholder sound.` });
      return buildPlaceholderBank(profile);
    }
  }

  private persist(): void {
    const s = this.store.get();
    saveSettings({
      profileId: s.profileId, volume: s.volume, units: s.units,
      demoScenarioId: s.demoScenarioId, demoNoise: s.demoNoise, demoNoCoordsSpeed: s.demoNoCoordsSpeed, gearing: s.gearing,
      shiftStyle: s.shiftStyle, theme: s.theme,
    });
  }
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef0f3' : '#050507');
}
