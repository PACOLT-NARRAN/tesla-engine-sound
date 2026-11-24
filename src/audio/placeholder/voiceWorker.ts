/// <reference lib="webworker" />
/**
 * Renders REVLINE voice banks off the main thread, so selecting a fun-pack engine never freezes
 * the HUD while driving. Message in: { req, voice, idle, limiter, sampleRate, bands }.
 * Message out: { req, bands: RenderedBand[] } or { req, error }.
 */
import { renderVoiceBands } from './voiceSynth.ts';
import { getVoice } from './voices.ts';

interface Req { req: number; voice: string; idle: number; limiter: number; sampleRate: number; bands: number }

const scope = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };

scope.onmessage = (e) => {
  const { req, voice, idle, limiter, sampleRate, bands } = e.data;
  const recipe = getVoice(voice);
  if (!recipe) {
    scope.postMessage({ req, error: `unknown voice ${voice}` });
    return;
  }
  try {
    const out = renderVoiceBands(recipe, voice, idle, limiter, sampleRate, bands);
    scope.postMessage({ req, bands: out }, out.flatMap((b) => [b.on.buffer as ArrayBuffer, b.off.buffer as ArrayBuffer]));
  } catch (err) {
    scope.postMessage({ req, error: err instanceof Error ? err.message : String(err) });
  }
};
