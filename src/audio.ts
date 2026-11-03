import { MAX_AUDIO_SECONDS } from '../shared/contracts';

export type Pcm = {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
};
export type Cut = { start: number; end: number };
export function validCut(cut: Cut, duration: number): boolean {
  return (
    Number.isFinite(cut.start) &&
    Number.isFinite(cut.end) &&
    cut.start >= 0 &&
    cut.end <= duration + 0.001 &&
    cut.end - cut.start >= 1 &&
    cut.end - cut.start <= MAX_AUDIO_SECONDS
  );
}
/** One canonical 48 kHz mono PCM export is used by preview, upload and detection. */
export function encodeWav(buffer: Pcm, cut: Cut): ArrayBuffer {
  if (!validCut(cut, buffer.length / buffer.sampleRate)) throw new Error('invalid_cut');
  const count = Math.round((cut.end - cut.start) * 48000);
  const result = new ArrayBuffer(44 + count * 2);
  const view = new DataView(result);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, result.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  for (let index = 0; index < count; index++) {
    const at = (cut.start + index / 48000) * buffer.sampleRate;
    const low = Math.min(buffer.length - 1, Math.floor(at));
    const high = Math.min(buffer.length - 1, low + 1);
    const fraction = at - low;
    const sum = channels.reduce(
      (total, channel) =>
        total + (channel[low] ?? 0) * (1 - fraction) + (channel[high] ?? 0) * fraction,
      0,
    );
    const value = Math.max(-1, Math.min(1, sum / channels.length));
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return result;
}
export function peaks(buffer: Pcm, count = 96): number[] {
  const channel = buffer.getChannelData(0);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * buffer.length);
    const end = Math.floor(((index + 1) / count) * buffer.length);
    let peak = 0;
    for (let at = start; at < end; at += Math.max(1, Math.floor((end - start) / 80)))
      peak = Math.max(peak, Math.abs(channel[at] ?? 0));
    return peak;
  });
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
export async function decodeFile(file: Blob, recording = false): Promise<AudioBuffer> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('file_size');
  // Decode into the export clock, not the output device clock. Resampling an
  // already-canonical WAV through 44.1 kHz can lose a frame on some browsers.
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration < 1 || (!recording && audio.duration > MAX_AUDIO_SECONDS))
      throw new Error('duration');
    if (recording && audio.duration > MAX_AUDIO_SECONDS) {
      // MediaRecorder can add a codec tail or dispatch its stop event late.
      const trimmed = context.createBuffer(
        audio.numberOfChannels,
        MAX_AUDIO_SECONDS * audio.sampleRate,
        audio.sampleRate,
      );
      for (let channel = 0; channel < audio.numberOfChannels; channel++)
        trimmed.copyToChannel(audio.getChannelData(channel).subarray(0, trimmed.length), channel);
      return trimmed;
    }
    return audio;
  } finally {
    await context.close();
  }
}
