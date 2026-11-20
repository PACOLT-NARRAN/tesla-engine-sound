import { useEffect, useRef, type PointerEvent } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useFrame } from '../hooks/useFrame.ts';
import { useT } from '../i18n/useT.ts';

/**
 * Large hold-to-rev pedal on the driver's (left) side. While pressed the clutch is in and the
 * engine climbs toward the limiter; releasing it lets the revs fall with exhaust crackle.
 */
export function RevPedal() {
  const session = useSession();
  const s = useSessionState();
  const ref = useRef<HTMLButtonElement>(null);
  const on = s.ignition === 'on';
  const t = useT();

  useEffect(() => {
    const release = () => session.setRevPedal(false);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [session]);

  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const held = session.telemetry.drivetrain.revPedal;
    if ((el.dataset.held === 'true') !== held) el.dataset.held = String(held);
  });

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    session.setRevPedal(true);
  };
  const up = () => session.setRevPedal(false);

  return (
    <button
      ref={ref}
      className="rev-pedal"
      disabled={!on}
      data-held="false"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t('hud.revAria')}
    >
      <span className="rev-pedal-grip" />
      <span className="rev-pedal-label">{t('hud.rev')}</span>
      <small>{t('hud.hold')}</small>
    </button>
  );
}
