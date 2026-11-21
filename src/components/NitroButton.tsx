import { useEffect, type PointerEvent } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

/** NITRO: hold for the gas purge hiss and vapour jets behind the tachometer. Cosmetic only. */
export function NitroButton() {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const on = s.ignition === 'on';

  useEffect(() => {
    const release = () => session.setNitro(false);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      release();
    };
  }, [session]);

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    session.setNitro(true);
  };
  const up = () => session.setNitro(false);

  return (
    <button
      className="nitro-btn"
      disabled={!on}
      data-held={s.nitro}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t('hud.nitroAria')}
    >
      <span className="nitro-label">NITRO</span>
      <small>{t('hud.hold')}</small>
    </button>
  );
}

const PUFFS = 7;

/** Vapour jets bursting out sideways from behind the tachometer while NITRO is held. */
export function NitroPurge() {
  const s = useSessionState();
  return (
    <div className="nitro-purge" data-on={s.nitro} aria-hidden="true">
      {(['left', 'right'] as const).map((side) => (
        <div key={side} className={`nitro-jet nitro-jet-${side}`}>
          {Array.from({ length: PUFFS }, (_, i) => (
            <span key={i} style={{ animationDelay: `${(-i * 0.62) / PUFFS}s`, top: `${44 + ((i * 37) % 13) - 6}%` }} />
          ))}
          <i className="nitro-core" />
        </div>
      ))}
    </div>
  );
}
