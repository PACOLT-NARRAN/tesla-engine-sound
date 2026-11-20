import { useEffect, useState } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { formatEntry, inputDiagnostics } from '../input/InputDiagnostics.ts';

const SHOWN = 40;

/** Re-renders at most once per animation frame while events arrive. */
function useInputLogVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const off = inputDiagnostics.subscribe(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setV((x) => x + 1);
      });
    });
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return v;
}

/**
 * Developer Mode → Input diagnostics. Shows what the browser receives from the steering-wheel
 * scroll button, keys and touch, and what each event was turned into. English only.
 */
export function InputDiagnosticsSection() {
  useInputLogVersion();
  const session = useSession();
  const s = useSessionState();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const sum = inputDiagnostics.summary();
  const rows = inputDiagnostics.list().slice(-SHOWN).reverse();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inputDiagnostics.toText());
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  return (
    <section className="input-diag" aria-label="Input diagnostics">
      <h3>Input diagnostics</h3>
      <p className="sheet-hint">
        Close this panel, turn the ignition on, roll the steering-wheel scroll button up and down on the Drive screen, then open this panel again.
        The overlay line “input” shows the last event live.
      </p>
      <div className={`input-status ${sum.wheelLike > 0 ? 'ok' : 'warn'}`} role="status">
        {sum.wheelLike > 0
          ? `Wheel input detected: ${sum.wheelLike} event(s), ${sum.applied} shift(s) applied.`
          : 'No compatible wheel event detected.'}
      </div>
      <table className="dev-table">
        <tbody>
          <tr><th>events</th><td>{sum.total} (wheel {sum.byKind.wheel}, scroll {sum.byKind.scroll}, keydown {sum.byKind.keydown}, keyup {sum.byKind.keyup}, pointer {sum.byKind.pointerdown}, focus/blur {sum.byKind.focus + sum.byKind.blur})</td></tr>
          <tr><th>last input</th><td>{sum.last ? formatEntry(sum.last) : '—'}</td></tr>
          <tr><th>drive input</th><td>{s.ignition === 'on' ? 'active on the Drive screen (not while a panel is open)' : 'off — ignition is off'}</td></tr>
        </tbody>
      </table>
      <label className="toggle">
        <input type="checkbox" checked={s.scrollTrap} onChange={(e) => session.setScrollTrap(e.target.checked)} />
        Scroll trap (experimental): also turn native page scrolling into shifts. Try this if the wheel scrolls but no “wheel” events appear.
      </label>
      <div className="data-actions">
        <button className="btn" onClick={() => inputDiagnostics.clear()}>CLEAR LOG</button>
        <button className="btn" onClick={() => void copy()}>COPY LOG</button>
      </div>
      {copied && <p role="status">{copied === 'ok' ? 'Log copied to clipboard.' : 'Clipboard not available in this browser.'}</p>}
      <ol className="input-log" aria-label={`Last ${SHOWN} input events, newest first`}>
        {rows.length === 0 ? <li>No events yet.</li> : rows.map((e) => <li key={e.id} className={e.outcome === 'applied' ? 'applied' : undefined}>{formatEntry(e)}</li>)}
      </ol>
    </section>
  );
}
