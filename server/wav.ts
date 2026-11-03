import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '../shared/contracts.ts';

/** Accept the browser's canonical PCM export, not arbitrary media/network containers. */
export function validateWav(data: Buffer): number {
  if (data.length < 46 || data.length > MAX_AUDIO_BYTES) throw new Error('invalid_audio');
  const text = (start: number, end: number) => data.toString('ascii', start, end);
  if (
    text(0, 4) !== 'RIFF' ||
    text(8, 12) !== 'WAVE' ||
    text(12, 16) !== 'fmt ' ||
    data.readUInt32LE(16) !== 16 ||
    data.readUInt16LE(20) !== 1 ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== 48000 ||
    data.readUInt32LE(28) !== 96000 ||
    data.readUInt16LE(32) !== 2 ||
    data.readUInt16LE(34) !== 16 ||
    text(36, 40) !== 'data' ||
    data.readUInt32LE(4) !== data.length - 8 ||
    data.readUInt32LE(40) !== data.length - 44 ||
    (data.length - 44) % 2 !== 0
  )
    throw new Error('invalid_audio');
  const seconds = (data.length - 44) / 96000;
  if (seconds < 1 || seconds > MAX_AUDIO_SECONDS) throw new Error('invalid_duration');
  return seconds;
}
