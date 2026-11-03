# Install and run

For the full recording-to-translation workflow, create your
[free Ollang developer account](https://developers.ollang.com) and obtain an API
key before startup. Translation uses your account's Ollang credits.

If you only want to explore the bundled player, recorder/editor, uploads, and
local detection, use the optional key-free preview instead.

## Requirements

- Docker with the Compose v2 plugin or newer, with the engine running. Check
  `docker --version`, `docker compose version`, and `docker info`.
- Internet access for image/dependency installation, the first pinned Whisper
  model download, and any requested Ollang work.
- For the full translation workflow, a [free Ollang developer account](https://developers.ollang.com)
  and its API key. Obtain the key before startup; translation uses account credits.
  This requirement is optional for bundled playback and local-only exploration.
- A browser with microphone capture and Web Audio support. Automated browser
  coverage is Chromium desktop and mobile emulation; other browsers/devices need
  their own verification. Microphone access also needs browser/OS permission.

Docker supplies Node, Python, FFmpeg, and Whisper. Host Node is only needed for
native development and host-run tests. Language detection runs on the CPU; no GPU
is required by this configuration. The audio container's configured memory limit
is 1400 MiB and the app's is 384 MiB; allow room for Docker and image builds too.

## First start

Clone [ollang/ollang-audio-studio](https://github.com/ollang/ollang-audio-studio) or
download its source ZIP and open the repository root. On macOS/Linux,
for a **new checkout without an existing `.env`**:

```sh
cp .env.example .env
chmod 600 .env
```

On Windows PowerShell, create the file only if it is absent:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

For the full workflow, edit `.env` privately and set `OLLANG_API_KEY` to the key
from your developer account before starting. For key-free preview, leave the key
blank. Never
paste a key into chat or a terminal command.

Then start either installation with:

```sh
docker compose up --build -d
docker compose ps
```

Never overwrite an existing `.env`. Windows instructions are supplied for review;
a Windows clean installation has not been independently verified.

Open **<http://localhost:4310>**. If that port is occupied, set `APP_PORT=4320` in
`.env`, recreate the app, and open <http://localhost:4320>. Keep using the same
Compose project name and checkout for later commands; these identify its volumes.

The example player and editor work while the detector loads. Wait for the audio
service to become healthy before testing Whisper. Check readiness without printing
credentials:

```sh
docker compose exec app node scripts/doctor.mjs
```

`doctor` distinguishes a reachable app, detector readiness, and configuration
presence. A present key is not proof that the account accepts provider requests.
If the detector is loading, wait and check again; see [troubleshooting](troubleshooting.md).

## Explore without a key

Play **The Five-Minute Fix**. Its three original clips use English, Brazilian
Portuguese, and Mandarin. Compare English, Portuguese, and Chinese listening
versions with **Original audio**; change subtitles independently. Library play
starts a story's first clip. Listening-language changes restart the current clip
in that language and keep playing only if it was already playing.

You can also open the recorder, upload/import audio, edit, preview, and save.
Without a key, no Ollang audio job starts. **New saved clips retain automatic
translation intent**, though: enabling a key later can start confirmed clips that
were waiting. Unsaved drafts do not survive a reload.

## Enable audio translation

1. Create a [free Ollang developer account](https://developers.ollang.com) and
   obtain your API key through that portal.
2. Edit this checkout's ignored `.env` locally. Set `OLLANG_API_KEY` to your key.
   Do not paste the key into chat or commit the file.
3. Review any previously saved automatic translation requests. Enabling the key
   can start or resume eligible requests, including after a restart. Translation
   uses credits; free account signup does not promise a free-processing allowance.
4. Recreate the app so it receives the new environment:

   ```sh
   docker compose up -d --no-deps app
   docker compose exec app node scripts/doctor.mjs
   ```

5. For read-only account/credit diagnostics:

   ```sh
   docker compose exec app node --import tsx scripts/provider-preflight.mjs
   ```

The last command submits no orders. A wallet permission restriction can leave
credit availability unknown; see [Ollang setup](ollang.md). An absent `.env` inside
the container is normal: Compose passes its selected environment values to Node.

Compose recreates the app when its environment changes. `docker compose restart`
does **not** reread `.env`. Do not print expanded `docker compose config` when
keys are present; use `docker compose config --quiet` to validate syntax.

## Translate a first clip

Choose **Start a series** or **Add a clip to continue the series**. Record or
upload 3–5 seconds of clear, non-sensitive speech. Edit if needed, then **Save**.
Whisper detects its language locally. Uncertain detection shows **Confirm and
translate** in the player; choose the spoken language and confirm it.

Translation starts automatically into English, Portuguese, and Chinese, excluding
the source language. There is no target-language checklist. For example, an
English source requests two dubs: Portuguese and Chinese. The original remains
available. Progress appears below the player controls; expand **Behind the
translation** for the activity history. Audio and captions can arrive separately.

Choose an available listening language and subtitles, then compare Original audio.
Confirm real translation meaning, voice, ending, and subtitle timing yourself.
Older recordings saved before automatic mode use one **Translate audio** button
rather than submitting when a key is added.

## Update, stop, and keep your work

After source changes:

```sh
docker compose up -d --build --no-deps app
```

If audio-service dependencies changed, rebuild both services with
`docker compose up -d --build`. For an ordinary pause/resume:

```sh
docker compose stop
docker compose start
```

The `app-data` volume contains SQLite, recordings, collected audio/captions, and
provider receipts. `whisper-models` contains downloaded weights. Keep both.
`down -v` deletes volumes and is not part of normal setup/update instructions.
Use one app process per data volume. Do not change the key/provider scope for
unfinished jobs without reading [job recovery](provider-recovery.md).

See [configuration](configuration.md) for all variables, [development](development.md)
for native startup, or [agent instructions](agent-runbook.md) for an assisted install.
