import type { EngineProfile } from '../types/profile.ts';

/**
 * FREE "basic sound model": the recorded engine and its basic layers stay, the advanced layers
 * are switched off — overrun crackle, blow-off, synthesised turbo whistle and supercharger whine —
 * and the downshift exhaust bark is softened. Pure (unit tested). PRO, and every Demo, play the full model.
 */
export const BASIC_SHIFT_BARK = 0.4;

export function basicSoundModel(p: EngineProfile): EngineProfile {
  return {
    ...p,
    audio: {
      ...p.audio,
      overrunPops: 0,
      blowoff: 0,
      turbo: 0,
      supercharger: 0,
      shiftBark: p.audio.shiftBark * BASIC_SHIFT_BARK,
    },
  };
}
