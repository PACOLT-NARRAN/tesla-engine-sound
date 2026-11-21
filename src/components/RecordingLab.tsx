import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { RecordingAudio } from '../recording/browserAudio.ts';
import {
  ACCEPT_ATTR, LocalRecordingProcessor, MAX_DURATION_S, MAX_FILE_BYTES, MIN_DURATION_S,
  type Note, type ProcessedRecording, type ProcessorState, type Waveform,
} from '../recording/recording.ts';

/**
 * "Upload your engine recording" — LEVEL 1 local prototype. A full-screen layer inside the
 * Sound Studio: pick a file, the browser decodes and measures it, the user previews it.
 * Nothing leaves the device and nothing is saved; closing the screen discards the audio.
 */
export function RecordingLab({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const audio = useMemo(() => new RecordingAudio(), []);
  const [state, setState] = useState<ProcessorState<AudioBuffer>>({ status: 'idle' });
  const processor = useMemo(() => new LocalRecordingProcessor<AudioBuffer>(audio.decode, setState), [audio]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [normalize, setNormalize] = useState(false);
  const [pos, setPos] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const running = s.ignition !== 'off';
  const rec = state.status === 'ready' ? state.recording : null;

  // Release everything when the screen closes.
  useEffect(() => () => {
    processor.discard();
    audio.dispose();
  }, [audio, processor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Playhead.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setPos(audio.position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, audio]);

  // The engine starting stops the preview (the lab is a parked tool).
  useEffect(() => {
    if (running && audio.playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const stop = () => {
    audio.stop();
    setPlaying(false);
    setPos(null);
  };
  const gainDb = (r: ProcessedRecording<AudioBuffer>) => (normalize ? r.analysis.normalizeGainDb : 0);
  const play = async (offsetS = 0) => {
    if (!rec || running) return;
    session.stopPreview();
    await audio.play(rec.handle, { offsetS, loop, gainDb: gainDb(rec), onEnded: () => { setPlaying(false); setPos(null); } });
    setPlaying(true);
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    stop();
    await processor.process(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const discard = () => {
    stop();
    processor.discard();
  };
  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    audio.setLoop(next);
  };
  const toggleNormalize = () => {
    const next = !normalize;
    setNormalize(next);
    if (rec) audio.setGainDb(next ? rec.analysis.normalizeGainDb : 0);
  };

  const db = (v: number) => (Number.isFinite(v) ? `${v > 0.05 ? '+' : ''}${t.num(v, 1, 1)} dBFS` : '−∞ dBFS');
  const mb = (bytes: number) => `${t.num(bytes / (1024 * 1024), 1, 1)} MB`;
  const secs = (v: number) => t('rec.seconds', { s: t.num(v, 1, 1) });
  const busy = state.status === 'reading' || state.status === 'decoding';

  return (
    <div className="rec-lab" role="dialog" aria-modal="true" aria-label={t('rec.title')}>
      <header className="garage-head">
        <button className="btn garage-back" onClick={onClose} aria-label={t('rec.backAria')}>← {t('studio.title')}</button>
        <h2>{t('rec.title')}</h2>
        <span className="tier-badge rec-proto">{t('rec.prototype')}</span>
      </header>

      <div className="studio-body">
        <p className="studio-explain">{t('rec.subtitle')}</p>
        <ul className="rec-facts" aria-label={t('rec.factsAria')}>
          <li>{t('rec.fact.local')}</li>
          <li>{t('rec.fact.notSaved')}</li>
          <li>{t('rec.fact.noAi')}</li>
        </ul>
        {running && <p className="setting-lock">{t('rec.parked')}</p>}

        <section className="studio-section rec-pick">
          <h3>{t('rec.sec.file')}</h3>
          <input
            ref={fileRef} type="file" accept={ACCEPT_ATTR} className="rec-input" id="rec-file" data-action="rec-file"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <label htmlFor="rec-file" className={`btn btn-primary rec-choose ${busy ? 'disabled' : ''}`}>
            {rec ? t('rec.chooseOther') : t('rec.choose')}
          </label>
          <small className="studio-hint">
            {t('rec.limits', { mb: t.num(MAX_FILE_BYTES / (1024 * 1024)), min: MIN_DURATION_S, max: t.num(MAX_DURATION_S / 60) })}
          </small>
          {busy && <p className="rec-status" role="status">{t(state.status === 'reading' ? 'rec.reading' : 'rec.decoding', { name: state.name })}</p>}
          {state.status === 'error' && (
            <p className="studio-msg-error rec-status" role="alert" data-error={state.error}>
              {t(`rec.err.${state.error}` as MessageKey, { name: state.name, mb: t.num(MAX_FILE_BYTES / (1024 * 1024)) })}
            </p>
          )}
        </section>

        {rec && (
          <>
            <section className="studio-section" data-section="preview">
              <h3>{t('rec.sec.preview')}</h3>
              <p className="rec-file-name" title={rec.name}>
                <strong>{rec.name}</strong>
                <span>{[rec.extension.toUpperCase() || rec.type || '—', mb(rec.sizeBytes), secs(rec.analysis.durationS)].join(' · ')}</span>
              </p>
              <WaveformView
                waveform={rec.waveform} theme={s.theme} progress={pos === null ? null : pos / Math.max(0.001, rec.analysis.durationS)}
                label={t('rec.waveformAria')} onSeek={(f) => void play(f * rec.analysis.durationS)} disabled={running}
              />
              <div className="studio-buttons rec-controls">
                <button className={`btn btn-preview ${playing ? 'on' : ''}`} onClick={() => (playing ? stop() : void play())} disabled={running} data-action="rec-play">
                  {playing ? t('rec.stop') : t('rec.play')}
                </button>
                <button className={`btn ${loop ? 'on' : ''}`} aria-pressed={loop} onClick={toggleLoop} data-action="rec-loop">{t('rec.loop')}</button>
                <button className={`btn ${normalize ? 'on' : ''}`} aria-pressed={normalize} onClick={toggleNormalize} data-action="rec-normalize">
                  {t('rec.normalize', { db: `${rec.analysis.normalizeGainDb >= 0 ? '+' : ''}${t.num(rec.analysis.normalizeGainDb, 1, 1)}` })}
                </button>
              </div>
              <small className="studio-hint">{t('rec.seekHint')}</small>
            </section>

            <section className="studio-section" data-section="metadata">
              <h3>{t('rec.sec.metadata')}</h3>
              <dl className="rec-meta">
                <Meta k={t('rec.meta.duration')} v={secs(rec.analysis.durationS)} />
                <Meta k={t('rec.meta.sampleRate')} v={`${t.num(rec.analysis.sampleRate)} Hz`} />
                <Meta k={t('rec.meta.channels')} v={rec.analysis.channelCount === 1 ? t('rec.mono') : rec.analysis.channelCount === 2 ? t('rec.stereo') : String(rec.analysis.channelCount)} />
                <Meta k={t('rec.meta.peak')} v={db(rec.analysis.peakDb)} />
                <Meta k={t('rec.meta.rms')} v={db(rec.analysis.rmsDb)} />
                <Meta k={t('rec.meta.silence')} v={`${t.num(rec.analysis.silenceRatio * 100)} %`} />
                <Meta k={t('rec.meta.clipping')} v={rec.analysis.clippedRuns > 0 ? t('rec.clipRuns', { runs: rec.analysis.clippedRuns }) : t('rec.none')} />
                <Meta k={t('rec.meta.processed')} v={t('rec.inBrowser')} />
              </dl>
              <ul className="rec-notes" data-usable={rec.usable}>
                {rec.notes.map((n) => <NoteLine key={n.code} note={n} />)}
              </ul>
            </section>

            <section className="studio-section" data-section="next">
              <h3>{t('rec.sec.next')}</h3>
              <p className="studio-hint rec-next">{t('rec.nextText')}</p>
              <div className="studio-buttons">
                <button className="btn btn-danger" onClick={discard} data-action="rec-discard">{t('rec.discard')}</button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="rec-meta-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function NoteLine({ note }: { note: Note }) {
  const t = useT();
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(note.params ?? {})) p[k] = t.num(v, k === 's' ? 1 : 0);
  return <li className={`rec-note rec-note-${note.level}`} data-note={note.code}>{t(`rec.note.${note.code}` as MessageKey, p)}</li>;
}

/** Min/max waveform on a canvas; clipped buckets in red; a playhead overlay. */
function WaveformView({ waveform, theme, progress, label, onSeek, disabled }: {
  waveform: Waveform; theme: string; progress: number | null; label: string; onSeek: (fraction: number) => void; disabled: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      const css = getComputedStyle(document.documentElement);
      const wave = css.getPropertyValue('--accent-2').trim() || '#ff7a1a';
      const clip = css.getPropertyValue('--accent').trim() || '#ff3b1f';
      const mid = css.getPropertyValue('--dim').trim() || '#3a3a44';
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = mid;
      ctx.fillRect(0, Math.floor(h / 2), w, Math.max(1, dpr));
      const n = waveform.min.length;
      for (let x = 0; x < w; x++) {
        const b = Math.min(n - 1, Math.floor((x / w) * n));
        const lo = waveform.min[b] ?? 0;
        const hi = waveform.max[b] ?? 0;
        const y1 = ((1 - hi) / 2) * h;
        const y2 = ((1 - lo) / 2) * h;
        ctx.fillStyle = waveform.clipped[b] ? clip : wave;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(canvas);
    return () => ro?.disconnect();
  }, [waveform, theme]);

  return (
    <div className={`rec-wave ${disabled ? 'disabled' : ''}`}>
      <canvas
        ref={ref} role="img" aria-label={label} data-action="rec-wave"
        onClick={(e) => {
          if (disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)));
        }}
      />
      {progress !== null && <span className="rec-playhead" style={{ left: `${Math.min(100, progress * 100)}%` }} />}
    </div>
  );
}
