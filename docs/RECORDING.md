# Your engine recording (local prototype)

**Sound Studio → Sound → YOUR ENGINE RECORDING → TRY IT.** This is LEVEL 1 of spec section H:
pick an audio file, the browser checks and measures it, and you can listen to it.

## What it does

| Step | Where | Notes |
|---|---|---|
| Choose a file | `<input type="file">` | WAV, MP3, M4A, AAC, OGG, OPUS, FLAC or WEBM; up to 20 MB |
| Validate | `validateFile()` | empty file, too large, not audio. Checked before anything is read |
| Decode | `RecordingAudio.decode` (Web Audio `decodeAudioData`) | Which codecs work depends on the browser. A failure says so and suggests WAV or MP3 |
| Measure | `analyzeAudio()` | duration, sample rate, channels, peak, RMS, silence (50 ms frames below −50 dBFS), clipping (3+ consecutive full-scale samples), leading/trailing silence |
| Assess | `assess()` | errors: shorter than 2 s, longer than 3 min, silent. Warnings: clipping, very quiet, mostly silent, leading silence, low sample rate |
| Waveform | `computeWaveform()` | 720 min/max buckets drawn on a canvas; clipped parts in red |
| Preview | `RecordingAudio.play` | play / stop, loop, tap the waveform to play from there, NORMALISE (peak to −1 dBFS, max +24 dB; preview volume only) |
| Discard | DISCARD RECORDING, closing the screen, page unload | The processor drops its result and the AudioContext is closed |

Picking a second file while the first one is still decoding is safe: the processor ignores the
older result (stale-token check).

## What it does not do

- **Nothing is uploaded.** The module has no network code (a test checks for `fetch`,
  `XMLHttpRequest`, `sendBeacon`, `WebSocket`).
- **Nothing is saved.** No localStorage and no IndexedDB (also checked by a test).
- **No AI and no RPM detection.** Only the plain measurements above. The texts say so.
- The recording does not yet become an engine sound.

## IndexedDB decision

Not used in this phase. Nothing uses the recording after the screen closes, so storing
megabytes of audio would bring no benefit and would add privacy questions. IndexedDB comes
with LEVEL 2, when a recording can become a playable engine sound. It will then get its own
small service next to `storage.ts` (settings stay in localStorage), included in
**RESET ALL LOCAL DATA**.

## Later levels

- **LEVEL 2, local analysis:** loop regions, low/high load segments, a seamless-loop preview,
  trimming using the measured leading/trailing silence. RPM estimates only with testable
  evidence, labelled as estimates.
- **LEVEL 3, backend:** `src/recording/contracts.ts` defines upload authorisation, processing
  jobs (queued → validating → transcoding → analysing → segmenting → building-profile), retry,
  deletion and retention. `RECORDING_BACKEND` is `null` in this build.
- **LEVEL 4, paid feature:** account, entitlement and authorisation verified by the backend,
  size and rate limits, abuse protection, deletion controls, a privacy notice. The frontend never
  fakes this.

## Plan

The prototype is free for everyone. A future paid version would be decided by the backend
(see MONETIZATION.md).

## Files

- `src/recording/recording.ts` (pure, tested in `tests/recording.test.ts`)
- `src/recording/browserAudio.ts`
- `src/recording/contracts.ts`
- `src/components/RecordingLab.tsx`, entry in `SoundStudio.tsx`
- texts `rec.*` in `src/i18n/en.ts` and `cs.ts`; styles in the Phase 8 section of `cockpit.css`
