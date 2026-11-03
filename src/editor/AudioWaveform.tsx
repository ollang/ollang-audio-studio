import { Play, Pause } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import styles from './editor.module.css';

type Selection = { start: number; end: number; remove: boolean };

/** One visual surface for live input, listening, and non-destructive editing. */
export function AudioWaveform({
  peaks,
  duration,
  position,
  live,
  empty,
  selection,
  curve,
  playing,
  disabled,
  playLabel,
  seekLabel,
  positionLabel,
  onPlay,
  onSeek,
}: {
  peaks: number[];
  duration: number;
  position: number;
  live: boolean;
  empty: boolean;
  selection?: Selection;
  curve?: string;
  playing: boolean;
  disabled: boolean;
  playLabel: string;
  seekLabel: string;
  positionLabel: string;
  onPlay: () => void;
  onSeek: (position: number) => void;
}) {
  const gradientId = useId();
  const peakMax = live ? 1 : Math.max(0.05, ...peaks);
  const x = (time: number) => (time / Math.max(1, duration)) * 1000;
  return (
    <div className={styles.wavePlayer}>
      <div className={styles.liveWave}>
        <div className={styles.wavePlayback}>
          <button
            type="button"
            className={styles.playButton}
            disabled={disabled}
            aria-label={playLabel}
            onClick={onPlay}
          >
            {playing ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" />
            )}
          </button>
        </div>
        <div className={styles.waveSurface}>
          {empty && (
            <div className={styles.waveEmblem} aria-hidden="true">
              <svg width="56" height="56" viewBox="0 0 48 48" fill="currentColor" focusable="false">
                <path d="M24.3 4.7C19.2 4.7 15.8 8.4 15.8 13.1V23C15.8 28 19 31.5 23.8 31.5C28.2 31.5 31.4 28.4 31.8 24.2C27.5 22.8 27.1 19.2 28.7 16C30.3 12.9 31.5 12 31.5 11C30.6 7.1 28 4.7 24.3 4.7Z" />
                <path d="M9.9 19.2C11 19.2 11.8 20 11.8 21.1C11.8 29.3 16.5 34.8 24 34.8C31.7 34.8 36.4 29.1 36.4 21.1C36.4 19.6 37.7 18.2 39.3 17.7C40.3 28.9 34.6 36.9 25.7 38V42C28.3 42.2 30.6 42.6 32.3 43.7C28.1 45.1 20.7 45.1 16.2 43.7C18 42.6 20.2 42.2 22.4 42V38C13.6 37.3 8.2 30.2 8.2 21.1C8.2 20 8.8 19.2 9.9 19.2Z" />
              </svg>
            </div>
          )}
          <svg
            className={styles.wavePlot}
            viewBox="0 0 1000 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#507555" />
                <stop offset="50%" stopColor="#9dbd79" />
                <stop offset="100%" stopColor="#35563b" />
              </linearGradient>
            </defs>
            {selection && (
              <rect
                x={x(selection.start)}
                width={x(selection.end - selection.start)}
                height="120"
                fill={selection.remove ? '#a9456420' : '#59824120'}
              />
            )}
            <line x1="0" x2="1000" y1="60" y2="60" stroke="#50755530" />
            {peaks.map((peak, i) => {
              const time = (i / peaks.length) * duration;
              const excluded =
                selection &&
                (selection.remove
                  ? time >= selection.start && time < selection.end
                  : time < selection.start || time >= selection.end);
              const height = Math.max(3, (peak / peakMax) * 84);
              return (
                <rect
                  key={i}
                  x={(i / peaks.length) * 1000 + 1}
                  y={60 - height / 2}
                  width="3.6"
                  height={height}
                  rx="1.8"
                  fill={
                    empty ? '#426638' : live || time < position ? `url(#${gradientId})` : '#8a9f82'
                  }
                  opacity={empty || excluded ? 0.22 : 1}
                />
              );
            })}
            {curve && (
              <polyline
                points={curve}
                fill="none"
                stroke="#213e2c"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {selection && (
              <>
                <line
                  x1={x(selection.start)}
                  x2={x(selection.start)}
                  y1="0"
                  y2="120"
                  stroke="#426638"
                  strokeWidth="2"
                />
                <line
                  x1={x(selection.end)}
                  x2={x(selection.end)}
                  y1="0"
                  y2="120"
                  stroke="#426638"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>
        </div>
      </div>
      <div
        className={styles.waveScrub}
        data-disabled={disabled}
        style={
          {
            '--seek-progress': `${duration ? Math.min(100, (position / duration) * 100) : 0}%`,
          } as CSSProperties
        }
      >
        <input
          className={styles.waveSeek}
          type="range"
          min="0"
          max={Math.max(1, duration)}
          step="100"
          value={Math.min(position, duration)}
          disabled={disabled}
          aria-label={seekLabel}
          aria-valuetext={positionLabel}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
