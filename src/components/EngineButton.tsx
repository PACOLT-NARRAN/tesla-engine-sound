import { useEffect, useRef, useState } from 'react';
import { useSession } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

/** Hold this long on ENGINE to jump to a random engine. */
export const RANDOM_HOLD_MS = 2000;

/**
 * Dock ENGINE button. Tap: open the Garage. Hold 2 s: random engine (one the user may drive).
 * A fill bar shows the hold progress; the new engine name flashes when it switches.
 */
export function EngineButton({ profileName, onOpen }: { profileName: string; onOpen: () => void }) {
  const session = useSession();
  const t = useT();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'none' | null>(null);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => () => cancel(), []);
  useEffect(() => {
    if (flash === null) return;
    const id = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(id);
  }, [flash]);

  const down = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button > 0) return;
    fired.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      fired.current = true;
      setHolding(false);
      void session.selectRandomEngine().then((id) => setFlash(id ? 'ok' : 'none'));
    }, RANDOM_HOLD_MS);
  };

  return (
    <button
      className={`dock-btn engine-btn ${holding ? 'holding' : ''} ${flash ? `flash-${flash}` : ''}`}
      onPointerDown={down}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return; // the hold already did its job; do not also open the Garage
        }
        onOpen();
      }}
      title={t('dock.engineHoldHint')}
      data-testid="engine-btn"
    >
      <span className="engine-hold-bar" aria-hidden="true" />
      <small>{flash === 'ok' ? t('dock.engineRandom') : flash === 'none' ? t('dock.engineRandomNone') : t('dock.engine')}</small>
      <span>{profileName}</span>
    </button>
  );
}
