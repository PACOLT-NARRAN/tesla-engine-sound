import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { PROFILE_ISSUES } from '../profiles/registry.ts';
import { Sheet } from './Sheet.tsx';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const debugHref = `${location.pathname}?debug=1`;

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="settings">
        <div className="setting-row">
          <span>Speed units</span>
          <div className="segmented">
            <button className={s.units === 'kmh' ? 'on' : ''} onClick={() => session.setUnits('kmh')}>KM/H</button>
            <button className={s.units === 'mph' ? 'on' : ''} onClick={() => session.setUnits('mph')}>MPH</button>
          </div>
        </div>
        <div className="setting-row">
          <span>Full revs at</span>
          <div className="segmented">
            <button className={s.gearing === 'fun' ? 'on' : ''} onClick={() => session.setGearing('fun')}>~100 KM/H</button>
            <button className={s.gearing === 'normal' ? 'on' : ''} onClick={() => session.setGearing('normal')}>~130 KM/H</button>
            <button className={s.gearing === 'real' ? 'on' : ''} onClick={() => session.setGearing('real')}>~160 KM/H</button>
          </div>
        </div>
        <div className="setting-row">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => session.setVolume(Number(e.target.value))} />
        </div>
        <div className="setting-row">
          <span>Diagnostics overlay</span>
          <a className="btn" href={debugHref}>OPEN WITH ?debug=1</a>
        </div>
        <div className="setting-note">
          <h3>Privacy</h3>
          <p>Your location is processed only inside this browser tab to estimate speed. It is never stored or sent anywhere.</p>
          <h3>Safety</h3>
          <p>Set up engine and volume before driving. Keep your eyes on the road.</p>
          <h3>Audio</h3>
          <p>
            Engines marked SYNTH PREVIEW use a built-in synthesiser until their original sound bank is converted
            (see docs/AUDIO_PIPELINE.md).
          </p>
          {PROFILE_ISSUES.length > 0 && (
            <>
              <h3>Profile errors</h3>
              {PROFILE_ISSUES.map((i) => <p key={i.file}>{i.file}: {i.message}</p>)}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
