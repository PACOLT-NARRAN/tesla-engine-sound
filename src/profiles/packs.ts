import type { LocalizedText } from '../types/catalog.ts';

/** A premium engine pack (sold separately in a later phase). Engines join a pack via `packId` in catalog.ts. */
export interface EnginePack {
  readonly id: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
}

/** No packs are published yet; the Garage already shows PACK badges and a Premium Packs filter. */
export const ENGINE_PACKS: readonly EnginePack[] = [];

export function getPack(id: string | null, packs: readonly EnginePack[] = ENGINE_PACKS): EnginePack | undefined {
  return id === null ? undefined : packs.find((p) => p.id === id);
}
