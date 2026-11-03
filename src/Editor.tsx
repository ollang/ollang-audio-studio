import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  FileAudio,
  Mic,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Square,
  Undo2,
  Upload,
} from 'lucide-react';
import { Capture, type CaptureState } from './capture';
import { decodeFile, formatTime } from './audio';
import { t } from './i18n';
import type { Clip } from '../shared/contracts';
import { AudioReview } from './editor/AudioReview';
import { ConfirmEdit } from './editor/ConfirmEdit';
import {
  acceptAudioTake,
  boundedEditSelection,
  emptyProject,
  initialEditSelection,
  keepRange,
  pendingEditProject,
  projectDuration,
  projectWav,
  recordingAllowance,
  redoProject,
  resolvePendingEdit,
  undoProject,
  WORKING_MAX_MS,
  type RecorderEditSelection,
  type RecorderProject,
  type RecordingPeak,
} from './editor/project';

type Props = {
  seriesId?: string;
  onSaved: (clip: Clip) => void;
  onNotice: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
};
type EditAction =
  | { type: 'save' | 'done' | 'record' | 'undo' | 'redo' }
  | {
      type: 'tool';
      mode: RecorderEditSelection['mode'];
      operation: RecorderEditSelection['operation'];
    };
const validDuration = (project: RecorderProject) =>
  projectDuration(project) >= 1000 && projectDuration(project) <= 120_000;

