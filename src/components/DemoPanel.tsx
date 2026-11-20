import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { DEMO_SCENARIOS } from '../motion/demoScenarios.ts';
import { Sheet } from './Sheet.tsx';

export function DemoPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const active = s.mode === 'demo' && s.ignition === 'on';

  return (
    <Sheet title="Demo mode" onClose={onClose}>
      <p className="sheet-hint">Simulated driving through the same motion → gearbox → sound pipeline as GPS.</p>
      <div className="scenario-grid">
        {DEMO_SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            className={`scenario ${s.demoScenarioId === sc.id ? 'selected' : ''}`}
            onClick={() => {
              void session.startDemo(sc.id);
              onClose();
            }}
          >
            <h3>{sc.name}</h3>
            <p>{sc.description}</p>
          </button>
        ))}
      </div>
      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={s.demoNoise} onChange={(e) => session.setDemoOptions({ demoNoise: e.target.checked })} />
          <span>Simulate GPS noise</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.demoNoCoordsSpeed} onChange={(e) => session.setDemoOptions({ demoNoCoordsSpeed: e.target.checked })} />
          <span>Simulate missing coords.speed (Haversine fallback)</span>
        </label>
      </div>
      <div className="sheet-actions">
        {active ? (
          <button className="btn btn-primary" onClick={() => { session.stopDemo(); onClose(); }}>STOP DEMO · USE GPS</button>
        ) : (
          <button className="btn btn-primary" onClick={() => { void session.startDemo(); onClose(); }}>START DEMO</button>
        )}
      </div>
    </Sheet>
  );
}
