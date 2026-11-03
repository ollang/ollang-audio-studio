# Architecture

The project deliberately uses a small browser/API boundary and a separate CPU
audio service. It runs without sibling repositories, accounts or a hosted database.

```text
React browser ── local API ── Node + SQLite ── Ollang REST API
                              │      │
                          WAV files  durable job receipts
                              │
                     Python + Whisper + FFmpeg
```

## Code map

| Directory               | Responsibility                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| `src/`                  | React interface, microphone capture, editor, player, locale preference |
| `src/editor/`           | Non-destructive edit model and Web Audio preview                       |
| `server/`               | Local API, persistence, provider adapter and job worker                |
| `shared/`               | Boundary types, input schemas, limits and state names                  |
| `migrations/`           | Ordered SQLite schema upgrades                                         |
| `audio-service/`        | Canonical audio validation, CPU detection, provider normalization      |
| `locales/`              | English source, generated translations, source-hash manifest           |
| `scripts/localization/` | Developer-only catalog generation and receipts                         |
| `examples/`             | Small entry points using the same durable application path             |
| `tests/`                | Unit/API integration and browser workflows                             |

## Recording and editing

`Capture` owns MediaRecorder, microphone tracks and AudioContext lifetime. Its
generation counter ignores late permission results after cancellation. React
owns the UI state rather than the browser media resources themselves.

The editor retains original takes and records pieces, selection and volume
automation. Preview and export evaluate the same edit model. Saving creates one
48 kHz mono PCM WAV; language detection and the provider receive those saved
bytes. Browser imports may be compressed files up to 20 MB; the saved canonical
audio is limited to 1–120 seconds and 12 MiB.

## API and storage

`createApp()` accepts explicit dependencies so tests can use temporary storage and
a local provider boundary. Input schemas validate metadata before writes. A
submission UUID and content hash make upload retries idempotent. Original WAVs
are written to unique staging files, flushed and atomically published before the
clip row is added. An incomplete uncommitted original can be replaced on retry;
a complete orphan is adopted only when its bytes match. Committed audio and
conflicting submissions are preserved. SQL uses bound
parameters. Migrations use SQLite transactions and `user_version`.

The [local API reference](api.md) describes headers, idempotency, response states
and errors without requiring a reader to inspect every route first.

New browser saves persist automatic-translation intent alongside the clip. A
confident Whisper result queues the supported languages; uncertain or interrupted
detection requires source confirmation first. Restart repairs confirmed intents
that were not yet queued. Unique clip/target receipts prevent duplicate orders.
Legacy recordings remain manual unless a client explicitly requests translation.

One Node process owns a data volume. SQLite stores clips, sequence positions and
job receipts; media stays in files. This avoids an extra database/queue service
for a single-user local example. It is not a multi-worker database design.

## Provider work

`Provider` is a typed REST boundary, not a job manager. `TranslationWorker` commits
write intent before calling Ollang and persists returned IDs before polling.
The worker validates project, source, target and order type before collecting
output. Downloads resolve/pin public HTTPS IPv4 addresses and carry no API key
to asset hosts. Unknown writes are reconciled rather than repeated.

Validated audio is atomically saved and made playable before caption collection.
Each validated caption track is persisted separately. Partial collection survives
restart and retry exhaustion; a caption issue never deletes collected audio.

See [recovery states](provider-recovery.md) and [Ollang requests](ollang.md).

## Playback and localization

Each clip can have an original and completed translated renditions. Audio choice
is independent of caption text language. The subtitle dropdown follows the site
language by default, offers delivered caption languages and Off, and remembers an
explicit choice across clips and reloads. Changing subtitles does not reload or
pause audio. If a chosen language is missing for a clip, the existing English
fallback identifies the actual text language. Captions retain their delivered audio
timeline in storage. The player prefers exact timing; a computed fallback scales
another rendition's cues by the ratio of saved audio durations. That preserves
relative positions and does not establish word-level alignment. Human review is
still required for showcase audio and subtitle synchronization.

The listening picker lists only playable languages for the current clip. A saved
or site preference without a rendition retains the original fallback policy, but
the picker displays the actual voice and the fallback message explains why.

Changing the listening language loads the selected version of the current clip
from its beginning. It resumes automatically only if audio was already playing;
paused, unstarted or finished playback stays stopped. Original audio follows the
same rule. The player reads the media element's state before replacing its source,
so a pause event and a language change cannot race through stale UI state.

The story-library play button selects the story and starts its first clip in the
current listening language. Repeated activation restarts that story; switching
stories stops the previous media element. Reloading alone does not auto-play.

The browser remembers the selected series alongside listening preferences.
Reloading restores that series once the local library loads. If the saved series
is absent from the current library, the three-clip showcase remains available.

`fixtures/showcase.json` is a small playback index generated from the conversation
asset manifest and delivered VTTs. `src/showcase.ts` adapts these prerecorded
renditions to the same player contract used by completed local jobs. This avoids
network/provider requests while retaining original caption timeline provenance.
Run `node --import tsx scripts/build-showcase.ts --check` to verify the index and
its source hashes, or omit `--check` to regenerate after an intentional asset edit.

i18next uses bundled catalogs, browser preference and a saved override. UI
localization is a developer command, never a visit-time paid operation. See
[app localization](localization.md).

## Scope and supported evidence

The app binds to loopback, has no login, and assumes a trusted local operator.
Chromium desktop/mobile emulation is automated. Safari, Firefox, physical devices,
Windows and all CPU architectures require their own verification before support
claims expand. [Testing](testing.md) separates automated checks from those reviews.
