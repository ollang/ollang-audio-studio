import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, validCut } from '../src/audio.ts';
import { validateWav } from '../server/wav.ts';

import { fixture } from './helpers.ts';

test('trim exports the selected samples, downmixes stereo, and declares exact duration', () => {
  const left = new Float32Array(48000 * 4);
  left.fill(-0.8, 0, 48000);
  left.fill(0.4, 48000, 48000 * 3);
  left.fill(0.9, 48000 * 3);
  const right = new Float32Array(48000 * 4).fill(0.2);
  const wav = Buffer.from(
    encodeWav(
      {
        sampleRate: 48000,
        length: left.length,
        numberOfChannels: 2,
        getChannelData: (channel) => (channel === 0 ? left : right),
      },
      { start: 1, end: 3 },
    ),
  );
  assert.equal(validateWav(wav), 2);
  assert.equal(wav.readInt16LE(44), Math.round(0.3 * 32767));
  assert.equal(wav.readInt16LE(wav.length - 2), Math.round(0.3 * 32767));
});
test('invalid cuts and forged WAV lengths are rejected', () => {
  for (const cut of [
    { start: -1, end: 2 },
    { start: 2, end: 1 },
    { start: 0, end: 0.5 },
    { start: 0, end: 121 },
    { start: NaN, end: 1 },
  ])
    assert.equal(validCut(cut, 121), false);
  const wav = fixture();
  wav.writeUInt32LE(1, 40);
  assert.throws(() => validateWav(wav), /invalid_audio/);
  assert.throws(() => validateWav(Buffer.from('not audio')), /invalid_audio/);
});
