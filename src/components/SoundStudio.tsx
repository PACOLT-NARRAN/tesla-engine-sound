import { useEffect, useMemo, useState } from 'react';
import { GEARING_FACTOR } from '../core/settings.ts';
import { STUDIO_DRAFT_ID } from '../core/EngineSession.ts';
import { canCreateCustomProfile, canUseCustomGearing } from '../entitlements/entitlements.ts';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/useT.ts';
import { engineTitle } from '../profiles/presentation.ts';
import { ENGINE_PROFILES } from '../profiles/registry.ts';
import {
  CUSTOM_INDUCTIONS, CUSTOM_LAYOUTS, DESCRIPTION_MAX, EXHAUSTS, GEARBOX_TYPES, LAYOUT_CYLINDERS, LIMITS, NAME_MAX,
  RATIO_LIMITS, defaultSpec, duplicateSpec, effectiveRatios, generateRatios, hasSupercharger, hasTurbo, parseDraft,
  parseNumber, speedAtRpm, toDraft, type CustomEngineDraft, type CustomEngineSpec, type CustomLayout, type Issue,
  type IssueField, type NumericField,
} from '../studio/customEngine.ts';
import { msToKmh, msToMph } from '../utils/math.ts';

interface Props {
  /** Engine to edit, or the starting point of a new one. */
  initial: CustomEngineSpec;
  isNew: boolean;
  onClose: () => void;
  /** Called after a successful save (or duplicate) with the saved id. */
  onSaved: (id: string) => void;
}

const BANKS = ENGINE_PROFILES.filter((p) => p.audio.converted);
const BANK_IDS: ReadonlySet<string> = new Set(BANKS.map((p) => p.id));

/**
 * REVLINE Sound Studio: create or edit a custom engine. Full-screen layer inside the Garage
 * (parked use). Everything is validated inline; only a valid engine can be saved or previewed.
 */
