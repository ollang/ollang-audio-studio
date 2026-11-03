import {
  gainAt,
  keepRange,
  pieceDuration,
  projectDuration,
  type RecorderProject,
  type VolumePoint,
} from './project';

type PlayingPiece = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  offsetMs: number;
  points: VolumePoint[];
};
export type RecorderPlaybackSelection = {
  operation: 'keep' | 'remove';
  startMs: number;
  endMs: number;
};
type PlaybackRange = { startMs: number; endMs: number; offsetMs: number };

/** Web Audio playback keeps volume edits independent of the device volume. */
export class RecorderEditorPlayer {
  private context: AudioContext | null = null;
  private nodes: PlayingPiece[] = [];
  private anchor = 0;
  private cursor = 0;
  private running = false;
  private starting = false;
  private generation = 0;
  private untilMs = Infinity;
  private selection: RecorderPlaybackSelection | null = null;
  private playback: RecorderProject;
  private ranges: PlaybackRange[];
  constructor(private project: RecorderProject) {
    this.playback = project;
    this.ranges = [{ startMs: 0, endMs: projectDuration(project), offsetMs: 0 }];
  }
  // The audio clock uses a compact preview, while the public playhead stays on
  // the unchanged editor timeline and jumps across anything being excluded.
  private get playbackEnd() {
    return Math.min(this.toPlayback(this.untilMs), projectDuration(this.playback));
  }
  private get playbackPosition() {
    return Math.min(
      this.playbackEnd,
      this.running && this.context
        ? Math.max(this.cursor, (this.context.currentTime - this.anchor) * 1000)
        : this.cursor,
    );
  }
  get position() {
    return this.toTimeline(this.playbackPosition);
  }
  get playing() {
    return this.starting || (this.running && this.playbackPosition < this.playbackEnd);
  }

  private toPlayback(position: number) {
    for (const range of this.ranges)
      if (position < range.endMs) return range.offsetMs + Math.max(0, position - range.startMs);
    return projectDuration(this.playback);
  }
  private toTimeline(position: number) {
    for (const range of this.ranges)
      if (position < range.offsetMs + range.endMs - range.startMs)
        return range.startMs + Math.max(0, position - range.offsetMs);
    return this.ranges.at(-1)?.endMs ?? 0;
  }

