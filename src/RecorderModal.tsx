import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Clip } from '../shared/contracts';
import { Editor } from './Editor';
import { t } from './i18n';

export function RecorderModal({
  seriesId,
  title,
  onSaved,
  onClose,
}: {
  seriesId?: string;
  title?: string;
  onSaved: (clip: Clip) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, []);
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="recorder-dialog"
      aria-labelledby="recorder-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id="recorder-title">{t(seriesId ? 'addClip' : 'startSeries')}</h2>
          {title && <p>{title}</p>}
        </div>
        <button
          className="icon-button"
          aria-label={t('closeRecorder')}
          disabled={busy}
          onClick={close}
        >
          <X size={22} />
        </button>
      </div>
      {discard && (
        <div className="discard-notice" role="alert">
          <p>{t('discardQuestion')}</p>
          <div>
            <button className="secondary-button" onClick={() => setDiscard(false)}>
              {t('keepEditing')}
            </button>
            <button className="primary-button" onClick={onClose}>
              {t('discard')}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <p className="recorder-workflow-hint">{t('automaticSaveHint')}</p>
      <Editor
        seriesId={seriesId}
        onSaved={onSaved}
        onNotice={setNotice}
        onBusy={setBusy}
        onDirty={setDirty}
      />
    </dialog>
  );
}
