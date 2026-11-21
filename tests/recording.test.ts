import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { RECORDING_BACKEND } from '../src/recording/contracts.ts';
import {
  ACCEPT_ATTR, CLIP_RUN, LocalRecordingProcessor, MAX_FILE_BYTES, NORMALIZE_TARGET_DB, PERSISTS_AUDIO, WAVEFORM_BUCKETS,
  analyzeAudio, assess, computeWaveform, displayName, fileExtension, isUsable, validateFile,
  type DecodedAudio, type PickedFile, type ProcessorState,
} from '../src/recording/recording.ts';

const SR = 22050;
const sine = (seconds: number, amp: number, hz = 110, sr = SR): Float32Array => {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return a;
};
const concat = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const mono = (ch: Float32Array, sampleRate = SR): DecodedAudio => ({ sampleRate, channels: [ch] });
const codes = (a: DecodedAudio) => assess(analyzeAudio(a)).map((n) => n.code);

test('file validation: type by extension or audio MIME, size limits, empty files', () => {
  assert.equal(validateFile({ name: 'v8.wav', size: 1000, type: '' }), null);
  assert.equal(validateFile({ name: 'V8.MP3', size: 1000, type: 'audio/mpeg' }), null);
  assert.equal(validateFile({ name: 'clip.m4a', size: 1000, type: 'audio/x-m4a' }), null);
  assert.equal(validateFile({ name: 'voice', size: 1000, type: 'audio/ogg' }), null);
  assert.equal(validateFile({ name: 'notes.txt', size: 1000, type: 'text/plain' }), 'unsupportedType');
  assert.equal(validateFile({ name: 'movie.mp4', size: 1000, type: 'video/mp4' }), 'unsupportedType');
  assert.equal(validateFile({ name: 'fake.txt', size: 1000, type: 'audio/mpeg' }), 'unsupportedType');
  assert.equal(validateFile({ name: 'big.wav', size: MAX_FILE_BYTES + 1, type: 'audio/wav' }), 'tooLarge');
  assert.equal(validateFile({ name: 'ok.wav', size: MAX_FILE_BYTES, type: 'audio/wav' }), null);
  assert.equal(validateFile({ name: 'zero.wav', size: 0, type: 'audio/wav' }), 'empty');
  assert.equal(validateFile({ name: 'nan.wav', size: Number.NaN, type: 'audio/wav' }), 'empty');
  assert.equal(fileExtension('a.b.FLAC'), 'flac');
  assert.equal(fileExtension('noext'), '');
  assert.ok(ACCEPT_ATTR.startsWith('audio/*,') && ACCEPT_ATTR.includes('.wav'));
});

test('file names are cleaned for display', () => {
  assert.equal(displayName('  my\u0000 v8\u0007.wav '), 'my v8.wav');
  assert.equal(displayName(''), '—');
  const long = displayName(`${'x'.repeat(100)}.wav`, 20);
  assert.equal(long.length, 20);
  assert.ok(long.endsWith('…'));
});

test('analysis measures duration, peak, RMS and channels of a clean tone', () => {
  const a = analyzeAudio({ sampleRate: SR, channels: [sine(4, 0.5), sine(4, 0.5)] });
  assert.equal(a.durationS, 4);
  assert.equal(a.channelCount, 2);
  assert.ok(Math.abs(a.peakDb - -6.02) < 0.05, `peak ${a.peakDb}`);
  assert.ok(Math.abs(a.rmsDb - -9.03) < 0.05, `rms ${a.rmsDb}`); // sine RMS = peak − 3 dB
  assert.equal(a.clippedRuns, 0);
  assert.equal(a.silenceRatio, 0);
  assert.ok(Math.abs(a.normalizeGainDb - (NORMALIZE_TARGET_DB + 6.02)) < 0.05);
  assert.deepEqual(codes({ sampleRate: SR, channels: [sine(4, 0.5)] }), ['good']);
});

