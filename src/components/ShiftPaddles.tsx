import type { PointerEvent } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

/**
 * Large touch paddles on the right: ▲ shift up, ▼ shift down, and the A/M gearbox switch.
 * Pointer-down fires immediately (no click delay) and never scrolls the page.
 */
export function ShiftPaddles() {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const on = s.ignition === 'on';
  const manual = s.activeTransmission === 'manual';
  const press = (fn: () => void) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.button !== 0) return;
    fn();
  };

  return (
    <div className={`paddles ${manual ? 'paddles-manual' : ''}`}>
      <button className="paddle paddle-up" disabled={!on} onPointerDown={press(() => session.manualShift(1))} onContextMenu={(e) => e.preventDefault()} aria-label={t('hud.shiftUpAria')}>
        <span aria-hidden="true">▲</span>
        <small>+</small>
      </button>
      <button
        className="paddle-mode"
        onPointerDown={press(() => session.toggleTransmission())}
        aria-label={t('hud.modeAria', { mode: manual ? t('hud.manualMode') : t('hud.auto') })}
        aria-pressed={manual}
        data-mode={manual ? 'M' : 'A'}
      >
        {manual ? 'M' : 'A'}
      </button>
      <button className="paddle paddle-down" disabled={!on} onPointerDown={press(() => session.manualShift(-1))} onContextMenu={(e) => e.preventDefault()} aria-label={t('hud.shiftDownAria')}>
        <small>−</small>
        <span aria-hidden="true">▼</span>
      </button>
    </div>
  );
}
