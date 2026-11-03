/** Browser-only, non-destructive voice timeline. Times are milliseconds. */
export const WORKING_MAX_MS = 180_000;
export type VolumePoint = { timeMs: number; gain: number };
export type AudioTake = { id: string; file: File; buffer: AudioBuffer };
export type AudioPiece = { takeId: string; startMs: number; endMs: number; volume: VolumePoint[] };
export type RecorderSource = 'microphone' | 'file';
export type RecorderProject = {
  takes: AudioTake[];
  pieces: AudioPiece[];
  past: AudioPiece[][];
  future: AudioPiece[][];
  source?: RecorderSource;
};
export type RecorderEditSelection = {
  mode: 'cut' | 'volume';
  operation: 'keep' | 'remove';
  startMs: number;
  endMs: number;
};
export type RecordingPeak = { timeMs: number; peak: number };
export const initialEditSelection = (): RecorderEditSelection => ({
  mode: 'cut',
  operation: 'keep',
  startMs: 0,
  endMs: Infinity,
});
export const emptyProject = (): RecorderProject => ({
  takes: [],
  pieces: [],
  past: [],
  future: [],
});
export const pieceDuration = (piece: AudioPiece) => piece.endMs - piece.startMs;
export const projectDuration = (project: Pick<RecorderProject, 'pieces'>) =>
  project.pieces.reduce((sum, piece) => sum + pieceDuration(piece), 0);
export const recordingAllowance = (project: Pick<RecorderProject, 'pieces'>) =>
  Math.max(0, WORKING_MAX_MS - projectDuration(project));

export function gainAt(points: VolumePoint[], timeMs: number): number {
  if (!points.length) return 1;
  if (timeMs <= points[0]!.timeMs) return points[0]!.gain;
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1]!,
      right = points[i]!;
    if (timeMs <= right.timeMs)
      return (
        left.gain +
        ((right.gain - left.gain) * (timeMs - left.timeMs)) /
          Math.max(0.001, right.timeMs - left.timeMs)
      );
  }
  return points[points.length - 1]!.gain;
}

export function slicePiece(piece: AudioPiece, fromMs: number, toMs: number): AudioPiece {
  return {
    ...piece,
    startMs: piece.startMs + fromMs,
    endMs: piece.startMs + toMs,
    volume: [
      { timeMs: 0, gain: gainAt(piece.volume, fromMs) },
      ...piece.volume
        .filter((point) => point.timeMs > fromMs && point.timeMs < toMs)
        .map((point) => ({ ...point, timeMs: point.timeMs - fromMs })),
      { timeMs: toMs - fromMs, gain: gainAt(piece.volume, toMs) },
    ],
  };
}

export function keepRange(project: RecorderProject, startMs: number, endMs: number): AudioPiece[] {
  let offset = 0;
  return project.pieces.flatMap((piece) => {
    const duration = pieceDuration(piece),
      from = Math.max(0, startMs - offset),
      to = Math.min(duration, endMs - offset);
    offset += duration;
    return to > from ? [slicePiece(piece, from, to)] : [];
  });
}
export function removeRange(
  project: RecorderProject,
  startMs: number,
  endMs: number,
): AudioPiece[] {
  return [
    ...keepRange(project, 0, startMs),
    ...keepRange(project, endMs, projectDuration(project)),
  ];
}

export function boundedEditSelection(
  project: RecorderProject,
  selection: RecorderEditSelection,
): RecorderEditSelection {
  const duration = projectDuration(project);
  const startMs = Math.max(0, Math.min(selection.startMs, duration - 100));
  return {
    ...selection,
    startMs,
    endMs: Math.min(duration, Math.max(startMs + 100, selection.endMs)),
  };
}

/** The timer, validation, and export all use the same uncommitted cut preview. */
export function previewProject(
  project: RecorderProject,
  selection: RecorderEditSelection | null,
): RecorderProject {
  if (!selection || selection.mode === 'volume') return project;
  const { operation, startMs, endMs } = boundedEditSelection(project, selection);
  if (operation === 'keep' && startMs === 0 && endMs === projectDuration(project)) return project;
  return {
    ...project,
    pieces:
      operation === 'keep'
        ? keepRange(project, startMs, endMs)
        : removeRange(project, startMs, endMs),
  };
}

/** Only the active tool can own an uncommitted preview. */
export function pendingEditProject(
  project: RecorderProject,
  selection: RecorderEditSelection,
  rangeChanged: boolean,
  volumePreview: RecorderProject | null,
): RecorderProject {
  return selection.mode === 'volume'
    ? (volumePreview ?? project)
    : previewProject(project, rangeChanged ? selection : null);
}

/** Resolve once, so preview adjustments become a single undoable edit. */
export function resolvePendingEdit(
  project: RecorderProject,
  preview: RecorderProject,
  apply: boolean,
): RecorderProject {
  return apply ? commitPieces(project, preview.pieces) : project;
}

/** Volume is attached to the kept audio, so later cuts preserve the curve. */
export function volumeRange(
  project: RecorderProject,
  startMs: number,
  endMs: number,
  startGain: number,
  endGain: number,
): AudioPiece[] {
  const selected = keepRange(project, startMs, endMs);
  const length = endMs - startMs;
  if (length <= 0) return project.pieces;
  let offset = 0;
  const curve = [
    { timeMs: 0, gain: Math.max(0, Math.min(2, startGain)) },
    { timeMs: length, gain: Math.max(0, Math.min(2, endGain)) },
  ];
  const adjusted = selected.map((piece) => {
    const from = offset;
    offset += pieceDuration(piece);
    return {
      ...piece,
      volume: [
        { timeMs: 0, gain: gainAt(curve, from) },
        { timeMs: pieceDuration(piece), gain: gainAt(curve, offset) },
      ],
    };
  });
  return [
    ...keepRange(project, 0, startMs),
    ...adjusted,
    ...keepRange(project, endMs, projectDuration(project)),
  ];
}

