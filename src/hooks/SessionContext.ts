import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AccountState } from '../backend/account.ts';
import type { EngineSession, SessionState } from '../core/EngineSession.ts';

export const SessionContext = createContext<EngineSession | null>(null);

export function useSession(): EngineSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext missing');
  return s;
}

/** Subscribe to LOW-frequency session state (ignition, mode, statuses). */
export function useSessionState(): SessionState {
  const s = useSession();
  return useSyncExternalStore(s.store.subscribe, s.store.get);
}

/** Subscribe to the optional online account (sign-in state). */
export function useAccount(): AccountState {
  const s = useSession();
  return useSyncExternalStore(s.account.store.subscribe, s.account.store.get);
}