export function Editor({ seriesId, onSaved, onNotice, onBusy, onDirty }: Props) {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<RecordingPeak[]>([]);
  const [project, setProject] = useState<RecorderProject>(emptyProject);
  const [selection, setSelection] = useState(initialEditSelection);
  const [rangeChanged, setRangeChanged] = useState(false);
  const [volumePreview, setVolumePreview] = useState<RecorderProject | null>(null);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pendingAction, setPendingAction] = useState<EditAction | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'record' | 'upload' | null>(null);
  const [title, setTitle] = useState(t('defaultTitle'));
  const [busy, setBusy] = useState<'decode' | 'save' | null>(null);
  const [dragging, setDragging] = useState(false);
  const capture = useRef<Capture | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const currentProject = useRef(project);
  const submission = useRef<{ key: string; id: string } | null>(null);
  const callbacks = useRef({ onNotice, onSaved });
  useEffect(() => {
    callbacks.current = { onNotice, onSaved };
  }, [onNotice, onSaved]);
  useEffect(() => {
    currentProject.current = project;
  }, [project]);

  const acceptProject = useCallback((next: RecorderProject) => {
    currentProject.current = next;
    setProject(next);
    setSelection(initialEditSelection());
    setRangeChanged(false);
    setVolumePreview(null);
    setRevision((value) => value + 1);
  }, []);
  const openFile = useCallback(
    async (file: Blob, recording = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy('decode');
      callbacks.current.onNotice('');
      try {
        const buffer = await decodeFile(file, recording);
        if (!alive.current) return;
        let next = acceptAudioTake(
          currentProject.current,
          { id: crypto.randomUUID(), file: new File([file], 'take', { type: file.type }), buffer },
          recording ? 'microphone' : 'file',
        );
        // Recorder codecs can add a short tail. Keep the timeline within its stated budget.
        if (projectDuration(next) > WORKING_MAX_MS)
          next = { ...next, pieces: keepRange(next, 0, WORKING_MAX_MS) };
        acceptProject(next);
        setSeconds(0);
        setBars([]);
        setEditing(false);
        if (!recording) setMode('upload');
      } catch {
        if (alive.current) callbacks.current.onNotice(t('errorFile'));
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(null);
      }
    },
    [acceptProject],
  );
  useEffect(() => {
    alive.current = true;
    const instance = new Capture({
      state: setCaptureState,
      tick: (elapsed, level) => {
        setSeconds(elapsed);
        setBars((previous) => [
          ...previous,
          { timeMs: elapsed * 1000, peak: Math.min(1, level * 5) },
        ]);
      },
      complete: (file) => {
        void openFile(file, true);
      },
      error: (code) =>
        callbacks.current.onNotice(
          t(
            code === 'permission'
              ? 'errorPermission'
              : code === 'unsupported'
                ? 'errorUnsupported'
                : code === 'interrupted'
                  ? 'errorInterrupted'
                  : 'errorCapture',
          ),
        ),
    });
    capture.current = instance;
    return () => {
      alive.current = false;
      instance.dispose();
    };
  }, [openFile]);

  async function save(next: RecorderProject) {
    if (busyRef.current || !validDuration(next)) return;
    busyRef.current = true;
    setBusy('save');
    const key = JSON.stringify([next.pieces, title]);
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/clips', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          ...(seriesId ? { 'X-Series-Id': seriesId } : {}),
          'X-Submission-Id': submission.current.id,
          'X-Clip-Title': encodeURIComponent(title.trim() || t('defaultTitle')),
          'X-Auto-Translate': 'true',
        },
        body: projectWav(next),
      });
      if (!response.ok) throw new Error('save');
      const clip = (await response.json()) as Clip;
      if (!alive.current) return;
      callbacks.current.onSaved(clip);
      callbacks.current.onNotice(t('saved'));
    } catch {
      if (alive.current) callbacks.current.onNotice(t('errorSave'));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function sample() {
    if (busyRef.current) return;
    try {
      const response = await fetch('/samples/conversations/01-english/original.wav');
      if (!response.ok) throw new Error('sample');
      const blob = await response.blob();
      if (alive.current) await openFile(blob);
    } catch {
      if (alive.current) callbacks.current.onNotice(t('errorFile'));
    }
  }
  const activeCapture = captureState !== 'idle';
  const disabled = activeCapture || Boolean(busy);
  const hasDraft = project.takes.length > 0;
  const bounded = boundedEditSelection(project, selection);
  const preview = pendingEditProject(project, bounded, rangeChanged, volumePreview);
  const pending = JSON.stringify(preview.pieces) !== JSON.stringify(project.pieces);
  const duration = projectDuration(preview);
  const allowance = recordingAllowance(project);
  useEffect(() => {
    onBusy(busy === 'save');
  }, [busy, onBusy]);
  useEffect(() => {
    onDirty(activeCapture || hasDraft || busy === 'decode');
  }, [activeCapture, hasDraft, busy, onDirty]);

  function perform(action: EditAction, next: RecorderProject) {
    if (action.type === 'save') {
      void save(next);
      return;
    }
    if (action.type === 'tool') {
      setSelection({
        ...boundedEditSelection(next, selection),
        mode: action.mode,
        operation: action.operation,
      });
      setRangeChanged(false);
      setVolumePreview(null);
    } else if (action.type === 'done') setEditing(false);
    else if (action.type === 'undo' || action.type === 'redo') {
      acceptProject(action.type === 'undo' ? undoProject(next) : redoProject(next));
      setSelection({
        ...initialEditSelection(),
        mode: selection.mode,
        operation: selection.operation,
      });
    } else {
      setEditing(false);
      setSeconds(0);
      setBars([]);
      void capture.current?.start(recordingAllowance(next) / 1000);
    }
  }
  function request(action: EditAction) {
    if (disabled) return;
    if (action.type === 'undo' && pending) {
      // Undo the current preview first. Keep it as one redoable edit without
      // stepping back through any previously applied changes.
      const restored = undoProject(resolvePendingEdit(project, preview, true));
      acceptProject(restored);
      setSelection({
        ...initialEditSelection(),
        mode: selection.mode,
        operation: selection.operation,
      });
      return;
    }
    if (pending) setPendingAction(action);
    else perform(action, project);
  }
  function resolve(apply: boolean) {
    if (!pendingAction) return;
    const next = resolvePendingEdit(project, preview, apply);
    acceptProject(next);
    setPendingAction(null);
    perform(pendingAction, next);
  }
  function reset(nextMode = mode) {
    acceptProject(emptyProject());
    setEditing(false);
    setSeconds(0);
    setBars([]);
    setConfirm(null);
    setMode(nextMode);
    onNotice('');
  }
  return (
    <section className="studio-card" aria-label={t('stepRecord')}>
      <div className="tabs" role="tablist" aria-label={t('stepRecord')}>
        {(['record', 'upload'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            disabled={disabled}
            onClick={() => {
              if (value === mode) return;
              if (hasDraft) setConfirm(value);
              else setMode(value);
            }}
          >
            {value === 'record' ? <Mic size={16} /> : <Upload size={16} />}
            {t(value)}
          </button>
        ))}
      </div>
      {hasDraft && (
        <label className="title-label editor-title">
          {t('title')}
          <input
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
        </label>
      )}
      {(mode === 'record' || hasDraft) && (
        <AudioReview
          key={revision}
          project={volumePreview ?? project}
          visible={!pendingAction && !confirm && !activeCapture && !busy}
          editing={editing}
          onToggleEdit={() => {
            if (editing) request({ type: 'done' });
            else setEditing(true);
          }}
          selection={bounded}
          onSelectionChange={(next) => {
            setSelection(next);
            setRangeChanged(true);
          }}
          clipDuration={duration}
          pendingCut={rangeChanged}
          onToolChange={(mode, operation) => request({ type: 'tool', mode, operation })}
          onVolumePreview={setVolumePreview}
          live={activeCapture}
          recording={captureState === 'recording'}
          elapsed={seconds * 1000}
          bars={bars}
          statusKey={
            captureState === 'paused'
              ? 'paused'
              : captureState === 'requesting'
                ? 'permissionWait'
                : activeCapture
                  ? 'recording'
                  : 'micHint'
          }
          disabled={disabled}
          resetControl={
            hasDraft &&
            !activeCapture && (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  mode === 'upload' ? fileInput.current?.click() : setConfirm('reset')
                }
              >
                {mode === 'upload' ? <Upload size={15} /> : <RotateCcw size={15} />}
                {t(mode === 'upload' ? 'recorder.editor.replace_file' : 'replace')}
              </button>
            )
          }
          onChange={acceptProject}
          onError={(key) => onNotice(t(key))}
        />
      )}
      {mode === 'upload' && !hasDraft && (
        <button
          className={`upload-drop ${dragging ? 'is-dragging' : ''}`}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file && !disabled) void openFile(file);
          }}
        >
          <FileAudio size={34} />
          <strong>{t('uploadHint')}</strong>
          <span>{t('editor.dropHint')}</span>
          <span className="primary-button upload-choose">{t('chooseFile')}</span>
          <small>{t('uploadFormats')}</small>
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.m4a,.ogg,.webm"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && !disabled) void openFile(file);
          event.target.value = '';
        }}
      />
      {busy === 'decode' && (
        <p className="editor-feedback" role="status">
          {t('decoding')}
        </p>
      )}
      {hasDraft && (
        <div className="editor-history">
          <p className={validDuration(preview) ? '' : 'length-warning'} role="status">
            {validDuration(preview)
              ? t('editor.clipLength', { time: formatTime(duration / 1000) })
              : t('editor.validLength')}
          </p>
          <div>
            <button
              className="icon-button"
              aria-label={t('recorder.editor.undo')}
              disabled={disabled || (!pending && !project.past.length)}
              onClick={() => request({ type: 'undo' })}
            >
              <Undo2 size={19} />
            </button>
            <button
              className="icon-button"
              aria-label={t('recorder.editor.redo')}
              disabled={disabled || !project.future.length}
              onClick={() => request({ type: 'redo' })}
            >
              <Redo2 size={19} />
            </button>
          </div>
        </div>
      )}
      <div className="editor-actions">
        {captureState === 'requesting' && (
          <button className="secondary-button" onClick={() => capture.current?.stop()}>
            {t('cancel')}
          </button>
        )}
        {captureState === 'recording' || captureState === 'paused' ? (
          <>
            <button
              className="secondary-button"
              onClick={() =>
                captureState === 'paused' ? capture.current?.resume() : capture.current?.pause()
              }
            >
              {captureState === 'paused' ? <Play size={16} /> : <Pause size={16} />}
              {t(captureState === 'paused' ? 'resume' : 'pause')}
            </button>
            <button className="primary-button" onClick={() => capture.current?.stop()}>
              <Square size={15} />
              {t('stop')}
            </button>
          </>
        ) : (
          <>
            {mode === 'record' && (
              <button
                className={hasDraft ? 'secondary-button' : 'primary-button'}
                disabled={disabled || allowance < 1000}
                onClick={() => request({ type: 'record' })}
              >
                <Mic size={17} />
                {t(
                  captureState === 'requesting'
                    ? 'permissionWait'
                    : hasDraft
                      ? 'recorder.editor.continue'
                      : 'start',
                )}
              </button>
            )}
            {hasDraft && (
              <button
                className="primary-button"
                disabled={
                  disabled || (!validDuration(preview) && !(pending && validDuration(project)))
                }
                onClick={() => request({ type: 'save' })}
              >
                {t(busy === 'save' ? 'saving' : 'save')}
                <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
      </div>
      {!hasDraft && !activeCapture && (
        <div className="editor-footnote">
          <p>{t(mode === 'record' ? 'recordHint' : 'editor.uploadHint')}</p>
          <button
            className="text-button sample-button"
            disabled={disabled}
            onClick={() => void sample()}
          >
            {t('useSample')}
          </button>
        </div>
      )}
      {hasDraft && mode === 'record' && !activeCapture && (
        <p className="editor-footnote">
          {t(allowance > 0 ? 'editor.workingRoom' : 'recorder.editor.limit_reached', {
            time: formatTime(allowance / 1000),
          })}
        </p>
      )}
      {pendingAction && (
        <ConfirmEdit
          title={t('recorder.editor.pending_title')}
          description={t('editor.pendingHelp')}
          applyLabel={t(
            pendingAction.type === 'save' ? 'editor.applySave' : 'recorder.editor.apply_continue',
          )}
          discardLabel={t(
            pendingAction.type === 'save'
              ? 'editor.discardSave'
              : 'recorder.editor.discard_continue',
          )}
          canApply={pendingAction.type !== 'save' || validDuration(preview)}
          canDiscard={pendingAction.type !== 'save' || validDuration(project)}
          onApply={() => resolve(true)}
          onDiscard={() => resolve(false)}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {confirm && (
        <ConfirmEdit
          title={t(confirm === 'reset' ? 'discardQuestion' : 'editor.switchTitle')}
          description={t('editor.resetHelp')}
          discardLabel={t(confirm === 'reset' ? 'discard' : 'recorder.editor.discard_switch')}
          onDiscard={() => reset(confirm === 'reset' ? mode : confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
