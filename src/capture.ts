export type CaptureState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopping';
type Callbacks = {
  state: (state: CaptureState) => void;
  tick: (seconds: number, level: number) => void;
  complete: (blob: Blob) => void;
  error: (code: string) => void;
};

/** Own browser resources separately from React, including late permission resolution. */
export class Capture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private disposed = false;
  private elapsed = 0;
  private started = 0;
  private phase: CaptureState = 'idle';
  constructor(private callbacks: Callbacks) {}
  private change(value: CaptureState) {
    this.phase = value;
    if (!this.disposed) this.callbacks.state(value);
  }
  private duration() {
    return (
      this.elapsed + (this.phase === 'recording' ? (performance.now() - this.started) / 1000 : 0)
    );
  }
  async start(maxSeconds = 120) {
    const limit = Math.max(0, Math.min(120, maxSeconds));
    if (limit < 1) return;
    if (this.phase !== 'idle' || this.disposed) return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      this.callbacks.error('unsupported');
      return;
    }
    const generation = ++this.generation;
    this.change('requesting');
    this.elapsed = 0;
    try {
      this.context = new AudioContext();
      await this.context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (generation !== this.generation || this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (value) => MediaRecorder.isTypeSupported(value),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      const analyser = this.context!.createAnalyser();
      analyser.fftSize = 512;
      this.context!.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstart = () => {
        this.started = performance.now();
        this.change('recording');
      };
      recorder.onpause = () => {
        this.elapsed = this.duration();
        this.change('paused');
      };
      recorder.onresume = () => {
        this.started = performance.now();
        this.change('recording');
      };
      recorder.onerror = () => {
        this.callbacks.error('capture');
        this.stop();
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        this.release();
        this.change('idle');
        if (!this.disposed) {
          if (blob.size) this.callbacks.complete(blob);
          else this.callbacks.error('empty');
        }
      };
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          this.callbacks.error('interrupted');
          this.stop();
        };
      });
      recorder.start(250);
      this.timer = setInterval(() => {
        const seconds = this.duration();
        analyser.getFloatTimeDomainData(samples);
        const level = Math.sqrt(
          samples.reduce((total, value) => total + value * value, 0) / samples.length,
        );
        if (!this.disposed)
          this.callbacks.tick(Math.min(limit, seconds), this.phase === 'recording' ? level : 0);
        if (seconds >= limit) this.stop();
      }, 100);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.release();
      this.change('idle');
      this.callbacks.error(
        error instanceof Error && error.name === 'NotAllowedError' ? 'permission' : 'capture',
      );
    }
  }
  pause() {
    if (this.phase === 'recording') this.recorder?.pause();
  }
  resume() {
    if (this.phase === 'paused') this.recorder?.resume();
  }
  stop() {
    if (this.phase === 'requesting') {
      this.generation++;
      this.release();
      this.change('idle');
      return;
    }
    if (!this.recorder || this.recorder.state === 'inactive' || this.phase === 'stopping') return;
    this.elapsed = this.duration();
    this.change('stopping');
    this.recorder.stop();
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.stop();
    this.release();
  }
  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.recorder = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
