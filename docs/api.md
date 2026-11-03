# Local API

The Node API serves the browser and [local application CLI](../examples/README.md) on the
same loopback app port. Provider credentials belong to the server configuration;
clients do not send an Ollang key. This API has no user authentication and is not
intended to be exposed publicly.

| Method/path                        | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/health`                  | HTTP liveness and whether provider calls are configured                      |
| `GET /api/config`                  | Detector state and configuration-presence booleans                           |
| `GET /api/clips`                   | Clips in series order, including public translation states/captions          |
| `POST /api/clips`                  | Save canonical WAV and enqueue local detection                               |
| `PATCH /api/clips/:id`             | Confirm/correct `{ "sourceLanguage": "en" }` after detection                 |
| `POST /api/clips/:id/detect`       | Retry local detection when translation has not locked the source             |
| `POST /api/clips/:id/translations` | Request `{ "targets": ["pt", "zh"] }` using the server key; consumes credits |
| `POST /api/translations/:id/check` | Reconcile/collect eligible existing work without a new order                 |
| `GET /api/clips/:id/audio`         | Saved original WAV, including byte-range playback                            |
| `GET /api/translations/:id/audio`  | Completed, validated dubbed WAV                                              |

Clip and translation response types are defined in
[shared/contracts.ts](../shared/contracts.ts) and
[shared/translations.ts](../shared/translations.ts). Provider IDs, keys
and signed asset URLs are not public response fields. The browser polls the local
clip list; only the worker polls Ollang.

## Saving audio

`POST /api/clips` accepts a raw `audio/wav` body: mono, 48 kHz, signed 16-bit PCM,
1–120 seconds, at most 12 MiB. Browser imports are decoded/edited before this
boundary; this route is not a generic compressed-file upload endpoint.

Required headers are `X-Submission-Id` (UUID) and `X-Clip-Title` (URI-encoded,
nonempty, at most 80 characters). Optional `X-Series-Id` appends to an existing
series; omission starts a new series using the submission UUID. The bundled `showcase` series can also receive a local continuation.

The browser sends `X-Auto-Translate: true` to persist translation intent. After
confident detection (or manual source confirmation), the server queues English,
Portuguese and Chinese, excluding the source language. Without a configured key,
the intent remains saved and can resume after the key is configured and the app
restarts. Existing recordings default to manual submission; simply adding a key
does not translate historical recordings. API/CLI clients omit this header for
manual translation or send `false` explicitly.

A new save returns 201. Repeating the same UUID with identical audio, title, automatic-translation setting and
series returns the existing clip with 200. Reusing it for different content is a
409 conflict. Keep the UUID stable across an uncertain save response.

## Translation and errors

Translation requires a confirmed source language and configured provider key.
Targets are deduplicated and exclude the source language. Repeating a request
uses the existing clip/target job. A 202 response means work was accepted locally,
not that a dub is ready. Observe the job state and use [recovery](provider-recovery.md)
for unknown/attention outcomes. Source correction is locked once provider work
exists, preventing a saved project from being reused under a new language.

`audioUrl` may be present while a job is `collecting`, or in `attention` after
caption collection stops. It is exposed only after validated audio is saved;
`duration` describes that local WAV. Do not infer audio availability solely from
`state === ready`. Caption tracks can arrive independently and retain their own
delivered audio timelines. Rechecking an existing order preserves collected audio.

Errors use JSON `{ "error": "stable_code" }` and an appropriate HTTP status:
400 for invalid requests, 404 for unavailable IDs, 409 for state/idempotency
conflicts, 413/422 for size/audio validation, 429 for a full local queue, and 503
when translation is not configured. The UI maps codes to localized messages;
raw provider responses are never returned to the client.
