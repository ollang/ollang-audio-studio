import { useState } from 'react';
import type { Clip } from '../shared/contracts';
import { activeTranslation, targetLanguages } from '../shared/translations';
import { t, languageName } from './i18n';
import type { MessageKey } from './i18n';
import { SourceLanguageConfirmation } from './SourceLanguageConfirmation';

const errorKeys: Record<string, MessageKey> = {
  provider_auth: 'translationNeedsKey',
  provider_forbidden: 'translationNeedsKey',
  provider_credits: 'translationCredits',
  provider_rate_limit: 'translationRateLimit',
  provider_failed: 'translationFailed',
  upload_uncertain: 'translationUncertain',
  order_uncertain: 'translationUncertain',
  order_not_visible: 'translationUncertain',
  duplicate_parents: 'translationUncertain',
  configuration_changed: 'translationNeedsKey',
};
export function TranslationControls({
  clip,
  enabled,
  onUpdate,
  onError,
}: {
  clip: Clip;
  enabled: boolean;
  onUpdate: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const jobs = clip.translations ?? [];
  async function submit(path: string, body?: object) {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) throw new Error('translation');
      onUpdate();
    } catch {
      onError(t('translationSubmitError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="translation-controls" aria-label={`${t('translationFor')}: ${clip.title}`}>
      {!jobs.length && (
        <>
          <h3 className="translation-state-heading">
            {clip.status === 'analyzing' && <span className="spinner" aria-hidden="true" />}
            {t('translationPrompt')}
          </h3>
          <p className="translation-intro" role="status">
            {t(
              clip.status === 'analyzing'
                ? 'savedDetecting'
                : clip.status === 'ready'
                  ? clip.automaticTranslation
                    ? enabled
                      ? 'automaticStarting'
                      : 'translationWaiting'
                    : 'translationWaiting'
                  : 'needsLanguage',
              { language: languageName(clip.sourceLanguage) },
            )}
          </p>
          {clip.confirmationRequired && clip.status !== 'analyzing' && (
            <SourceLanguageConfirmation clip={clip} onUpdate={onUpdate} onError={onError} />
          )}
        </>
      )}
      {clip.automaticTranslation && (
        <p className="translation-destinations">{t('automaticDestinations')}</p>
      )}
      {clip.automaticTranslation && !enabled && <p role="status">{t('translationNeedsKey')}</p>}
      {!clip.automaticTranslation && clip.status === 'ready' && !jobs.length && (
        <div className="translation-start">
          <button
            className="primary-button"
            disabled={busy || !enabled}
            onClick={() =>
              void submit(`/api/clips/${clip.id}/translations`, {
                targets: targetLanguages.filter((language) => language !== clip.sourceLanguage),
              })
            }
          >
            {t(busy ? 'translationStarting' : 'translateSelected')}
          </button>
        </div>
      )}
      {jobs.map((job) => (
        <div className="translation-job" key={job.id}>
          <div className="translation-job-heading">
            <strong>{languageName(job.target)}</strong>
            <span role="status">{t(job.audioUrl ? 'job_ready' : `job_${job.state}`)}</span>
            {activeTranslation(job.state) && <span className="spinner" />}
          </div>
          {job.audioUrl && !job.captions.length && <p>{t('noAlignedCaptions')}</p>}
          {job.error && (
            <p className="translation-error">
              {t(
                errorKeys[job.error] ??
                  (activeTranslation(job.state) ? 'translationRetrying' : 'translationCheckError'),
              )}
            </p>
          )}
          {job.canCheck && (
            <button
              className="secondary-button"
              disabled={busy || !enabled}
              onClick={() => void submit(`/api/translations/${job.id}/check`)}
            >
              {t('checkExistingOrder')}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