  private stopNodes() {
    for (const node of this.nodes) {
      try {
        node.source.stop();
      } catch {
        /* A scheduled source may already have ended. */
      }
      node.source.disconnect();
      node.gain.disconnect();
    }
    this.nodes = [];
  }
  pause() {
    ++this.generation;
    this.cursor = this.playbackPosition;
    this.running = false;
    this.starting = false;
    this.untilMs = Infinity;
    this.stopNodes();
  }
  seek(position: number) {
    const playing = this.playing,
      until = this.untilMs;
    this.pause();
    this.cursor = this.toPlayback(position);
    if (playing && this.cursor < this.toPlayback(until))
      void this.play(this.position, until).catch(() => this.pause());
  }
  skip(deltaMs: number) {
    // Step through audible time so a pending cut cannot trap the back button.
    const target = Math.max(0, Math.min(this.playbackEnd, this.playbackPosition + deltaMs));
    this.seek(this.toTimeline(target));
  }
  private automate(node: PlayingPiece, previousGain?: number) {
    const ctx = this.context!,
      now = ctx.currentTime,
      startsAt = this.anchor + node.offsetMs / 1000;
    const from = Math.max(now, startsAt),
      localMs = Math.max(0, (from - startsAt) * 1000);
    node.gain.gain.cancelScheduledValues(now);
    const smoothing = previousGain !== undefined && startsAt <= now ? 8 : 0;
    node.gain.gain.setValueAtTime(smoothing ? previousGain! : gainAt(node.points, localMs), from);
    if (smoothing)
      node.gain.gain.linearRampToValueAtTime(
        gainAt(node.points, localMs + smoothing),
        from + smoothing / 1000,
      );
    for (const point of node.points)
      if (point.timeMs > localMs + smoothing)
        node.gain.gain.linearRampToValueAtTime(point.gain, startsAt + point.timeMs / 1000);
  }
  setProject(
    project: RecorderProject,
    selection: RecorderPlaybackSelection | null = this.selection,
  ) {
    const duration = projectDuration(project);
    const start = Math.max(0, Math.min(duration, selection?.startMs ?? 0));
    const end = Math.max(start, Math.min(duration, selection?.endMs ?? duration));
    const bounds: [number, number][] = !selection
      ? [[0, duration]]
      : selection.operation === 'keep'
        ? [[start, end]]
        : [
            [0, start],
            [end, duration],
          ];
    let offset = 0;
    const ranges = bounds
      .filter(([from, to]) => to > from)
      .map(([startMs, endMs]) => {
        const range = { startMs, endMs, offsetMs: offset };
        offset += endMs - startMs;
        return range;
      });
    const playback = {
      ...project,
      pieces: selection
        ? ranges.flatMap((range) => keepRange(project, range.startMs, range.endMs))
        : project.pieces,
    };
    const geometry = (value: RecorderProject) =>
      JSON.stringify(value.pieces.map((piece) => [piece.takeId, piece.startMs, piece.endMs]));
    const unchanged =
      geometry(playback) === geometry(this.playback) &&
      JSON.stringify(ranges) === JSON.stringify(this.ranges);
    const playing = this.playing,
      position = this.position,
      playbackPosition = this.playbackPosition,
      until = this.untilMs;
    if (!unchanged || !this.running) this.pause();
    this.project = project;
    this.selection = selection;
    this.playback = playback;
    this.ranges = ranges;
    if (unchanged && this.running) {
      for (const node of this.nodes) {
        let offset = 0;
        for (const piece of playback.pieces) {
          if (Math.abs(offset - node.offsetMs) < 0.001) {
            const previous = gainAt(node.points, playbackPosition - offset);
            node.points = piece.volume;
            this.automate(node, previous);
            break;
          }
          offset += pieceDuration(piece);
        }
      }
    } else {
      this.cursor = this.toPlayback(position);
      if (playing && this.cursor < this.toPlayback(until))
        void this.play(this.position, until).catch(() => this.pause());
    }
  }
  async play(fromMs = this.position, untilMs = Infinity) {
    this.pause();
    const duration = projectDuration(this.playback),
      from = this.toPlayback(fromMs);
    this.cursor = from >= duration ? 0 : from;
    this.untilMs = untilMs;
    if (this.cursor >= this.playbackEnd) return;
    const generation = ++this.generation;
    this.starting = true;
    this.context ??= new AudioContext();
    try {
      await this.context.resume();
    } catch (error) {
      if (generation === this.generation) this.pause();
      throw error;
    }
    if (generation !== this.generation) return;
    this.starting = false;
    this.anchor = this.context.currentTime + 0.015 - this.cursor / 1000;
    let offset = 0;
    for (const piece of this.playback.pieces) {
      const length = pieceDuration(piece),
        localStart = Math.max(0, this.cursor - offset),
        localEnd = Math.min(length, this.playbackEnd - offset);
      if (localStart < localEnd) {
        const source = this.context.createBufferSource(),
          gain = this.context.createGain();
        source.buffer = this.project.takes.find((take) => take.id === piece.takeId)!.buffer;
        source.connect(gain);
        gain.connect(this.context.destination);
        const node = { source, gain, offsetMs: offset, points: piece.volume };
        this.nodes.push(node);
        this.automate(node);
        source.start(
          this.anchor + (offset + localStart) / 1000,
          (piece.startMs + localStart) / 1000,
          (localEnd - localStart) / 1000,
        );
      }
      offset += length;
    }
    this.running = true;
  }
  dispose() {
    this.pause();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
