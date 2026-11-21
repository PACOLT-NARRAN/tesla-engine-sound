import type { PointerEvent } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';
import { RevPedal } from './RevPedal.tsx';

/**
 * Driver's control rail on the left edge (within reach of the driver in a left-hand-drive car):
 * ▲ shift up, the REV pedal, ▼ shift down and the A/M gearbox switch. While driving a Tesla the
 * steering-wheel scroll belongs to cruise control, so these touch paddles are the way to shift.
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
    <div className={`driver-rail paddles ${manual ? 'paddles-manual' : ''}`}>
      <button className="paddle paddle-up" disabled={!on} onPointerDown={press(() => session.manualShift(1))} onContextMenu={(e) => e.preventDefault()} aria-label={t('hud.shiftUpAria')}>
        <span aria-hidden="true">▲</span>
        <small>+</small>
      </button>
      <RevPedal />
      <button className="paddle paddle-down" disabled={!on} onPointerDown={press(() => session.manualShift(-1))} onContextMenu={(e) => e.preventDefault()} aria-label={t('hud.shiftDownAria')}>
        <small>−</small>
        <span aria-hidden="true">▼</span>
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
    </div>
  );
}
