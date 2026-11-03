import { Play } from 'lucide-react';
import type { Clip } from '../shared/contracts';
import { formatTime } from './audio';
import { languageName, t } from './i18n';
import { SourceLanguageConfirmation } from './SourceLanguageConfirmation';

export function ClipRow({
  clip,
  onPlay,
  onUpdate,
  onError,
}: {
  clip: Clip;
  onPlay: () => void;
  onUpdate: () => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="saved-clip">
      <button className="clip-play" aria-label={`${t('play')}: ${clip.title}`} onClick={onPlay}>
        <Play size={17} />
      </button>
      <div className="saved-clip-title">
        <strong>{clip.title}</strong>
        <span>
          {formatTime(clip.duration)} ·{' '}
          {clip.status === 'analyzing'
            ? t('detecting')
            : clip.confirmationRequired
              ? t('needsLanguage')
              : languageName(clip.sourceLanguage)}
        </span>
      </div>
      {clip.status === 'ready' && !clip.automaticTranslation && (
        <SourceLanguageConfirmation clip={clip} onUpdate={onUpdate} onError={onError} />
      )}
      {clip.status === 'analyzing' && <span className="spinner" />}
    </div>
  );
}