export function commitPieces(project: RecorderProject, pieces: AudioPiece[]): RecorderProject {
  if (JSON.stringify(project.pieces) === JSON.stringify(pieces)) return project;
  return { ...project, pieces, past: [...project.past, project.pieces].slice(-40), future: [] };
}
export function appendTake(project: RecorderProject, take: AudioTake): RecorderProject {
  return {
    ...commitPieces(project, [
      ...project.pieces,
      { takeId: take.id, startMs: 0, endMs: take.buffer.duration * 1000, volume: [] },
    ]),
    takes: [...project.takes, take],
  };
}
/** Only microphone takes continue a draft. File imports replace its entire history. */
export function acceptAudioTake(
  project: RecorderProject | null,
  take: AudioTake,
  source: RecorderSource,
): RecorderProject {
  const previous =
    source === 'microphone' && project?.source !== 'file'
      ? (project ?? emptyProject())
      : emptyProject();
  const next = { ...appendTake(previous, take), source };
  return source === 'file' ? { ...next, past: [], future: [] } : next;
}
export function undoProject(project: RecorderProject): RecorderProject {
  const pieces = project.past.at(-1);
  return pieces
    ? {
        ...project,
        pieces,
        past: project.past.slice(0, -1),
        future: [project.pieces, ...project.future],
      }
    : project;
}
export function redoProject(project: RecorderProject): RecorderProject {
  const pieces = project.future[0];
  return pieces
    ? {
        ...project,
        pieces,
        past: [...project.past, project.pieces],
        future: project.future.slice(1),
      }
    : project;
}

/** Small waveform preview; no decoded copies are retained per edit. */
export function projectPeaks(project: RecorderProject, count = 140): number[] {
  const duration = projectDuration(project);
  if (!duration) return Array(count).fill(0);
  return Array.from({ length: count }, (_, index) => {
    const time = ((index + 0.5) / count) * duration;
    let offset = 0;
    for (const piece of project.pieces) {
      const length = pieceDuration(piece);
      if (time < offset + length) {
        const buffer = project.takes.find((take) => take.id === piece.takeId)!.buffer;
        const data = buffer.getChannelData(0),
          center = Math.floor(((piece.startMs + time - offset) / 1000) * buffer.sampleRate);
        let peak = 0;
        const radius = Math.min(2048, (duration / count / 2000) * buffer.sampleRate);
        for (let n = -radius; n < radius; n += Math.max(1, radius / 32))
          peak = Math.max(
            peak,
            Math.abs(data[Math.max(0, Math.min(data.length - 1, Math.floor(center + n)))] ?? 0),
          );
        return peak;
      }
      offset += length;
    }
    return 0;
  });
}

/** Fit the saved clip and the entire new take onto one growing waveform. */
export function appendRecordingPeaks(
  saved: number[],
  savedMs: number,
  incoming: RecordingPeak[],
  elapsedMs: number,
  count = 140,
): number[] {
  const result = Array<number>(count).fill(0),
    duration = savedMs + elapsedMs;
  if (duration <= 0) return result;
  const paint = (from: number, to: number, peak: number) => {
    if (to <= from) return;
    const first = Math.max(0, Math.floor((from / duration) * count + 1e-9));
    const last = Math.min(count, Math.ceil((to / duration) * count - 1e-9));
    for (let index = first; index < last; index++)
      result[index] = Math.max(result[index] ?? 0, peak);
  };
  const scale = Math.max(0.05, ...saved);
  saved.forEach((peak, index) =>
    paint((index / saved.length) * savedMs, ((index + 1) / saved.length) * savedMs, peak / scale),
  );
  let previous = 0,
    lastPeak = 0;
  for (const sample of incoming) {
    const until = Math.min(elapsedMs, Math.max(previous, sample.timeMs));
    lastPeak = Math.max(0, Math.min(1, sample.peak));
    paint(savedMs + previous, savedMs + until, lastPeak);
    previous = until;
    if (until >= elapsedMs) break;
  }
  paint(savedMs + previous, duration, lastPeak);
  return result;
}

/** Export the actual edited mono mix locally. Originals remain in the project. */
export function projectWav(project: RecorderProject, rate = 48_000): Blob {
  const frames = Math.round((projectDuration(project) / 1000) * rate);
  const bytes = new ArrayBuffer(44 + frames * 2),
    view = new DataView(bytes);
  const text = (at: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  let offsetMs = 0;
  for (const piece of project.pieces) {
    const buffer = project.takes.find((take) => take.id === piece.takeId)!.buffer;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
      buffer.getChannelData(index),
    );
    const from = Math.round((offsetMs / 1000) * rate),
      to = Math.round(((offsetMs + pieceDuration(piece)) / 1000) * rate);
    for (let frame = from; frame < Math.min(to, frames); frame++) {
      const localMs = ((frame - from) / rate) * 1000,
        sourceFrame = ((piece.startMs + localMs) / 1000) * buffer.sampleRate;
      const low = Math.min(Math.floor(sourceFrame), buffer.length - 1),
        high = Math.min(low + 1, buffer.length - 1),
        mix = sourceFrame - low;
      const value =
        (channels.reduce(
          (sum, data) => sum + (data[low] ?? 0) * (1 - mix) + (data[high] ?? 0) * mix,
          0,
        ) /
          channels.length) *
        gainAt(piece.volume, localMs);
      view.setInt16(
        44 + frame * 2,
        Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)),
        true,
      );
    }
    offsetMs += pieceDuration(piece);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
