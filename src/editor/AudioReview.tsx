import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Crop, Scissors, Volume2 } from 'lucide-react';
import { formatTime } from '../audio';
const recorderClock = (ms: number) => formatTime(ms / 1000);
import {
  appendRecordingPeaks,
  commitPieces,
  emptyProject,
  gainAt,
  keepRange,
  pieceDuration,
  projectDuration,
  projectPeaks,
  removeRange,
  volumeRange,
  type RecorderEditSelection,
  type RecorderProject,
  type RecordingPeak,
} from './project';
import { RecorderEditorPlayer } from './player';
import { AudioWaveform } from './AudioWaveform';
import { t, type MessageKey } from '../i18n';
import styles from './editor.module.css';

const preciseClock = (ms: number) => `${recorderClock(ms)}.${Math.floor((ms % 1000) / 100)}`;
function timelineGain(project: RecorderProject, time: number) {
  let offset = 0;
  for (const piece of project.pieces) {
    if (time <= offset + pieceDuration(piece)) return gainAt(piece.volume, time - offset);
    offset += pieceDuration(piece);
  }
  return 1;
}

export function AudioReview({
  project,
  visible,
  editing,
  onToggleEdit,
  selection,
  onSelectionChange,
  clipDuration,
  pendingCut,
  onToolChange,
  onVolumePreview,
  live,
  recording,
  elapsed,
  bars,
  statusKey,
  disabled,
  resetControl,
  onChange,
  onError,
}: {
  project: RecorderProject;
  visible: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  selection: RecorderEditSelection;
  onSelectionChange: (selection: RecorderEditSelection) => void;
  clipDuration: number;
  pendingCut: boolean;
  onToolChange: (
    mode: RecorderEditSelection['mode'],
    operation: RecorderEditSelection['operation'],
  ) => void;
  onVolumePreview: (project: RecorderProject) => void;
  live: boolean;
  recording: boolean;
  elapsed: number;
  bars: RecordingPeak[];
  statusKey: MessageKey;
  disabled: boolean;
  resetControl: ReactNode;
  onChange: (project: RecorderProject) => void;
  onError: (key: MessageKey) => void;
}) {
  const controlsId = useId();
  const duration = projectDuration(project);
  const player = useMemo(() => new RecorderEditorPlayer(emptyProject()), []);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const { mode, operation, startMs: start, endMs: end } = selection;
  const [volumeStyle, setVolumeStyle] = useState<'steady' | 'gradual'>('steady');
  const [announcement, setAnnouncement] = useState('');
  const volumeBase = useRef<RecorderProject | null>(null);
  const emptyPreview = editing && pendingCut && mode === 'cut' && clipDuration <= 0;
  const waveDuration = duration + (live ? elapsed : 0);
  const displayedTime = editing ? preciseClock(clipDuration) : recorderClock(waveDuration);
  const peaks = useMemo(() => projectPeaks(project), [project]);
  const livePeaks = useMemo(
    () => (live ? appendRecordingPeaks(peaks, duration, bars, elapsed) : peaks),
    [live, peaks, duration, bars, elapsed],
  );
  const startGain = timelineGain(project, start + 0.001),
    endGain = timelineGain(project, end - 0.001);
  const steadyVolume = keepRange(project, start, end).every((piece) =>
    piece.volume.length
      ? piece.volume.every((point) => Math.abs(point.gain - startGain) < 0.0001)
      : Math.abs(startGain - 1) < 0.0001,
  );
  const gradualVolume = volumeStyle === 'gradual' || !steadyVolume;
  const curve = useMemo(() => {
    let offset = 0;
    const values: string[] = [];
    for (const piece of project.pieces) {
      const length = pieceDuration(piece);
      const points = piece.volume.length
        ? piece.volume
        : [
            { timeMs: 0, gain: 1 },
            { timeMs: length, gain: 1 },
          ];
      for (const point of points)
        values.push(
          `${((offset + point.timeMs) / Math.max(1, duration)) * 1000},${100 - point.gain * 42}`,
        );
      offset += length;
    }
    return values.join(' ');
  }, [project, duration]);

  useEffect(() => {
    player.setProject(
      project,
      editing && pendingCut && mode === 'cut' ? { operation, startMs: start, endMs: end } : null,
    );
  }, [project, player, editing, pendingCut, mode, operation, start, end]);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    if (!visible) player.pause();
    const hide = () => {
      if (document.hidden) player.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [visible, player]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      setPosition(player.position);
      if (!player.playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, player]);

  async function play() {
    if (disabled || !duration) return;
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        await player.play(position);
        setPosition(player.position);
        setPlaying(player.playing);
      }
    } catch {
      onError('errorPlayback');
    }
  }
  function adjustRange(edge: 'start' | 'end', value: number) {
    volumeBase.current = null;
    onSelectionChange({
      ...selection,
      startMs: edge === 'start' ? Math.min(value, end - 100) : start,
      endMs: edge === 'end' ? Math.max(value, start + 100) : end,
    });
    setAnnouncement('');
  }
  function changeVolume(from: number, to: number) {
    const baseline = volumeBase.current ?? project;
    volumeBase.current = baseline;
    onVolumePreview({ ...baseline, pieces: volumeRange(baseline, start, end, from, to) });
  }
  function preset(from: number, to: number) {
    volumeBase.current = null;
    changeVolume(from, to);
    volumeBase.current = null;
  }
  function chooseVolumeStyle(style: 'steady' | 'gradual') {
    setVolumeStyle(style);
    volumeBase.current = null;
    if (style === 'steady' && !steadyVolume) {
      // Keep the audible level when flattening a fade that starts or ends silent.
      const gain = Math.max(startGain, endGain);
      preset(gain, gain);
    }
  }
  function applyCut() {
    player.pause();
    setPlaying(false);
    setPosition(0);
    volumeBase.current = null;
    const pieces =
      operation === 'keep' ? keepRange(project, start, end) : removeRange(project, start, end);
    const next = commitPieces(project, pieces);
    onSelectionChange({ ...selection, startMs: 0, endMs: projectDuration(next) });
    onChange(next);
    setAnnouncement(t('recorder.editor.cut_applied'));
  }
  const rangeControl = (edge: 'start' | 'end') => (
    <label className={styles.selectionEndpoint} data-edge={edge}>
      <output>{preciseClock(edge === 'start' ? start : end)}</output>
      <input
        aria-label={t(
          edge === 'start' ? 'recorder.editor.range_start' : 'recorder.editor.range_end',
        )}
        type="range"
        min={edge === 'start' ? 0 : start + 100}
        max={edge === 'start' ? Math.max(0, end - 100) : duration}
        step="100"
        value={edge === 'start' ? start : end}
        aria-valuetext={preciseClock(edge === 'start' ? start : end)}
        onChange={(event) => adjustRange(edge, Number(event.target.value))}
      />
    </label>
  );
  return (
    <section className={styles.studio} aria-label={t('recorder.review_label')}>
      <div className={styles.studioHeading}>
        {(duration > 0 || editing) && !live ? (
          <button
            type="button"
            className={styles.editToggle}
            disabled={disabled}
            aria-label={t(editing ? 'recorder.editor.done_editing' : 'recorder.editor.edit_audio')}
            aria-expanded={editing}
            aria-controls={controlsId}
            onClick={onToggleEdit}
          >
            {editing ? <Check size={17} /> : <Scissors size={17} />}{' '}
            {t(editing ? 'recorder.editor.range_done' : 'recorder.editor.edit_short')}
          </button>
        ) : (
          <span
            className={`${styles.studioStatus} ${recording ? styles.recordingStatus : ''}`}
            role="status"
          >
            {recording && <i className={styles.liveDot} />}
            {statusKey ? t(statusKey) : ''}
          </span>
        )}
        <div
          className={styles.timer}
          aria-label={
            editing
              ? `${t('recorder.editor.clip_length')}: ${displayedTime}`
              : t('recorder.editor.recorded', { time: displayedTime })
          }
        >
          {displayedTime}
        </div>
        <div className={styles.studioReset}>{resetControl}</div>
      </div>
      <AudioWaveform
        peaks={livePeaks}
        duration={waveDuration}
        position={live ? waveDuration : position}
        live={live}
        empty={!live && !duration}
        selection={
          editing && duration > 0 && (mode === 'volume' || pendingCut)
            ? { start, end, remove: mode === 'cut' && operation === 'remove' }
            : undefined
        }
        curve={editing && mode === 'volume' ? curve : undefined}
        playing={playing}
        disabled={disabled || !duration || emptyPreview}
        playLabel={t(playing ? 'recorder.editor.pause' : 'recorder.editor.play')}
        seekLabel={t('recorder.editor.seek')}
        positionLabel={preciseClock(live ? waveDuration : position)}
        onPlay={() => void play()}
        onSeek={(value) => {
          player.seek(value);
          setPosition(player.position);
        }}
      />
      {editing && duration > 0 && (
        <fieldset
          id={controlsId}
          className={styles.editorLayout}
          disabled={disabled}
          aria-label={t('recorder.editor.tools')}
        >
          <div className={styles.editorModes} aria-label={t('recorder.editor.tools')}>
            <button
              type="button"
              aria-label={t('recorder.editor.trim')}
              title={t('recorder.editor.trim')}
              aria-pressed={mode === 'cut' && operation === 'keep'}
              onClick={() => {
                onToolChange('cut', 'keep');
              }}
            >
              <Crop size={18} />
            </button>
            <button
              type="button"
              aria-label={t('recorder.editor.cut')}
              title={t('recorder.editor.cut')}
              aria-pressed={mode === 'cut' && operation === 'remove'}
              onClick={() => {
                onToolChange('cut', 'remove');
              }}
            >
              <Scissors size={18} />
            </button>
            <button
              type="button"
              aria-label={t('recorder.editor.volume_mode')}
              title={t('recorder.editor.volume_mode')}
              aria-pressed={mode === 'volume'}
              onClick={() => {
                onToolChange('volume', operation);
              }}
            >
              <Volume2 size={18} />
            </button>
          </div>
          <div className={styles.rangeToolbar}>
            {rangeControl('start')}
            {rangeControl('end')}
          </div>
          <div className={styles.studioControls}>
            {mode === 'cut' ? (
              <div className={styles.editPanel}>
                <div className={styles.editResult}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={
                      !pendingCut || (operation === 'keep' && start === 0 && end === duration)
                    }
                    onClick={applyCut}
                  >
                    <Scissors size={14} />
                    {t(
                      operation === 'keep'
                        ? 'recorder.editor.apply_trim'
                        : 'recorder.editor.apply_cut',
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.volumePanel}>
                <div
                  className={styles.volumeStyle}
                  role="group"
                  aria-label={t('recorder.editor.volume_style')}
                >
                  <button
                    type="button"
                    aria-pressed={!gradualVolume}
                    onClick={() => chooseVolumeStyle('steady')}
                  >
                    {t('recorder.editor.volume_steady')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={gradualVolume}
                    onClick={() => chooseVolumeStyle('gradual')}
                  >
                    {t('recorder.editor.volume_gradual')}
                  </button>
                </div>
                <div className={styles.volumeSliders} data-gradual={gradualVolume}>
                  {(gradualVolume ? ['start', 'end'] : ['steady']).map((edge) => {
                    const value = Math.round((edge === 'end' ? endGain : startGain) * 100);
                    const label =
                      edge === 'steady'
                        ? 'recorder.editor.volume_mode'
                        : edge === 'start'
                          ? 'recorder.editor.volume_from'
                          : 'recorder.editor.volume_to';
                    const accessibleLabel =
                      edge === 'steady'
                        ? label
                        : edge === 'start'
                          ? 'recorder.editor.start_volume'
                          : 'recorder.editor.end_volume';
                    return (
                      <label key={edge}>
                        <span>
                          {t(label)}
                          <output>{value}%</output>
                        </span>
                        <input
                          aria-label={t(accessibleLabel)}
                          type="range"
                          min="0"
                          max="200"
                          step="5"
                          value={value}
                          aria-valuetext={`${value}%`}
                          onPointerDown={() => {
                            volumeBase.current = null;
                          }}
                          onPointerUp={() => {
                            volumeBase.current = null;
                          }}
                          onPointerCancel={() => {
                            volumeBase.current = null;
                          }}
                          onBlur={() => {
                            volumeBase.current = null;
                          }}
                          onChange={(event) => {
                            const gain = Number(event.target.value) / 100;
                            changeVolume(
                              edge === 'end' ? startGain : gain,
                              edge === 'start' ? endGain : gain,
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                {gradualVolume && (
                  <div className={styles.volumeActions}>
                    <div className={styles.volumePresets}>
                      <button type="button" onClick={() => preset(0, 1)}>
                        {t('recorder.editor.fade_in')}
                      </button>
                      <button type="button" onClick={() => preset(1, 0)}>
                        {t('recorder.editor.fade_out')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </fieldset>
      )}
      <span className={styles.srOnly} role="status">
        {announcement}
      </span>
    </section>
  );
}
