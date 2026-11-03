import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Globe2, Mic, Play, X, Plus } from 'lucide-react';
import type { Clip, Configuration } from '../shared/contracts';
import { ClipRow } from './ClipRow';
import { RecorderModal } from './RecorderModal';
import { Player } from './Player';
import { Progress } from './Progress';
import { formatTime } from './audio';
import { chooseLocale, t, useLocale } from './i18n';
import { locales, type Locale } from './locale';
import { showcase } from './showcase';
import type { PlaybackRequest, Track } from './playback';
import { activeTranslation } from '../shared/translations';
import { readPreference, savePreference } from './preferences';

type Series = { id: string; title: string; tracks: Track[]; clips: Clip[] };
const nativeNames: Record<Locale, string> = { en: 'English', pt: 'Português', zh: '中文' };
export function App() {
  const locale = useLocale();
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState(() => readPreference('series', showcase.id));
  function selectSeries(id: string) {
    setSelected(id);
    savePreference('series', id);
  }
  const [recorder, setRecorder] = useState<{ seriesId?: string; title?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/config', { signal: controller.signal })
      .then((response) => response.json())
      .then((config: Configuration) => setLiveEnabled(config.liveTranslationEnabled))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [requestedTrack, setRequestedTrack] = useState<PlaybackRequest | null>(null);
  const playbackSequence = useRef(0);
  function requestPlayback(id: string, autoplay = true, restart = false) {
    setRequestedTrack({ id, request: ++playbackSequence.current, autoplay, restart });
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    async function refresh() {
      if (running || controller.signal.aborted) return;
      clearTimeout(timer);
      if (document.hidden) return;
      running = true;
      let processing = false;
      try {
        const response = await fetch('/api/clips', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error('network');
        const items = (await response.json()) as Clip[];
        if (!controller.signal.aborted) {
          setClips(items);
          setCheckedAt(Date.now());
          setPollFailed(false);
          processing = items.some(
            (clip) =>
              clip.status === 'analyzing' ||
              clip.translations?.some((job) => activeTranslation(job.state)),
          );
        }
      } catch {
        if (!controller.signal.aborted) setPollFailed(true);
      } finally {
        running = false;
        if (!controller.signal.aborted)
          timer = setTimeout(
            () => {
              void refresh();
            },
            processing ? 2500 : 15000,
          );
      }
    }
    const visible = () => {
      if (!document.hidden) void refresh();
      else clearTimeout(timer);
    };
    void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [revision]);
  // Appending local contributions must never mutate the bundled fixture. This
  // projection is rebuilt on every poll, locale change and playback request.
  const series: Series[] = [{ ...showcase, tracks: [...showcase.tracks], clips: [] }];
  for (const clip of clips) {
    let group = series.find((item) => item.id === clip.seriesId);
    if (!group) {
      group = { id: clip.seriesId, title: clip.title, tracks: [], clips: [] };
      series.push(group);
    }
    group.clips.push(clip);
    group.tracks.push({
      id: clip.id,
      title: clip.title,
      url: clip.audioUrl,
      language: clip.sourceLanguage || clip.detectedLanguage,
      duration: clip.duration,
      translations: clip.translations,
    });
  }
  const active = series.find((item) => item.id === selected) ?? series[0]!;
  return (
    <>
      <header className="site-header">
        <a href="/" className="brand" aria-label={`${t('brand')} ${t('studio')}`}>
          <img className="brand-logo" src="/brand/ollang-logo.svg" alt="" width="102" height="32" />
          <span className="brand-divider" />
          <span className="brand-studio">{t('studio')}</span>
        </a>
        <label className="site-language">
          <Globe2 size={17} />
          <select
            aria-label={t('siteLanguage')}
            value={locale}
            onChange={(event) => chooseLocale(event.target.value as Locale)}
          >
            {locales.map((code) => (
              <option value={code} key={code}>
                {nativeNames[code]}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main>
        <section className="hero">
          <div>
            <h1>
              {t('headline')}
              <br />
              <span>{t('headlineAccent')}</span>
            </h1>
            <p>{t('intro')}</p>
          </div>
          <button className="start-series" onClick={() => setRecorder({})}>
            <span className="start-icon">
              <Mic size={27} strokeWidth={1.5} />
            </span>
            <span>
              <strong>{t('startSeries')}</strong>
              <small>{t('firstClipHint')}</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        </section>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" aria-label={t('dismiss')} onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {pollFailed && (
          <p className="notice" role="status">
            {t('errorNetwork')}
          </p>
        )}
        <div key={active.id} className="active-series">
          <Player
            title={active.title}
            tracks={active.tracks}
            locale={locale}
            onAdd={() => setRecorder({ seriesId: active.id, title: active.title })}
            onError={setNotice}
            suspended={Boolean(recorder)}
            requestedTrack={requestedTrack}
            renderTranslation={(trackId) => (
              <Progress
                key={trackId}
                clips={active.clips.filter((clip) => clip.id === trackId)}
                checkedAt={checkedAt}
                pollFailed={pollFailed}
                enabled={liveEnabled}
                onUpdate={() => setRevision((value) => value + 1)}
                onError={setNotice}
              />
            )}
          />
          {active.clips.length > 0 && (
            <details
              className="clip-details"
              open={
                active.clips.some(
                  (clip) =>
                    !clip.automaticTranslation &&
                    clip.confirmationRequired &&
                    clip.status !== 'analyzing',
                ) || undefined
              }
            >
              <summary>{t('recordingDetails')}</summary>
              {active.clips.map((clip) => (
                <ClipRow
                  key={clip.id}
                  clip={clip}
                  onPlay={() => requestPlayback(clip.id)}
                  onUpdate={() => setRevision((value) => value + 1)}
                  onError={setNotice}
                />
              ))}
            </details>
          )}
        </div>
        <section className="story-library" aria-labelledby="stories-title">
          <div className="library-heading">
            <h2 id="stories-title">{t('allStories')}</h2>
            <span>{t('libraryHint')}</span>
          </div>
          <div className="series-list">
            {series.map((item) => (
              <article key={item.id} className="series-row">
                <button
                  className="series-open"
                  aria-current={item.id === active.id ? 'true' : undefined}
                  onClick={() => {
                    const first = item.tracks[0];
                    if (!first) return;
                    requestPlayback(first.id, true, true);
                    selectSeries(item.id);
                  }}
                >
                  <span className="series-play-icon">
                    <Play size={18} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {t('clipCount', {
                        count: item.tracks.length,
                      })}{' '}
                      · {formatTime(item.tracks.reduce((sum, track) => sum + track.duration, 0))}
                    </small>
                  </span>
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setRecorder({ seriesId: item.id, title: item.title })}
                >
                  <Plus size={16} />
                  {t('addClip')}
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <span>{t('localFooter')}</span>
        <span>{t('prototypeFooter')}</span>
      </footer>
      {recorder && (
        <RecorderModal
          seriesId={recorder.seriesId}
          title={recorder.title}
          onClose={() => setRecorder(null)}
          onSaved={(clip) => {
            setClips((previous) =>
              previous.some((item) => item.id === clip.id) ? previous : [...previous, clip],
            );
            selectSeries(clip.seriesId);
            requestPlayback(clip.id, false);
            setRecorder(null);
            setNotice('');
            setRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
