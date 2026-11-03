import { useState } from 'react';
import type { Clip } from '../shared/contracts';
import { languageName, t, useLocale } from './i18n';
import { sourceLanguages } from '../shared/languages';

/** Confirmation is required before uncertain audio can reach Ollang. */
export function SourceLanguageConfirmation({
  clip,
  onUpdate,
  onError,
}: {
  clip: Clip;
  onUpdate: () => void;
  onError: (message: string) => void;
}) {
  const locale = useLocale();
  const [override, setLanguage] = useState<string | null>(null);
  const language = override ?? (clip.sourceLanguage || clip.detectedLanguage);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      const response = await fetch(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLanguage: language }),
      });
      if (!response.ok) throw new Error('confirm');
      onUpdate();
    } catch {
      onError(t('errorConfirm'));
    } finally {
      setBusy(false);
    }
  }
  const choices = [
    ...new Set([...sourceLanguages, clip.detectedLanguage, clip.sourceLanguage].filter(Boolean)),
  ].sort((a, b) => languageName(a).localeCompare(languageName(b), locale));
  return (
    <div className="source-controls">
      <select
        aria-label={`${t('sourceLanguage')}: ${clip.title}`}
        value={language}
        disabled={busy || Boolean(clip.translations?.length)}
        onChange={(event) => setLanguage(event.target.value)}
      >
        <option value="">{t('chooseLanguage')}</option>
        {choices.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
          </option>
        ))}
      </select>
      <button
        className="secondary-button"
        aria-label={t(clip.automaticTranslation ? 'confirmAndTranslate' : 'confirmLanguage')}
        disabled={!language || busy || Boolean(clip.translations?.length)}
        onClick={() => {
          void confirm();
        }}
      >
        {t(clip.automaticTranslation ? 'confirmAndTranslate' : 'confirmLanguage')}
      </button>
      {['detector_unavailable', 'interrupted'].includes(clip.notice) && (
        <button
          className="text-button"
          onClick={() => {
            void fetch(`/api/clips/${clip.id}/detect`, { method: 'POST' })
              .then(onUpdate)
              .catch(() => onError(t('errorNetwork')));
          }}
        >
          {t('retryDetection')}
        </button>
      )}
    </div>
  );
}
