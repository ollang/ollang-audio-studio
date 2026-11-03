# Use the audio studio

The default example is a story continued by different speakers. You can follow
all clips in English, Portuguese, or Chinese, or hear each original recording.
The same player handles recordings you add locally and outputs collected from
Ollang. See [setup](getting-started.md) to run the app.

## Listen and compare

- **Site language** changes the interface. Browser language is detected on first
  visit; an explicit choice is remembered.
- **Recorded in** identifies the current clip's source language.
- **Listen in** selects an available audio rendition. **Original audio** follows
  each clip's original voice/language. Only playable translated versions appear.
- **Subtitles in** follows the site language by default. Select another available
  subtitle language or **Off**; this does not change or pause the audio.

Playing a bundled sample and changing any language preference create no Ollang
order. The player runs clips in sequence. Changing the listening language loads
that version of the current clip from its beginning: active playback resumes;
paused or stopped playback stays paused/stopped. Choosing a story's play button
in **All stories** selects it and starts the first clip; choosing it again restarts
that story. A page reload does not autoplay.

Your listening preference can be unavailable on a newly uploaded clip. In that
case, the original plays and the UI identifies the actual language. Subtitle
text has its own availability and English fallback. Audio can become playable
before all subtitle tracks are collected. See [caption timing policy](architecture.md#playback-and-localization)
for the difference between a text language and an audio timeline.

## Start or continue a series

**Start a series** creates a new story. **Add a clip to continue the series**
appends to the current one. Both open the same recorder/editor.

Record with microphone permission, or choose **Upload audio** and an audio file.
Browser imports accept WAV, MP3, M4A, OGG, and WebM up to 20 MB/two minutes; actual
codec decoding depends on the browser. A short, clear spoken clip is best for a
first translation. **Try an example recording** loads an existing bundled take;
it does not generate speech or call a provider.

Preview before saving. **Edit** supports trimming to a selection, removing a
section, changing volume, and fades. You can add another take, undo, and redo.
Undo first backs out an uncommitted pane preview; it does not require a discard
confirmation. Closing a dirty editor asks whether to discard the draft.

**Save** writes a canonical WAV and starts local Whisper detection. Finished
clips must be 1–120 seconds. Saved media persists; unsaved editor drafts are only
in memory and do not survive a page reload.

## What happens after Save

With a configured key, Save requests automatic translation into the supported
non-source languages. An English source requests Portuguese and Chinese. A
Portuguese source requests English and Chinese; Chinese requests English and
Portuguese. You do not choose translation targets for every upload.

1. **Audio uploaded / Whisper detection:** the file is saved locally and Whisper
   identifies the spoken language.
2. **Confirmation, if needed:** if speech/language is uncertain or detection is
   unavailable/interrupted, the player asks you to select and confirm the source.
   Ollang work waits until that confirmation. Source choices are independent of
   the three listening languages and include Whisper's other source languages.
3. **Ollang processing:** per-language rows show upload, submission, provider
   processing, and output collection. **Behind the translation** expands the
   activity history. The browser reads local progress; the server polls Ollang.
4. **Ready to listen:** delivered versions become available. Captions can arrive
   separately; select audio/subtitles independently and review the result.

Translation consumes Ollang credits. Without a key, capture/edit/save/detection
remain usable, and no provider job starts. Automatic intent is still stored:
configuring a key later can start eligible waiting requests. Older manual-mode
recordings instead have one **Translate audio** button. Read [Ollang setup](ollang.md)
before enabling a key on an existing library.

## Pause work and return later

A normal Compose stop/start or app recreation retains the SQLite/media volume.
Known translation jobs can resume after restart; the worker does not blindly
repeat an uncertain upload/order. If a job needs review, expand its history and
follow [recovery](provider-recovery.md). Do not delete recordings or receipts as
a way to retry provider work.

For missing permissions, decoding errors, loading detection, fallback languages,
or unavailable outputs, use [troubleshooting](troubleshooting.md). Share only
synthetic, redacted examples in bug reports.
