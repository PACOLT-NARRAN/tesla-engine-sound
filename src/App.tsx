import type { EngineSession } from './core/EngineSession.ts';
import { SessionContext } from './hooks/SessionContext.ts';
import { CockpitPage } from './pages/CockpitPage.tsx';

export function App({ session }: { session: EngineSession }) {
  return (
    <SessionContext.Provider value={session}>
      <CockpitPage />
    </SessionContext.Provider>
  );
}
