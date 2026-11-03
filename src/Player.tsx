import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Plus,
  ListMusic,
} from 'lucide-react';
import { decodeFile, formatTime, peaks } from './audio';
import { languageName, t } from './i18n';
import { locales, type Locale } from './locale';
import {
  captionAt,
  rendition,
  deliveredCaptions,
  playableLanguages,
  type PlaybackRequest,
  type Track,
} from './playback';
import { Waveform } from './Waveform';
import { readPreference, savePreference } from './preferences';
import { hasCollectedAudio, targetLanguages } from '../shared/translations';

export function Player({
  title,
  tracks,
  locale,
  onAdd,
  onError,
  suspended,
  requestedTrack,
  renderTranslation,
}: {
  title: string;
  tracks: Track[];
  locale: Locale;
  onAdd: () => void;
  onError: (message: string) => void;
  suspended: boolean;
  requestedTrack: PlaybackRequest | null;
  renderTranslation?: (trackId: string) => ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [audioMode, setAudioMode] = useState(() => {
    const value = readPreference('audio', 'site');
    return ['site', 'original', ...targetLanguages].includes(value) ? value : 'site';
  });
  const [subtitleMode, setSubtitleMode] = useState(() => {
    // Preserve the former on/off preference until a subtitle language is chosen.
    const value = readPreference(
      'subtitleLanguage',
      readPreference('captions', 'true') === 'false' ? 'off' : 'site',
    );
    return ['site', 'off', ...targetLanguages].includes(value) ? value : 'site';
  });
  const [wave, setWave] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const playNext = useRef(false);
  const currentIndex = Math.min(index, tracks.length - 1);
  const track = tracks[currentIndex]!;
  const requestedLanguage = audioMode === 'site' ? locale : audioMode;
  const requestedCaptionLanguage = ['site', 'off'].includes(subtitleMode) ? locale : subtitleMode;
  const subtitleLanguages = new Set<string>(
    ['site', 'off'].includes(subtitleMode) ? [] : [subtitleMode],
  );
  const listeningLanguages = playableLanguages(track);
  for (const item of tracks) {
    for (const caption of item.captionTracks ?? []) {
      if (caption.cues.length && targetLanguages.some((code) => code === caption.language))
        subtitleLanguages.add(caption.language);
    }
    for (const code of locales)
      if (item.captions?.some((cue) => cue.text[code])) subtitleLanguages.add(code);
    for (const job of item.translations ?? []) {
      if (!hasCollectedAudio(job)) continue;
      for (const caption of job.captions)
        if (caption.cues.length && targetLanguages.some((code) => code === caption.language))
          subtitleLanguages.add(caption.language);
    }
  }
  const playback = rendition(track, requestedLanguage);
  // A saved/site preference may not exist on this clip. Show the real voice
  // rather than claiming a language whose recording is unavailable.
  const audioSelection =
    audioMode === 'original' || !playback.language || !listeningLanguages.has(playback.language)
      ? 'original'
      : audioMode === 'site' && playback.language === locale
        ? 'site'
        : playback.language;
  const fallback =
    Boolean(track.language) &&
    requestedLanguage !== 'original' &&
    requestedLanguage !== playback.language;
  const delivered = deliveredCaptions(track, playback.language, requestedCaptionLanguage);
  const legacyLanguage = locales.find((code) => code === requestedCaptionLanguage) ?? 'en';
  const captionLanguage =
    delivered?.language ?? (track.captions ? legacyLanguage : requestedCaptionLanguage);
  const hasCaptions = Boolean(track.captions || delivered);
  const caption = delivered
    ? (delivered.cues.find((cue) => cue.start <= time && time < cue.end)?.text ?? '')
    : captionAt(track.captions ?? [], time, legacyLanguage);
  const previousRendition = useRef<{ track: string; url: string } | null>(null);
  useEffect(() => {
    const previous = previousRendition.current;
    if (previous?.track === track.id && previous.url === playback.url) return;
    previousRendition.current = { track: track.id, url: playback.url };
    const element = audio.current;
    if (!element) return;
    // Read the real media state before changing src: React's playing state can
    // lag behind a pause event. Preserve pending intent during rapid switches.
    const wasPlaying = previous?.track === track.id && !element.paused && !element.ended;
    playNext.current = !suspended && (wasPlaying || playNext.current);
    element.pause();
    element.src = playback.url;
    element.load();
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setFinished(false);
  }, [track.id, playback.url, suspended]);
  const targetIndex = requestedTrack
    ? tracks.findIndex((item) => item.id === requestedTrack.id)
    : -1;
  // Library and clip-detail play buttons are explicit playback actions.
  const lastRequest = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (targetIndex < 0 || lastRequest.current === requestedTrack?.request) return;
    lastRequest.current = requestedTrack?.request;
    playNext.current = requestedTrack?.autoplay !== false;
    if (targetIndex === currentIndex) {
      const autoplay = playNext.current;
      playNext.current = false;
      if (requestedTrack?.restart) {
        if (audio.current) audio.current.currentTime = 0;
        // Synchronize the UI with this explicit, externally requested media seek.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTime(0);
        setFinished(false);
      }
      if (autoplay)
        void audio.current?.play().catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError'))
            onError(t('errorPlayback'));
        });
      else audio.current?.pause();
    } else {
      setIndex(targetIndex);
      setTime(0);
      setDuration(0);
      setWave([]);
      setFinished(false);
    }
  }, [requestedTrack, targetIndex, currentIndex, onError]);
  useEffect(() => {
    const element = audio.current;
    return () => {
      // Removing a media node alone need not stop it. Reset request bookkeeping
      // too, so React's development effect replay can process the request again.
      element?.pause();
      playNext.current = false;
      lastRequest.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (suspended) {
      playNext.current = false;
      audio.current?.pause();
    }
  }, [suspended]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(playback.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('audio');
        return response.blob();
      })
      .then((blob) => decodeFile(blob))
      .then((buffer) => {
        if (!controller.signal.aborted) setWave(peaks(buffer));
      })
      .catch(() => {
        /* Audio element reports playback failure; waveform is optional. */
      });
    return () => controller.abort();
  }, [playback.url]);
  function choose(next: number, autoplay = playing) {
    if (next === currentIndex) {
      if (audio.current) audio.current.currentTime = 0;
      if (autoplay)
        void audio.current?.play().catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError'))
            onError(t('errorPlayback'));
        });
    } else {
      audio.current?.pause();
      playNext.current = autoplay;
      setIndex(next);
      setPlaying(false);
      setTime(0);
      setDuration(0);
      setWave([]);
    }
    setFinished(false);
  }
  return (
    <section className="listening-card" aria-label={t('stepListen')}>
      <div className="series-heading">
        <div>
          <h2>{title}</h2>
          <div className="series-meta">
            <span>
              <ListMusic size={15} />
              {t('clipCount', { count: tracks.length })}
            </span>
            <span>{formatTime(tracks.reduce((sum, item) => sum + item.duration, 0))}</span>
          </div>
        </div>
      </div>
      <div className="voice-toolbar">
        <div className="language-control recorded-language">
          <span>{t('recordedIn')}</span>
          <strong>{languageName(track.language) || t('detecting')}</strong>
        </div>
        <label className="language-control">
          <span>{t('listenIn')}</span>
          <div className="player-select">
            <select
              className="audio-language"
              aria-label={t('audioLanguage')}
              value={audioSelection}
              onChange={(event) => {
                const next = event.target.value;
                const nextAudio = rendition(track, next === 'site' ? locale : next);
                if (nextAudio.url !== playback.url) {
                  const element = audio.current;
                  // Capture intent in the user action, then stop the old voice
                  // immediately. Metadata loading resumes only an active listen.
                  playNext.current =
                    !suspended &&
                    (playNext.current || Boolean(element && !element.paused && !element.ended));
                  element?.pause();
                }
                setAudioMode(next);
                savePreference('audio', next);
              }}
            >
              {listeningLanguages.has(locale) && (
                <option value={audioMode === 'site' ? 'site' : locale}>
                  {languageName(locale)}
                </option>
              )}
              <option value="original">{t('original')}</option>
              {[...listeningLanguages]
                .filter((code) => code !== locale)
                .map((code) => (
                  <option value={code} key={code}>
                    {languageName(code)}
                  </option>
                ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </label>
        <label className="language-control">
          <span>{t('subtitlesIn')}</span>
          <div className="player-select">
            <select
              className="subtitle-language"
              aria-label={t('subtitles')}
              value={subtitleMode}
              onChange={(event) => {
                setSubtitleMode(event.target.value);
                savePreference('subtitleLanguage', event.target.value);
              }}
            >
              <option value="site">{t('siteAudio', { language: languageName(locale) })}</option>
              {[...subtitleLanguages].map((code) => (
                <option value={code} key={code}>
                  {languageName(code)}
                </option>
              ))}
              <option value="off">{t('captionsOff')}</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </label>
      </div>
      <div className="now-playing">
        <div>
          <span>{t('clipPosition', { current: currentIndex + 1, total: tracks.length })}</span>
          <h3>{track.title}</h3>
        </div>
        <span>
          {formatTime(time)} / {formatTime(duration || playback.duration)}
        </span>
      </div>
      <audio
        ref={audio}
        preload="metadata"
        onLoadedMetadata={() => {
          setDuration(audio.current?.duration || 0);
          if (playNext.current && !suspended) {
            playNext.current = false;
            void audio.current?.play().catch((error: unknown) => {
              if (!(error instanceof DOMException && error.name === 'AbortError'))
                onError(t('errorPlayback'));
            });
          }
        }}
        onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (currentIndex < tracks.length - 1) choose(currentIndex + 1, true);
          else setFinished(true);
        }}
        onError={() => {
          setPlaying(false);
          playNext.current = false;
          onError(t('errorPlayback'));
        }}
      />
      <div className="wave-player">
        <button
          className="play-main"
          aria-label={t(playing ? 'pauseAudio' : 'play')}
          onClick={() => {
            if (playing) audio.current?.pause();
            else {
              if (finished) {
                choose(0, true);
                return;
              }
              void audio.current?.play().catch((error: unknown) => {
                if (!(error instanceof DOMException && error.name === 'AbortError'))
                  onError(t('errorPlayback'));
              });
            }
          }}
        >
          {playing ? (
            <Pause size={25} fill="currentColor" />
          ) : (
            <Play size={25} fill="currentColor" />
          )}
        </button>
        <div className="playback-wave">
          <Waveform dark values={wave.length ? wave : Array(72).fill(0)} />
          <input
            type="range"
            aria-label={t('seek')}
            min={0}
            max={duration || playback.duration}
            step={0.05}
            value={Math.min(time, duration || playback.duration)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (audio.current) audio.current.currentTime = next;
              setTime(next);
              setFinished(false);
            }}
          />
        </div>
      </div>
      <div className="subtitle-area playback-captions">
        {subtitleMode !== 'off' && (
          <div className="caption-content">
            <p className="caption" lang={captionLanguage}>
              {hasCaptions
                ? caption || '\u00a0'
                : t(
                    track.translations?.some((job) => job.state === 'ready')
                      ? 'noAlignedCaptions'
                      : 'noCaptions',
                  )}
            </p>
            {captionLanguage !== requestedCaptionLanguage && (
              <p className="caption-note">
                {t('subtitleLanguageFallback', {
                  language: languageName(captionLanguage),
                  requested: languageName(requestedCaptionLanguage),
                })}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="player-bottom">
        <div className="skip-controls">
          <button
            className="dark-icon"
            aria-label={t('previous')}
            disabled={currentIndex === 0}
            onClick={() => choose(currentIndex - 1)}
          >
            <SkipBack size={18} />
          </button>
          <button
            className="dark-icon"
            aria-label={t('next')}
            disabled={currentIndex === tracks.length - 1}
            onClick={() => choose(currentIndex + 1)}
          >
            <SkipForward size={18} />
          </button>
          <span>{finished ? t('seriesFinished') : t('continuousPlay')}</span>
        </div>
        <div className="volume">
          <Volume2 size={16} />
          <input
            aria-label={t('volume')}
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </div>
      </div>
      {renderTranslation?.(track.id)}
      <button className="add-clip-button continue-series" onClick={onAdd}>
        <Plus size={19} />
        {t('continueSeries')}
      </button>
      {fallback && (
        <p className="fallback-note">
          {t('audioFallback', {
            requested: languageName(requestedLanguage),
            language: languageName(track.language) || t('original'),
          })}
        </p>
      )}
      {track.sample && <p className="sample-disclosure">{t('sampleLabel')}</p>}
      <details className="track-list">
        <summary>{t('allClips', { count: tracks.length })}</summary>
        <div className="playlist">
          {tracks.map((item, i) => (
            <button
              key={item.id}
              aria-current={i === currentIndex ? 'true' : undefined}
              className={i === currentIndex ? 'active' : ''}
              onClick={() => choose(i, true)}
            >
              <span className="track-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="track-info">
                <strong>{item.title}</strong>
                <small>
                  {languageName(item.language) || t('detecting')} · {formatTime(item.duration)}
                </small>
              </span>
              <Play size={14} />
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
