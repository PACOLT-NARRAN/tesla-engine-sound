import { useRef } from 'react';
import { useFrame } from '../hooks/useFrame.ts';
import { useSession } from '../hooks/SessionContext.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';

/** How long a refused shift is shown under the gear (ms). */
const FEEDBACK_MS = 1400;
const REFUSED: Partial<Record<string, MessageKey>> = {
  'over-rev': 'hud.fb.over-rev',
  'would-stall': 'hud.fb.would-stall',
  'at-limit': 'hud.fb.at-limit',
  'out-of-range': 'hud.fb.out-of-range',
  'no-gear': 'hud.fb.no-gear',
  locked: 'hud.fb.locked',
};

export function GearIndicator() {
  const session = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const letter = useRef<HTMLSpanElement>(null);
  const last = useRef<number>(-1);
  const mode = useRef<HTMLElement>(null);
  const lastMode = useRef<string>('');
  const t = useT();

  useFrame((now) => {
    const d = session.telemetry.drivetrain;
    const fb = session.telemetry.lastShift;
    const refusedKey = fb && now - fb.at < FEEDBACK_MS ? REFUSED[fb.outcome] : undefined;
    const off = d.manualOffset;
    const m = refusedKey
      ? t(refusedKey)
      : d.transmission === 'manual'
        ? t('hud.manualMode')
        : off === 0 ? t('hud.auto') : t('hud.autoOffset', { offset: `${off > 0 ? '+' : '−'}${Math.abs(off)}` });
    const state = refusedKey ? 'refused' : d.transmission === 'manual' ? 'manual' : off !== 0 ? 'override' : 'auto';
    if (m + state !== lastMode.current && mode.current && ref.current) {
      mode.current.textContent = m;
      ref.current.dataset.state = state;
      ref.current.dataset.manual = String(state === 'manual' || state === 'override');
      lastMode.current = m + state;
    }
    const g = d.gear;
    if (g === last.current || !ref.current || !letter.current) return;
    const up = g > last.current;
    letter.current.textContent = g === 0 ? 'N' : String(g);
    const el = ref.current;
    el.classList.remove('shift-up', 'shift-down');
    void el.offsetWidth; // restart the CSS animation
    if (last.current > 0 && g > 0) el.classList.add(up ? 'shift-up' : 'shift-down');
    el.dataset.neutral = String(g === 0);
    last.current = g;
  });

  return (
    <div className="gear" ref={ref} data-neutral="true" data-state="auto">
      <small ref={mode}>{t('hud.auto')}</small>
      <span ref={letter}>N</span>
    </div>
  );
}
