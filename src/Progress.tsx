import { Check, Circle, ChevronDown } from 'lucide-react';
import type { Clip } from '../shared/contracts';
import { t, languageName, useLocale } from './i18n';
import { TranslationControls } from './TranslationControls';
import { activeTranslation } from '../shared/translations';

export function Progress({
  clips,
  checkedAt,
  pollFailed,
  enabled,
  onUpdate,
  onError,
}: {
  clips: Clip[];
  checkedAt: number | null;
  pollFailed: boolean;
  enabled: boolean;
  onUpdate: () => void;
  onError: (message: string) => void;
}) {
  const locale = useLocale();
  const latest = clips.at(-1);
  if (!latest) return null;
  const detecting = latest.status === 'analyzing';
  const confirmed = latest.status === 'ready';
  const jobs = clips.flatMap((clip) => clip.translations ?? []);
  const working = jobs.some((job) => activeTranslation(job.state));
  return (
    <section className="translation-panel" aria-label={t('ollangStep')}>
      <div className="translation-actions">
        {clips.map((clip) => (
          <TranslationControls
            key={clip.id}
            clip={clip}
            enabled={enabled}
            onUpdate={onUpdate}
            onError={onError}
          />
        ))}
      </div>
      <details className="processing">
        <summary>
          <span>{t('processingTitle')}</span>
          <ChevronDown size={17} />
        </summary>
        <div className="processing-body">
          <p className="processing-clip">{latest.title}</p>
          <ol className="processing-steps">
            <li className="done">
              <Check size={16} />
              <div>
                <strong>{t('audioSaved')}</strong>
                <p>{t('audioSavedHint')}</p>
              </div>
            </li>
            <li className={confirmed ? 'done' : detecting ? 'working' : ''}>
              {detecting ? (
                <span className="spinner" />
              ) : confirmed ? (
                <Check size={16} />
              ) : (
                <Circle size={16} />
              )}
              <div>
                <strong>{t('detectStep')}</strong>
                <p>
                  {confirmed
                    ? `${languageName(latest.sourceLanguage)} · ${t(latest.notice === 'confirmed' ? 'confirmed' : 'detectedLocally')}`
                    : t(detecting ? 'detectStepHint' : 'needsLanguage')}
                </p>
              </div>
            </li>
            {!jobs.length && (
              <li>
                <Circle size={16} />
                <div>
                  <strong>{t('ollangStep')}</strong>
                  <p>{t(enabled ? 'automaticStarting' : 'translationNeedsKey')}</p>
                </div>
              </li>
            )}
          </ol>
          {clips.flatMap((clip) =>
            (clip.translations ?? []).map((job) => (
              <div className="translation-history" key={job.id}>
                <strong>
                  {clip.title} · {languageName(job.target)}
                </strong>
                <ol className="job-events">
                  {job.events.map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <time dateTime={event.at}>
                        {new Date(event.at).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>{' '}
                      {event.providerStatus
                        ? t('providerStatus', { status: event.providerStatus })
                        : t(`job_${event.state}`)}
                    </li>
                  ))}
                </ol>
              </div>
            )),
          )}
          <div className="poll-status">
            <span className={detecting || working ? 'live-dot' : ''} />
            {t(pollFailed ? 'pollDisconnected' : detecting || working ? 'pollingNow' : 'pollIdle')}
            {checkedAt && (
              <time dateTime={new Date(checkedAt).toISOString()}>
                {new Date(checkedAt).toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