test('clipping needs consecutive full-scale samples; a single 0 dBFS peak is not clipping', () => {
  const single = sine(3, 0.5);
  single[100] = 1;
  assert.equal(analyzeAudio(mono(single)).clippedRuns, 0);

  const hard = sine(3, 1.6).map((v) => Math.max(-1, Math.min(1, v))); // a squashed tone
  const a = analyzeAudio(mono(hard));
  assert.ok(a.clippedRuns > 100, `runs ${a.clippedRuns}`);
  assert.ok(a.clippedSamples >= a.clippedRuns * CLIP_RUN);
  assert.ok(codes(mono(hard)).includes('clipping'));
  assert.ok(isUsable(assess(a)), 'clipping is a warning, not an error');
});

test('silence detection: ratio, leading and trailing silence', () => {
  const ch = concat(new Float32Array(2 * SR), sine(2, 0.4), new Float32Array(1 * SR));
  const a = analyzeAudio(mono(ch));
  assert.ok(Math.abs(a.leadingSilenceS - 2) <= 0.05, `lead ${a.leadingSilenceS}`);
  assert.ok(Math.abs(a.trailingSilenceS - 1) <= 0.05, `trail ${a.trailingSilenceS}`);
  assert.ok(Math.abs(a.silenceRatio - 0.6) < 0.03, `ratio ${a.silenceRatio}`);
  assert.deepEqual(codes(mono(ch)), ['mostlySilent']);
  assert.deepEqual(codes(mono(concat(new Float32Array(1.5 * SR), sine(4, 0.4)))), ['leadingSilence']);
});

test('blocking problems: too short, too long, silent; warnings: quiet, low sample rate', () => {
  assert.deepEqual(codes(mono(sine(1, 0.5))), ['tooShort']);
  assert.deepEqual(codes(mono(sine(181, 0.5, 50, 1000), 1000)), ['tooLong']); // blocking: no further notes
  assert.deepEqual(codes(mono(new Float32Array(3 * SR))), ['silent']);
  assert.ok(!isUsable(assess(analyzeAudio(mono(sine(1, 0.5))))));
  assert.deepEqual(codes(mono(sine(3, 0.05))), ['quiet']);
  assert.deepEqual(codes(mono(sine(3, 0.5))), ['good']);
  assert.deepEqual(codes({ sampleRate: SR, channels: [sine(3, 0.5)] }), ['good']);
  assert.deepEqual(codes({ sampleRate: 16000, channels: [sine(3, 0.5, 110, 16000)] }), ['lowSampleRate']);
});

test('silent audio gets no normalisation gain; quiet audio gets at most +24 dB', () => {
  assert.equal(analyzeAudio(mono(new Float32Array(SR * 3))).normalizeGainDb, 0);
  assert.equal(analyzeAudio(mono(sine(3, 0.0005))).normalizeGainDb, 24);
});

test('waveform: min/max per bucket, clipped buckets marked, never empty', () => {
  const ch = concat(sine(1, 0.25), new Float32Array(SR), sine(1, 1.5).map((v) => Math.max(-1, Math.min(1, v))));
  const w = computeWaveform(mono(ch), 3);
  assert.equal(w.min.length, 3);
  assert.ok(Math.abs((w.max[0] as number) - 0.25) < 0.01 && Math.abs((w.min[0] as number) + 0.25) < 0.01);
  assert.equal(w.max[1], 0);
  assert.deepEqual([...w.clipped], [0, 0, 1]);
  const empty = computeWaveform({ sampleRate: SR, channels: [] }, 0);
  assert.equal(empty.min.length, 1);
});

const file = (name: string, size = 1000, type = 'audio/wav', fail = false): PickedFile => ({
  name, size, type,
  arrayBuffer: () => (fail ? Promise.reject(new Error('io')) : Promise.resolve(new ArrayBuffer(8))),
});