export function SoundStudio({ initial, isNew, onClose, onSaved }: Props) {
  const session = useSession();
  const s = useSessionState();
  const t = useT();
  const [draft, setDraft] = useState<CustomEngineDraft>(() => toDraft(initial));
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'lock'; text: string } | null>(null);
  const baseline = useMemo(() => JSON.stringify(toDraft(initial)), [initial]);
  const dirty = JSON.stringify(draft) !== baseline;
  const { spec, issues } = useMemo(() => parseDraft(draft, BANK_IDS), [draft]);
  const canSave = canCreateCustomProfile(s.entitlements);
  const canGearing = canUseCustomGearing(s.entitlements);
  const running = s.ignition !== 'off';
  const previewing = s.preview?.id === STUDIO_DRAFT_ID ? s.preview.status : null;

  // Stop the draft preview when the Studio closes.
  useEffect(() => () => {
    if (session.store.get().preview?.id === STUDIO_DRAFT_ID) session.stopPreview();
  }, [session]);

  const close = () => (dirty ? setConfirm('discard') : onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (confirm) setConfirm(null);
      else if (dirty) setConfirm('discard');
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirm, dirty, onClose]);

  const set = <K extends keyof CustomEngineDraft>(k: K, v: CustomEngineDraft[K]) => {
    setMessage(null);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const setLayout = (layout: CustomLayout) => {
    const allowed = LAYOUT_CYLINDERS[layout];
    setDraft((d) => ({ ...d, layout, cylinders: allowed.includes(parseNumber(d.cylinders)) ? d.cylinders : String(allowed[0]) }));
  };
  const setGearCount = (text: string) => {
    setDraft((d) => {
      const n = parseNumber(text);
      if (!d.ratios || !Number.isInteger(n) || n < LIMITS.gearCount.min || n > LIMITS.gearCount.max) return { ...d, gearCount: text };
      // Keep typed ratios, add generated ones for new gears.
      const gen = generateRatios(n).map((r) => r.toFixed(2));
      return { ...d, gearCount: text, ratios: Array.from({ length: n }, (_, i) => d.ratios?.[i] ?? (gen[i] as string)) };
    });
  };
  /** A forced-induction layer switched on starts audible, not at 0 %. */
  const pickInduction = (induction: CustomEngineDraft['induction']) => {
    setMessage(null);
    setDraft((d) => ({
      ...d, induction,
      turbo: hasTurbo(induction) && parseNumber(d.turbo) === 0 ? '60' : d.turbo,
      supercharger: hasSupercharger(induction) && parseNumber(d.supercharger) === 0 ? '60' : d.supercharger,
    }));
  };
  const setCustomRatios = (on: boolean) => {
    setDraft((d) => {
      if (!on) return { ...d, ratios: null };
      const n = parseNumber(d.gearCount);
      return { ...d, ratios: generateRatios(Number.isFinite(n) ? n : 6).map((r) => r.toFixed(2)) };
    });
  };

  const issueText = (i: Issue): string => {
    const key = `studio.err.${i.code}` as MessageKey;
    const l = (LIMITS as Record<string, (typeof LIMITS)[NumericField]>)[i.field];
    const p: Record<string, string | number> = { ...(i.params ?? {}) };
    if (typeof p.min === 'number') p.min = t.num(p.min, l?.decimals ?? 2);
    if (typeof p.max === 'number' && i.code !== 'tooLong') p.max = t.num(p.max, l?.decimals ?? 2);
    if (i.index !== undefined) p.gear = i.index + 1;
    return t(key, p);
  };
  const errorsOf = (f: IssueField) => issues.filter((i) => i.field === f);
  const showErrors = touched || !isNew;

  const save = async () => {
    setTouched(true);
    if (!canSave) return setMessage({ kind: 'lock', text: t('studio.lockedSave') });
    if (!spec) return setMessage({ kind: 'error', text: t('studio.fixErrors', { count: issues.length }) });
    const r = await session.saveCustomEngine(spec);
    const soundLocked = draft.sound.kind === 'bank' && session.engineLock(draft.sound.bankId) !== null;
    if (r !== 'saved') return setMessage({ kind: r === 'locked' ? 'lock' : 'error', text: r === 'locked' && soundLocked && canSave ? t('studio.soundLocked') : t(`studio.save.${r}`) });
    setMessage({ kind: 'ok', text: t('studio.saved') });
    onSaved(spec.id);
  };
  const duplicate = async () => {
    if (!spec || !canSave) return;
    const copy = duplicateSpec(spec, t('studio.copyName', { name: spec.name }));
    if ((await session.saveCustomEngine(copy)) === 'saved') onSaved(copy.id);
  };
  const preview = () => {
    setTouched(true);
    if (spec) void session.previewDraft(spec);
    else setMessage({ kind: 'error', text: t('studio.fixErrors', { count: issues.length }) });
  };
  const reset = () => {
    setDraft(isNew ? toDraft({ ...defaultSpec(), id: initial.id }) : toDraft(initial));
    setTouched(false);
    setMessage(null);
  };

  // Gear speed table (respects KM/H / MPH and the current virtual gearing).
  const speeds = useMemo(() => {
    const max = parseNumber(draft.maxRPM);
    const fd = parseNumber(draft.finalDrive) * (GEARING_FACTOR[s.gearing] ?? 1);
    const ratios = draft.ratios ? draft.ratios.map(parseNumber) : effectiveRatios({ customRatios: null, gearCount: parseNumber(draft.gearCount) });
    if (!Number.isFinite(max) || !Number.isFinite(fd) || fd <= 0) return [];
    return ratios.map((r) => (Number.isFinite(r) && r > 0 ? Math.round((s.units === 'mph' ? msToMph : msToKmh)(speedAtRpm(max, r, fd))) : null));
  }, [draft.maxRPM, draft.finalDrive, draft.ratios, draft.gearCount, s.gearing, s.units]);
  const unit = s.units === 'mph' ? 'MPH' : 'KM/H';
  const induction = draft.induction;
  const bankName = (id: string) => {
    const p = ENGINE_PROFILES.find((x) => x.id === id);
    return p ? engineTitle(p) : id;
  };

  const num = (f: NumericField, label: MessageKey, unitLabel?: string, opts: { disabled?: boolean; hint?: string } = {}) => (
    <NumberField
      key={f}
      field={f}
      label={t(label)}
      unit={unitLabel}
      value={draft[f]}
      onChange={(v) => (f === 'gearCount' ? setGearCount(v) : set(f, v))}
      errors={showErrors ? errorsOf(f).map(issueText) : []}
      disabled={opts.disabled}
      hint={opts.hint ?? t('studio.range', { min: t.num(LIMITS[f].min, LIMITS[f].decimals), max: t.num(LIMITS[f].max, LIMITS[f].decimals) })}
    />
  );
  const pct = (f: NumericField, label: MessageKey, hint: MessageKey) => (
    <Slider key={f} field={f} label={t(label)} hint={t(hint)} value={draft[f]} onChange={(v) => set(f, v)} />
  );

  return (
    <div className="studio" role="dialog" aria-modal="true" aria-label={t('studio.title')}>
      <header className="garage-head">
        <button className="btn garage-back" onClick={close} aria-label={t('studio.backAria')}>← {t('garage.title')}</button>
        <h2>{t('studio.title')}</h2>
        <span className="garage-count">{isNew ? t('studio.new') : t('studio.editing')}</span>
      </header>

      <div className="studio-body">
        <p className="studio-explain">{t('studio.explain')}</p>
        {running && <p className="setting-lock">{t('studio.parked')}</p>}
        {!canSave && <p className="setting-lock" role="status">{t('studio.lockedSave')}</p>}

        <section className="studio-section">
          <h3>{t('studio.sec.identity')}</h3>
          <TextField label={t('studio.name')} value={draft.name} max={NAME_MAX} placeholder={t('studio.namePlaceholder')}
            onChange={(v) => set('name', v)} errors={showErrors ? errorsOf('name').map(issueText) : []} field="name" />
          <TextField label={t('studio.description')} value={draft.description} max={DESCRIPTION_MAX} placeholder={t('studio.descriptionPlaceholder')}
            onChange={(v) => set('description', v)} errors={showErrors ? errorsOf('description').map(issueText) : []} field="description" multiline />
        </section>

        <section className="studio-section">
          <h3>{t('studio.sec.engine')}</h3>
          <Choice label={t('garage.layout')} value={draft.layout} options={CUSTOM_LAYOUTS.map((l) => ({ id: l, label: t(`layout.${l}`) }))} onPick={setLayout} name="layout" />
          <div className="studio-grid">
            {num('cylinders', draft.layout === 'Rotary' ? 'studio.rotors' : 'garage.spec.cylinders', undefined, {
              disabled: LAYOUT_CYLINDERS[draft.layout].length === 1,
              hint: draft.layout === 'Rotary' ? t('studio.rotorsHint') : t('studio.cylindersHint'),
            })}
            {num('displacementL', 'garage.displacement', t('studio.unit.l'))}
            {num('idleRPM', 'garage.spec.idle', t('studio.unit.rpm'))}
            {num('maxRPM', 'garage.maxRpm', t('studio.unit.rpm'), { hint: t('studio.maxRpmHint', { min: t.num(LIMITS.maxRPM.min), max: t.num(LIMITS.maxRPM.max) }) })}
          </div>
          <Choice label={t('garage.induction')} value={draft.induction} options={CUSTOM_INDUCTIONS.map((i) => ({ id: i, label: t(`induction.${i}`) }))} onPick={pickInduction} name="induction" />
        </section>

        <section className="studio-section">
          <h3>{t('studio.sec.sound')}</h3>
          <label className="studio-field" data-field="sound">
            <span className="studio-label">{t('studio.soundSource')}</span>
            <select
              value={draft.sound.kind === 'bank' ? draft.sound.bankId : 'synth'}
              onChange={(e) => set('sound', e.target.value === 'synth' ? { kind: 'synth' } : { kind: 'bank', bankId: e.target.value })}
            >
              <option value="synth">{t('studio.soundSynth')}</option>
              <optgroup label={t('studio.soundBanks')}>
                {BANKS.map((p) => {
                  const lock = session.engineLock(p.id);
                  return <option key={p.id} value={p.id}>{engineTitle(p)}{lock ? ` · ${t(lock === 'pack' ? 'garage.tier.pack' : 'garage.tier.pro')}` : ''}</option>;
                })}
              </optgroup>
            </select>
            <small className="studio-hint">
              {draft.sound.kind === 'bank' ? t('studio.soundBankHint', { name: bankName(draft.sound.bankId) }) : t('studio.soundSynthHint')}
            </small>
            {draft.sound.kind === 'bank' && session.engineLock(draft.sound.bankId) !== null && <small className="studio-msg-lock">{t('studio.soundLocked')}</small>}
            {showErrors && errorsOf('sound').map((e) => <small key={e.code} className="studio-error">{issueText(e)}</small>)}
          </label>
          <Choice label={t('studio.exhaust')} value={draft.exhaust} options={EXHAUSTS.map((x) => ({ id: x, label: t(`studio.exhaust.${x}`) }))} onPick={(v) => set('exhaust', v)} name="exhaust" />
          <div className="studio-grid">
            {pct('crackle', 'studio.crackle', 'studio.crackleHint')}
            {pct('overrun', 'studio.overrun', 'studio.overrunHint')}
            {hasTurbo(induction) && pct('turbo', 'studio.turbo', 'studio.turboHint')}
            {hasSupercharger(induction) && pct('supercharger', 'studio.supercharger', 'studio.superchargerHint')}
          </div>
        </section>

        <section className="studio-section">
          <h3>{t('studio.sec.gearbox')}</h3>
          <Choice label={t('studio.gearboxType')} value={draft.gearboxType} options={GEARBOX_TYPES.map((g) => ({ id: g, label: t(`studio.gearbox.${g}`) }))} onPick={(v) => set('gearboxType', v)} name="gearboxType" />
          <div className="studio-grid">
            {num('gearCount', 'garage.gears')}
            {num('finalDrive', 'garage.spec.finalDrive', ':1')}
          </div>
          <div className="studio-field">
            <span className="studio-label">{t('garage.spec.ratios')}</span>
            <div className="segmented">
              <button className={draft.ratios ? '' : 'on'} aria-pressed={!draft.ratios} onClick={() => setCustomRatios(false)} data-ratios="auto">{t('studio.ratiosAuto')}</button>
              <button className={draft.ratios ? 'on' : ''} aria-pressed={!!draft.ratios} onClick={() => canGearing && setCustomRatios(true)} disabled={!canGearing} data-ratios="custom">
                {t('studio.ratiosCustom')}{!canGearing && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
              </button>
            </div>
          </div>
          <table className="ratio-table">
            <thead>
              <tr><th>{t('studio.gear')}</th><th>{t('studio.ratio')}</th><th>{t('studio.topSpeed', { unit })}</th></tr>
            </thead>
            <tbody>
              {(draft.ratios ?? effectiveRatios({ customRatios: null, gearCount: parseNumber(draft.gearCount) }).map((r) => r.toFixed(2))).map((r, i) => {
                const errs = showErrors && draft.ratios ? errorsOf('ratios').filter((e) => e.index === i) : [];
                return (
                  <tr key={i} className={errs.length ? 'invalid' : ''}>
                    <th>{i + 1}.</th>
                    <td>
                      {draft.ratios ? (
                        <input
                          className="ratio-input" inputMode="decimal" value={r} aria-label={t('studio.ratioAria', { gear: i + 1 })} aria-invalid={errs.length > 0}
                          onChange={(e) => set('ratios', (draft.ratios ?? []).map((x, j) => (j === i ? e.target.value : x)))}
                        />
                      ) : <span>{t.num(parseNumber(r), 2, 2)}</span>}
                      {errs.map((e) => <small key={e.code} className="studio-error">{issueText(e)}</small>)}
                    </td>
                    <td>{speeds[i] ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {showErrors && errorsOf('ratios').filter((e) => e.index === undefined).map((e) => <small key={e.code} className="studio-error">{issueText(e)}</small>)}
          <small className="studio-hint">
            {t('studio.ratiosHint', { min: t.num(RATIO_LIMITS.min, 2), max: t.num(RATIO_LIMITS.max, 2), step: t.num(RATIO_LIMITS.minStep, 2) })}{' '}
            {t('studio.speedHint', { gearing: t(`settings.gearing.${s.gearing}`) })}
          </small>
        </section>

        <section className="studio-section">
          <h3>{t('studio.sec.response')}</h3>
          <div className="studio-grid">
            <Slider field="throttleResponse" label={t('studio.throttleResponse')} hint={t('studio.throttleResponseHint')} value={draft.throttleResponse} onChange={(v) => set('throttleResponse', v)} />
            {pct('engineBraking', 'studio.engineBraking', 'studio.engineBrakingHint')}
          </div>
          <small className="studio-hint">{t('studio.driveProfileNote')}</small>
        </section>
      </div>

      <footer className="studio-actions">
        {message && <p className={`studio-msg studio-msg-${message.kind}`} role="status">{message.text}</p>}
        {confirm === 'delete' && (
          <div className="data-confirm" role="alertdialog" aria-label={t('studio.confirmDelete', { name: initial.name })}>
            <p>{t('studio.confirmDelete', { name: initial.name })}</p>
            <div className="data-actions">
              <button className="btn btn-danger" onClick={() => { session.deleteCustomEngine(initial.id); onClose(); }}>{t('settings.confirmYes')}</button>
              <button className="btn" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
        {confirm === 'discard' && (
          <div className="data-confirm" role="alertdialog" aria-label={t('studio.confirmDiscard')}>
            <p>{t('studio.confirmDiscard')}</p>
            <div className="data-actions">
              <button className="btn btn-danger" onClick={onClose}>{t('studio.discard')}</button>
              <button className="btn" onClick={() => setConfirm(null)}>{t('studio.keepEditing')}</button>
            </div>
          </div>
        )}
        {confirm === null && (
          <div className="studio-buttons">
            <button className={`btn btn-preview ${previewing ? 'on' : ''}`} onClick={preview} disabled={running} data-action="preview">
              {previewing === 'loading' ? t('garage.previewLoading') : previewing === 'playing' ? t('garage.previewStop') : t('garage.preview')}
            </button>
            <button className="btn" onClick={reset} disabled={!dirty && !touched} data-action="reset">{t('studio.reset')}</button>
            {!isNew && <button className="btn" onClick={() => void duplicate()} disabled={!spec || !canSave} data-action="duplicate">{t('studio.duplicate')}</button>}
            {!isNew && <button className="btn btn-danger" onClick={() => setConfirm('delete')} data-action="delete">{t('studio.delete')}</button>}
            <button className="btn btn-primary studio-save" onClick={() => void save()} data-action="save">
              {t('studio.save')}{!canSave && <span className="tier-badge tier-pro seg-badge">{t('settings.pro')}</span>}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

function NumberField({ field, label, unit, value, onChange, errors, hint, disabled = false }: {
  field: NumericField; label: string; unit?: string | undefined; value: string; onChange: (v: string) => void;
  errors: string[]; hint: string; disabled?: boolean | undefined;
}) {
  const id = `studio-${field}`;
  return (
    <div className={`studio-field ${errors.length ? 'invalid' : ''}`} data-field={field}>
      <label className="studio-label" htmlFor={id}>{label}</label>
      <div className="studio-input">
        <input
          id={id} inputMode={LIMITS[field].decimals ? 'decimal' : 'numeric'} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} aria-invalid={errors.length > 0} aria-describedby={`${id}-hint`} autoComplete="off"
        />
        {unit && <span className="studio-unit">{unit}</span>}
      </div>
      {errors.map((e) => <small key={e} className="studio-error">{e}</small>)}
      <small className="studio-hint" id={`${id}-hint`}>{hint}</small>
    </div>
  );
}

function Slider({ field, label, hint, value, onChange }: { field: NumericField; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const l = LIMITS[field];
  const n = parseNumber(value);
  return (
    <label className="studio-field" data-field={field}>
      <span className="studio-label">{label} <b className="studio-value">{Number.isFinite(n) ? `${n} %` : '—'}</b></span>
      <input type="range" min={l.min} max={l.max} step={l.step} value={Number.isFinite(n) ? n : l.min} onChange={(e) => onChange(e.target.value)} />
      <small className="studio-hint">{hint}</small>
    </label>
  );
}

function TextField({ field, label, value, onChange, errors, max, placeholder, multiline = false }: {
  field: string; label: string; value: string; onChange: (v: string) => void; errors: string[]; max: number; placeholder: string; multiline?: boolean;
}) {
  const id = `studio-${field}`;
  return (
    <div className={`studio-field ${errors.length ? 'invalid' : ''}`} data-field={field}>
      <label className="studio-label" htmlFor={id}>{label} <span className="studio-count">{value.length}/{max}</span></label>
      {multiline
        ? <textarea id={id} value={value} maxLength={max} rows={2} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={errors.length > 0} />
        : <input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={errors.length > 0} autoComplete="off" />}
      {errors.map((e) => <small key={e} className="studio-error">{e}</small>)}
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onPick, name }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; name: string }) {
  return (
    <div className="studio-field" data-field={name}>
      <span className="studio-label">{label}</span>
      <div className="studio-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={`filter-chip ${value === o.id ? 'on' : ''}`} onClick={() => onPick(o.id)} data-value={o.id}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
