import { useEffect, useRef, type RefObject } from 'react';
import type { EngineSession } from '../core/EngineSession.ts';
import { InputController } from '../input/InputController.ts';
import { inputDiagnostics } from '../input/InputDiagnostics.ts';

const inSheet = (t: EventTarget | null) =>
  typeof Element !== 'undefined' && t instanceof Element && t.closest('.sheet-backdrop, .garage') !== null;

/**
 * Drive-screen input: steering-wheel scroll / mouse wheel and arrow / page keys shift manually
 * (down = one gear lower, up = one gear higher than the automatic choice). Built on the typed
 * InputController; with `diagnostics` every raw event is logged for Developer Mode.
 * Input inside an open settings sheet is never captured, so lists there still scroll.
 */
export function useManualShift(
  session: EngineSession,
  enabled: boolean,
  opts: { diagnostics: boolean; trap: RefObject<HTMLDivElement | null>; trapOn: boolean },
): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const controller = useRef<InputController | null>(null);
  const { diagnostics, trap, trapOn } = opts;

  useEffect(() => {
    const c = new InputController({
      onAction: (a) => session.manualShift(a === 'shift-down' ? -1 : 1),
      isDriveEnabled: () => enabledRef.current,
      isBlocked: inSheet,
      diagnostics: diagnostics ? inputDiagnostics : null,
    });
    controller.current = c;
    const off = c.attach(window, document);
    return () => {
      off();
      controller.current = null;
    };
  }, [session, diagnostics]);

  useEffect(() => {
    const el = trap.current;
    const c = controller.current;
    if (!trapOn || !el || !c) return;
    return c.attachScrollTrap(el);
  }, [trapOn, trap, session, diagnostics]);
}