test('local processor: validate → read → decode → analyse, all in the browser', async () => {
  const seen: string[] = [];
  const p = new LocalRecordingProcessor<string>(async () => ({ audio: mono(sine(3, 0.5)), handle: 'buf' }), (s) => seen.push(s.status));
  const r = await p.process(file('my v8.wav'));
  assert.equal(r.status, 'ready');
  assert.deepEqual(seen, ['reading', 'decoding', 'ready']);
  if (r.status !== 'ready') return;
  assert.equal(r.recording.handle, 'buf');
  assert.equal(r.recording.processedIn, 'browser');
  assert.equal(r.recording.usable, true);
  assert.equal(r.recording.extension, 'wav');
  assert.equal(r.recording.waveform.min.length, WAVEFORM_BUCKETS);
  p.discard();
  assert.equal(p.state.status, 'idle');
});

test('local processor errors: invalid file, unreadable file, undecodable file', async () => {
  const ok = async () => ({ audio: mono(sine(3, 0.5)), handle: 1 });
  const p = new LocalRecordingProcessor<number>(ok);
  assert.deepEqual(await p.process(file('a.txt', 10, 'text/plain')), { status: 'error', name: 'a.txt', error: 'unsupportedType' });
  assert.deepEqual(await p.process(file('a.wav', 10, 'audio/wav', true)), { status: 'error', name: 'a.wav', error: 'readFailed' });
  const bad = new LocalRecordingProcessor<number>(() => Promise.reject(new Error('EncodingError')));
  assert.deepEqual(await bad.process(file('a.wav')), { status: 'error', name: 'a.wav', error: 'decodeFailed' });
});

test('a newer file or DISCARD wins over a decode that is still running', async () => {
  let release: (() => void) | null = null;
  let calls = 0;
  const decode = (): Promise<{ audio: DecodedAudio; handle: string }> => {
    calls++;
    const id = calls === 1 ? 'first' : 'second';
    if (calls === 1) return new Promise((res) => { release = () => res({ audio: mono(sine(3, 0.5)), handle: id }); });
    return Promise.resolve({ audio: mono(sine(3, 0.5)), handle: id });
  };
  const p = new LocalRecordingProcessor<string>(decode);
  const first = p.process(file('one.wav'));
  await new Promise((r) => setTimeout(r, 0));
  const second = await p.process(file('two.wav'));
  (release as unknown as () => void)();
  await first;
  assert.equal(second.status, 'ready');
  assert.equal(p.state.status === 'ready' && p.state.recording.handle, 'second');

  const states: ProcessorState<string>[] = [];
  let hold: (() => void) | null = null;
  const q = new LocalRecordingProcessor<string>(() => new Promise((res) => { hold = () => res({ audio: mono(sine(3, 0.5)), handle: 'x' }); }), (s) => states.push(s));
  const pending = q.process(file('three.wav'));
  await new Promise((r) => setTimeout(r, 0));
  q.discard();
  (hold as unknown as () => void)();
  await pending;
  assert.equal(q.state.status, 'idle');
  assert.equal(states.at(-1)?.status, 'idle');
});

test('nothing is uploaded or persisted: no backend, no storage, no network in the recording module', () => {
  assert.equal(RECORDING_BACKEND, null);
  assert.equal(PERSISTS_AUDIO, false);
  const dir = new URL('../src/recording/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'sendBeacon', 'WebSocket']) {
      assert.ok(!src.includes(banned), `${f} uses ${banned}`);
    }
  }
  const ui = readFileSync(new URL('../src/components/RecordingLab.tsx', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|localStorage|indexedDB/.test(ui));
});

test('recording texts never claim an upload, AI or RPM detection happened', async () => {
  const { en } = await import('../src/i18n/en.ts');
  const { cs } = await import('../src/i18n/cs.ts');
  for (const dict of [en, cs] as Record<string, string>[]) {
    for (const [k, v] of Object.entries(dict)) {
      if (!k.startsWith('rec.')) continue;
      assert.ok(!/(was uploaded|has been uploaded|uploaded to|odesláno na server|nahráno na server|AI analy|detected RPM|rozpoznané otáčky)/i.test(v), `${k}: ${v}`);
    }
  }
  assert.match(en['rec.fact.local'], /nothing is uploaded/);
  assert.match(en['rec.fact.noAi'], /no AI/);
});
