import { useEffect, useId, useRef } from 'react';
import { t } from '../i18n';

/** A native modal keeps unfinished edits explicit and traps keyboard focus. */
export function ConfirmEdit({
  title,
  description,
  applyLabel,
  discardLabel,
  canApply = true,
  canDiscard = true,
  onApply,
  onDiscard,
  onCancel,
}: {
  title: string;
  description: string;
  applyLabel?: string;
  discardLabel: string;
  canApply?: boolean;
  canDiscard?: boolean;
  onApply?: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="edit-confirmation"
      aria-labelledby={id}
      aria-describedby={`${id}-help`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={id}>{title}</h2>
      <p id={`${id}-help`}>{description}</p>
      {(!canApply || !canDiscard) && <p className="notice">{t('editor.validLength')}</p>}
      <div>
        {onApply && (
          <button className="primary-button" disabled={!canApply} onClick={onApply}>
            {applyLabel}
          </button>
        )}
        <button className="secondary-button" disabled={!canDiscard} onClick={onDiscard}>
          {discardLabel}
        </button>
        <button ref={cancel} className="text-button" onClick={onCancel}>
          {t('recorder.editor.back_editing')}
        </button>
      </div>
    </dialog>
  );
}
