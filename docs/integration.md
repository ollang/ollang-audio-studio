# How the Ollang integration works

The provider boundary is small: **upload a recording → create a dubbing order →
read its status → collect audio and subtitles**. The rest of Audio Studio makes
that flow usable as a persistent local application.

Start with [Ollang setup](ollang.md) to configure your account/key, or
[the local CLI](../examples/README.md) to operate the running demo. This guide
explains the actual server-side code; reading it submits no provider work.

## Read these files first

| File                                                  | Responsibility                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| [Provider](../server/provider.ts)                     | Authenticated upload, order creation/status and app-string export |
| [Translation worker](../server/translation-worker.ts) | Submit once, poll, validate and collect output                    |
| [Translation store](../server/translation-store.ts)   | SQLite source/job receipts and interrupted-work recovery          |
| [Asset helpers](../server/provider-assets.ts)         | Bounded downloads and subtitle parsing                            |
| [Playback policy](../src/playback.ts)                 | Choose a rendition and caption language/timeline                  |

Ollang supplies translated voices and subtitle outputs. Whisper detects source
speech locally. Recording/editing, series order, SQLite, progress UI and playback
policy belong to this app. Its framework, database and editor are not required
to use Ollang in another project.

## 1. Upload the saved audio

`Provider.upload(bytes, clipId, language, signal)` sends the saved WAV using
`POST /integration/upload/direct`. Its multipart body contains `file`, `name`,
and `sourceLanguage`. The file has a `.wav`
filename. The adapter validates the response and returns its `projectId`.

The recording has already been edited, converted to 48 kHz mono PCM WAV and
assigned a confirmed source language. Those are this application's input choices.
The worker uploads that clip once and reuses the project for its target jobs.

## 2. Request dubbing for a target

`Provider.create(projectId, source, target, signal)` sends this JSON shape to
`POST /integration/orders/create`:

```json
{
  "orderType": "aiDubbing",
  "level": 0,
  "projectId": "PROJECT_ID_FROM_UPLOAD",
  "sourceLanguage": "en",
  "targetLanguageConfigs": [{ "language": "pt", "isRush": false }],
  "dubbingStyle": "lipsync"
}
```

This is the current adapter's request shape; replace the project ID with the
upload receipt when adapting it. `lipsync` is the chosen setting for this example. One local
job requests one target; multiple targets reuse the source project. Ollang may
create child transcription/subtitle orders as part of the pipeline. The returned
`orderId` values are receipts, not audio; the adapter returns the distinct IDs.

Authentication stays in Node: `Provider.request` supplies `X-Api-Key` from the
server configuration. Neither the browser nor the local CLI receives that key.

## 3. Poll the matching order

`Provider.order(id, signal)` reads `GET /integration/orders/{id}`. The worker
checks project, order type, source and target before using an order as the dubbing
parent. If necessary, `Provider.projectOrders` looks up the project and scans
bounded pages of orders, filtering by project identity.

The worker checks status on its normal five-second interval, with bounded backoff
on errors. This is a polling policy, not an Ollang completion-time guarantee.
The browser polls the **local API** for progress; it does not poll Ollang itself.
Provider status and local job state are separate: `completed` can still mean the
app is collecting or waiting for usable output.

## 4. Collect audio and captions

After parent completion, the worker finds `created_ai_dub_audio` in `orderDocs`,
with `created_ai_dub_vocals_only_audio` as its fallback. It accepts equivalent
camelCase names. It downloads the artifact without forwarding the API key,
normalizes it through the private audio service, validates the WAV, then writes
the local rendition. Download/validation limits are app policy, not provider SLAs.

Completed `cc` and `subtitle` children provide `vttUrl` caption files. The current
worker waits for both source and target text before marking a job `ready`. A
validated dub is playable as soon as its file is saved, including while the job
is `collecting`. Valid caption tracks are saved independently. Bounded retries
reuse the saved audio; missing/malformed captions can require review without
withholding playback. Checking the existing order resumes collection without
another upload or paid order. The provider's general caption-output guarantees
remain an account/contract question; audio availability does not depend on them.

Each caption stores both **text language** and **audio timeline language**.
Child captions retain the original recording's timeline; a VTT on the dubbing
parent is assigned to the dubbed timeline. The player prefers matching timing
and otherwise may scale cues using total rendition durations. Scaling does not
establish word alignment; showcase subtitles still need listening review.

## Why the worker keeps receipts

A short sequence of API calls explains the integration, but an interrupted POST
may have succeeded remotely. The worker records write intent before submitting,
saves returned project/order IDs, and validates them before collecting. Existing
clip/target jobs are reused. Polling and collection can resume; uncertain writes
are reconciled rather than blindly repeated. An uncertain source upload is held
for review. The [recovery guide](provider-recovery.md) explains operator actions.

When adapting this example, begin with `Provider.upload`, `Provider.create` and
`Provider.order`. Keep credentials on your server and retain project/order IDs in
your own durable storage before adding retries. Reuse the worker if its local
queue policy fits, or implement your own queue around the same provider boundary.
Do not copy a happy-path loop and add automatic POST retries.

## The same provider also localizes the interface

Audio translation is requested by a new web Save with automatic intent (or a
legacy/manual API submission). It begins after confident source detection or
confirmation. Interface translation is a separate development workflow:

1. Authors edit stable keys in `locales/en.json`.
2. `npm run localize -- plan` computes missing/stale entries locally.
3. An explicitly authorized `submit` uploads JSON with `Provider.uploadStrings`
   and creates a `document` order using `Provider.createDocument`.
4. `collect` checks saved orders, calls `Provider.exportStrings` and validates
   keys, interpolation placeholders and English source hashes before installing.
5. The app bundles those JSON catalogs; i18next selects them in the browser.
   Changing site language creates no provider order.

See
[app localization](localization.md) for commands, receipts and extension rules.
`submit` creates paid work; `collect` reads and installs results from saved orders.

## Try and review without provider charges

For a no-charge exploration, keep the app key blank, use the bundled player or
save a local clip, then run the [read-only CLI listing](../examples/README.md#find-a-saved-clip--read-only).
It shows local UUIDs and confirmation state. That new save can retain automatic
intent and start later if a key is configured. To test manual CLI submission,
use a manual-mode saved clip and explicit `--submit`; this uses credits. A web Save
with the key enabled already requests automatic work and needs no second submission.

For isolated verification, use `npm run check`, `npm test` and `npm run build`.
The tests use local provider doubles, including interrupted submissions and
collection. They do not establish live-provider or human audio acceptance.
See [testing](testing.md) for the full browser/audio checks.

The request shapes above are defined by the linked source and mapped to
[Ollang's API documentation](https://api-docs.ollang.com/home). This example uses a
small REST adapter shared by audio and UI catalog work; it does not require a
second SDK or an Ollang client library in the browser. Keep your provider boundary
and durable queue separate when adapting it.
