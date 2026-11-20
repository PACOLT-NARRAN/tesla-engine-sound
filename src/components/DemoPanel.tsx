import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { DEMO_SCENARIOS } from '../motion/demoScenarios.ts';
import { useT } from '../i18n/useT.ts';
import { Sheet } from './Sheet.tsx';

export function DemoPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const active = s.mode === 'demo' && s.ignition === 'on';

  return (
    <Sheet title={t('demo.title')} onClose={onClose}>
      <p className="sheet-hint">{t('demo.hint')}</p>
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
            <h3>{t.dyn(`demo.sc.${sc.id}.name`) ?? sc.name}</h3>
            <p>{t.dyn(`demo.sc.${sc.id}.desc`) ?? sc.description}</p>
          </button>
        ))}
      </div>
      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={s.demoNoise} onChange={(e) => session.setDemoOptions({ demoNoise: e.target.checked })} />
          <span>{t('demo.noise')}</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.demoNoCoordsSpeed} onChange={(e) => session.setDemoOptions({ demoNoCoordsSpeed: e.target.checked })} />
          <span>{t('demo.noCoordsSpeed')}</span>
        </label>
      </div>
      <div className="sheet-actions">
        {active ? (
          <button className="btn btn-primary" onClick={() => { session.stopDemo(); onClose(); }}>{t('demo.stop')}</button>
        ) : (
          <button className="btn btn-primary" onClick={() => { void session.startDemo(); onClose(); }}>{t('demo.start')}</button>
        )}
      </div>
    </Sheet>
  );
}
