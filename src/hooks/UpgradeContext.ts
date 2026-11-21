import { createContext, useContext } from 'react';

/** Opens the REVLINE PRO / packs screen from anywhere (lock notes, Garage, Settings). */
export interface UpgradeApi {
  /** `packId` opens that pack's detail directly. */
  open: (packId?: string) => void;
  /** Select an engine and drive it in Demo (try before you buy); closes every sheet. */
  tryInDemo: (engineId: string) => void;
}

export const UpgradeContext = createContext<UpgradeApi>({ open: () => undefined, tryInDemo: () => undefined });

export function useUpgrade(): UpgradeApi {
  return useContext(UpgradeContext);
}
