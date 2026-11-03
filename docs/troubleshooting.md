# Troubleshooting

Start with the symptom below. Preserve saved audio and provider receipts while
investigating; a reset can lose work without cancelling anything at Ollang.

| Symptom                                  | Check and next action                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker is unavailable                    | Start the engine; check `docker info` and `docker compose version`.                                                                                                                                                        |
| Port 4310 is occupied                    | Set an unused `APP_PORT` in `.env`, recreate `app`, and open that port.                                                                                                                                                    |
| Detector is loading                      | First start downloads the pinned model. Check `docker compose ps` and `docker compose logs --tail 80 audio`, then wait/check again.                                                                                        |
| Detector is unavailable or uncertain     | Confirm the spoken language in the player. Restore the audio service for future detection. A detection failure does not justify guessing a language.                                                                       |
| Microphone is unavailable                | Use localhost; check browser and OS microphone permission and any other app holding the device. Upload a file as an alternative.                                                                                           |
| Imported audio is rejected               | Check duration/size and browser codec support. Imports are limited to 20 MB/two minutes; saved clips must be 1–120 seconds and canonical WAV.                                                                              |
| New save is not translating              | Check the visible Whisper/confirmation state and server key configuration. New recordings translate automatically after a confident result or confirmation; no target checklist is needed.                                 |
| An older recording is waiting            | Legacy manual-mode recordings use **Translate audio** once. New automatic-mode recordings retain intent and can resume when a key is configured.                                                                           |
| Key was added but remains unconfigured   | Recreate `app` with `docker compose up -d --no-deps app`; `restart` does not reread `.env`. Check whether shell values override the file.                                                                                  |
| Key is present but provider access fails | Use `provider:check` below. HTTP 401 and 403 are different; wallet-only permission denial can leave credit availability unknown.                                                                                           |
| Developer signup link does not open      | Confirm <https://developers.ollang.com> and network/DNS access. The example and local editor still work without signup. Use [official API help](https://api-docs.ollang.com/troubleshooting) for account access questions. |
| Translation needs review                 | Expand **Behind the translation** and follow [recovery](provider-recovery.md). Do not delete receipts or blindly submit a replacement.                                                                                     |
| Selected listening language is absent    | Its audio is not collected for this clip. The original remains available; changing a preference creates no order.                                                                                                          |
| Audio is ready but subtitles are missing | Caption collection can lag audio. Keep the job/receipts and follow recovery; re-uploading can create duplicate paid work.                                                                                                  |
| Subtitle text uses English               | The requested text is unavailable and the player identifies its actual fallback language. Audio and subtitle choices are independent.                                                                                      |
| Unsaved edits disappeared after reload   | Drafts are in browser memory. Saved recordings persist; unsaved edits do not.                                                                                                                                              |
| Native UI cannot reach the API           | Run both processes with `npm run dev`; check ports 4310/4311 and any `PORT` override.                                                                                                                                      |
| Browser tests cannot start               | Free port 4315, build first, and install Chromium with `npx playwright install chromium`. On Linux CI, install its system dependencies too.                                                                                |
| Catalog check fails                      | Run `npm run localize -- plan`; review missing/stale keys or placeholder errors before authorizing an update.                                                                                                              |

## Presence and access checks

For the normal Docker installation:

```sh
docker compose exec app node scripts/doctor.mjs
docker compose exec app node --import tsx scripts/provider-preflight.mjs
```

`doctor` checks local app/detector readiness and presence flags. `provider:check`
performs read-only Ollang requests; it does not upload or create an order. It
checks wallet access and can report unknown permissions
or credits. Neither command displays key values. Native development can run
`npm run doctor` and `npm run provider:check` on the host; see
[configuration](configuration.md).

## Report a problem

Include reproduction steps, expected/actual behavior, the stable error code,
OS/architecture, browser, Docker/Compose or Node version, and source version.
Use the repository's bug-report template with a short synthetic fixture if needed.
Do not attach `.env`, raw provider responses, private IDs, signed URLs, personal
audio or transcripts. Check logs before sharing them. Security reports use
[the private route](../SECURITY.md); provider account issues use [Ollang support](ollang.md#get-help).
