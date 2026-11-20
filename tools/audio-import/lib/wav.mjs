// Minimal RIFF/WAVE reader/writer (PCM 8/16/24/32-bit int and 32-bit float). No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

/** @returns {{ sampleRate: number, channels: Float32Array[] }} */
export function decodeWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const sampleRate = dv.getUint32(body + 4, true);
      const bits = dv.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels, sampleRate, bits };
    } else if (id === 'data') {
      data = { offset: body, size: Math.min(size, buf.length - body) };
    }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV is missing fmt or data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  if (!(format === 1 || format === 3)) throw new Error(`Unsupported WAV format ${format} (need PCM or float)`);
  const bps = bits / 8;
  const frames = Math.floor(data.size / (bps * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = data.offset + (i * channels + c) * bps;
      let v;
      if (format === 3) v = bits === 64 ? dv.getFloat64(p, true) : dv.getFloat32(p, true);
      else if (bits === 8) v = (buf[p] - 128) / 128;
      else if (bits === 16) v = dv.getInt16(p, true) / 32768;
      else if (bits === 24) v = (((buf[p + 2] << 24) | (buf[p + 1] << 16) | (buf[p] << 8)) >> 8) / 8388608;
      else if (bits === 32) v = dv.getInt32(p, true) / 2147483648;
      else throw new Error(`Unsupported bit depth ${bits}`);
      out[c][i] = v;
    }
  }
  return { sampleRate, channels: out };
}

export function readWav(path) {
  return decodeWav(readFileSync(path));
}

export function toMono({ channels }) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Encode mono float samples as 16-bit PCM WAV. */
export function encodeWav16(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export function writeWav16(path, samples, sampleRate) {
  writeFileSync(path, encodeWav16(samples, sampleRate));
}
