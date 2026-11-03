import { encodeWav } from '../src/audio.ts';
export function fixture(seconds = 3, value = 0.25): Buffer {
  const data = new Float32Array(48000 * seconds).fill(value);
  return Buffer.from(
    encodeWav(
      { sampleRate: 48000, length: data.length, numberOfChannels: 1, getChannelData: () => data },
      { start: 0, end: seconds },
    ),
  );
}
