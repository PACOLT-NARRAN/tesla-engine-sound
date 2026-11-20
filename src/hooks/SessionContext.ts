import { createContext, useContext, useSyncExternalStore } from 'react';
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
