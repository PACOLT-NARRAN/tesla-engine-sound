import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { ENGINE_PROFILES } from '../profiles/registry.ts';
import { Sheet } from './Sheet.tsx';

export function EngineSelector({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const running = s.ignition === 'on';

  return (
    <Sheet title="Select engine" onClose={onClose}>
      <p className="sheet-hint">
        {running ? 'Tap an engine to hear it instantly.' : 'Tap to select. Press START ENGINE to hear it.'}
      </p>
      <div className="engine-grid">
        {ENGINE_PROFILES.map((p) => {
          const selected = p.id === s.profileId;
          return (
            <button key={p.id} className={`engine-card ${selected ? 'selected' : ''}`} onClick={() => void session.selectProfile(p.id)}>
              <div className="engine-card-top">
                <span className="badge">{p.category}</span>
                <span className={`badge ${p.audio.converted ? 'badge-real' : 'badge-synth'}`}>
                  {p.audio.converted ? 'REAL AUDIO' : 'SYNTH PREVIEW'}
                </span>
                {selected && <span className="engine-selected">● SELECTED</span>}
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <dl>
                <div><dt>REDLINE</dt><dd>{p.redlineRPM.toLocaleString('en-US')}</dd></div>
                <div><dt>GEARS</dt><dd>{p.gearbox.gearRatios.length}</dd></div>
                <div><dt>BANK</dt><dd>{p.source.soundName}</dd></div>
              </dl>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
