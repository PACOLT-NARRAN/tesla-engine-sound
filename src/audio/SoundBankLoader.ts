import type { EngineProfile } from '../types/profile.ts';
import { hashString } from '../utils/math.ts';
import { synthesizeEngineLoop, synthesizePop } from './placeholder/synthEngine.ts';
import type { AudioManifest, LoopSample, SoundBank } from './types.ts';

const PLACEHOLDER_RATE = 32000;
const PLACEHOLDER_BANDS = 7;

export class SoundBankError extends Error {}

/**
 * Loads the sound bank for ONE engine profile on demand (never the whole library),
 * and caches decoded buffers in memory so playback survives a lost network connection.
 */
export class SoundBankLoader {
  private readonly cache = new Map<string, Promise<SoundBank>>();
  private decodeCtx: BaseAudioContext | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  /** Decoding can happen before ignition using an OfflineAudioContext (no autoplay restriction). */
  setDecodeContext(ctx: BaseAudioContext): void {
    this.decodeCtx = ctx;
  }

  load(profile: EngineProfile): Promise<SoundBank> {
    let p = this.cache.get(profile.id);
    if (!p) {
      p = (profile.audio.converted ? this.loadConverted(profile) : Promise.resolve(buildPlaceholderBank(profile)));
      p.catch(() => this.cache.delete(profile.id));
      this.cache.set(profile.id, p);
    }
    return p;
  }

  /** Drop banks other than `keepId` to bound memory on the car's browser. */
  evictExcept(keepId: string): void {
    for (const id of this.cache.keys()) if (id !== keepId) this.cache.delete(id);
  }

  private async loadConverted(profile: EngineProfile): Promise<SoundBank> {
    const ctx = this.getDecodeContext();
    const manifestUrl = this.baseUrl + profile.audio.manifest;
    const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    const res = await fetch(manifestUrl, { cache: 'force-cache' });
    if (!res.ok) throw new SoundBankError(`Sound bank for ${profile.name} is missing (${res.status}).`);
    const manifest = (await res.json()) as AudioManifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.bands) || manifest.bands.length === 0) {
      throw new SoundBankError(`Sound bank for ${profile.name} has an unsupported manifest.`);
    }

    const decoded = new Map<string, Promise<AudioBuffer>>();
    const decode = (file: string): Promise<AudioBuffer> => {
      let d = decoded.get(file);
      if (!d) {
        d = fetch(dir + file, { cache: 'force-cache' })
          .then((r) => {
            if (!r.ok) throw new SoundBankError(`Audio file ${file} failed to load (${r.status}).`);
            return r.arrayBuffer();
          })
          .then((buf) => ctx.decodeAudioData(buf))
          .catch((e: unknown) => {
            throw e instanceof SoundBankError ? e : new SoundBankError(`Audio file ${file} could not be decoded by this browser.`);
          });
        decoded.set(file, d);
      }
      return d;
    };
    const loop = async (l: { file: string; loopStart: number; loopEnd: number }): Promise<LoopSample> => {
      const buffer = await decode(l.file);
      const end = l.loopEnd > l.loopStart ? Math.min(l.loopEnd, buffer.duration) : buffer.duration;
      return { buffer, loopStart: Math.max(0, l.loopStart), loopEnd: end };
    };

    const bands = await Promise.all(
      [...manifest.bands].sort((a, b) => a.rpm - b.rpm).map(async (b) => ({ rpm: b.rpm, on: await loop(b.on), off: await loop(b.off) })),
    );
    const pops = manifest.pops?.length
      ? await Promise.all(manifest.pops.map(decode))
      : placeholderPops(profile);
    const blowoff = await Promise.all((manifest.blowoff ?? []).map(decode));
    const startup = manifest.startup ? await decode(manifest.startup) : null;
    const shutdown = manifest.shutdown ? await decode(manifest.shutdown) : null;
    const extras = [...pops, ...blowoff, ...(startup ? [startup] : []), ...(shutdown ? [shutdown] : [])];
    const bytes = [...new Set([...bands.flatMap((b) => [b.on.buffer, b.off.buffer]), ...extras])]
      .reduce((s, b) => s + b.length * b.numberOfChannels * 4, 0);
    return { profileId: profile.id, kind: 'converted', bands, pops, blowoff, startup, shutdown, bytes };
  }

  private getDecodeContext(): BaseAudioContext {
    if (!this.decodeCtx) this.decodeCtx = new OfflineAudioContext(1, 1, 44100);
    return this.decodeCtx;
  }
}

function toBuffer(data: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: data.length, numberOfChannels: 1, sampleRate });
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return buffer;
}

function placeholderPops(profile: EngineProfile): AudioBuffer[] {
  const seed = hashString(profile.id);
  return [0, 1, 2, 3].map((i) => toBuffer(synthesizePop(PLACEHOLDER_RATE, seed + i * 7919), PLACEHOLDER_RATE));
}

/** TODO(placeholder-audio): procedural bank used until the profile's .awc has been converted. */
export function buildPlaceholderBank(profile: EngineProfile): SoundBank {
  const seed = hashString(profile.id);
  const lo = profile.idleRPM;
  const hi = profile.limiterRPM;
  const forced = profile.aspiration === 'supercharged' || profile.aspiration === 'twin-charged'
    ? 'supercharger'
    : profile.aspiration === 'turbo' || profile.aspiration === 'twin-turbo' ? 'turbo' : 'none';
  const bands = [];
  let bytes = 0;
  for (let i = 0; i < PLACEHOLDER_BANDS; i++) {
    const nominal = lo * Math.pow(hi / lo, i / (PLACEHOLDER_BANDS - 1));
    const common = {
      rpm: nominal, cylinders: profile.cylinders, sampleRate: PLACEHOLDER_RATE,
      brightness: profile.audio.placeholderTone.brightness, roughness: profile.audio.placeholderTone.roughness,
      forcedInduction: forced, seed: seed + i * 101,
    } as const;
    const on = synthesizeEngineLoop({ ...common, load: 'on' });
    const off = synthesizeEngineLoop({ ...common, load: 'off', seed: seed + i * 101 + 50 });
    const onBuf = toBuffer(on.data, on.sampleRate);
    const offBuf = toBuffer(off.data, off.sampleRate);
    bytes += (on.data.length + off.data.length) * 4;
    bands.push({
      rpm: on.rpm,
      on: { buffer: onBuf, loopStart: 0, loopEnd: onBuf.duration },
      off: { buffer: offBuf, loopStart: 0, loopEnd: offBuf.duration },
    });
  }
  const pops = placeholderPops(profile);
  return { profileId: profile.id, kind: 'placeholder', bands, pops, blowoff: [], startup: null, shutdown: null, bytes };
}
