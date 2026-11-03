# Connect Ollang

The bundled player works without credentials. To translate your own recordings,
create a **free developer account** at
[developers.ollang.com](https://developers.ollang.com) and obtain an API key
through the developer portal. Account signup is free; translation uses Ollang
credits. Check the portal for your balance, current pricing, and any allowance
applicable to your account.

## Put your key in the local environment

Create `.env` from `.env.example` if it does not already exist, then edit `.env`
locally. Only the key is needed for the default workflow:

```dotenv
OLLANG_API_KEY=your-api-key
```

The value above is a placeholder, not a working key. `.env` is ignored by Git and
excluded from Docker builds and public source exports. On macOS/Linux, restrict
its permissions with `chmod 600 .env`. Never put a key in `VITE_*` variables,
browser code, a screenshot, an issue, a terminal command, or an agent chat.

Recreate the app after editing the environment:

```sh
docker compose up -d --no-deps app
docker compose exec app node scripts/doctor.mjs
```

The key stays in the Node server. The browser receives only configuration-presence
booleans and public job states. `restart` alone does not load changed environment
values. Shell environment variables take precedence over `.env`.

**Before enabling a key on an existing installation:** new browser saves retain
automatic translation intent even if no key was configured. Confirmed, waiting
requests may start when the key becomes available. Existing queued jobs can also
resume. Older manual-mode clips require their **Translate audio** button. Keep the
original key/provider scope for unfinished jobs; see [recovery](provider-recovery.md).

## Verify access without submitting an order

```sh
docker compose exec app node --import tsx scripts/provider-preflight.mjs
```

With host Node installed, `npm run provider:check` does the same check using this
checkout's `.env`. It reads the credit wallet without uploading audio or creating orders.
Interface translation performs its own credit preflight.

A configured key is different from a verified key. HTTP 401 indicates an
authentication problem; HTTP 403 indicates permission restrictions. In particular,
a wallet-only 403 can mean missing billing permission, rather than an invalid
translation key. The preflight reports unknown credit availability as `null`,
not zero. The [wallet reference](https://api-docs.ollang.com/apis/ollang-api-reference/get-credit-wallet)
describes its required permissions. Diagnostics never print key values.

## Translate one short recording

1. Record or upload 3–5 seconds of clear, non-sensitive speech, then **Save**.
2. Whisper detects the spoken language on your local CPU. If uncertain, the
   player asks you to confirm the source before sending audio to Ollang.
3. The app automatically requests each supported non-source language:
   **English (`en`), Portuguese (`pt`), and Chinese (`zh`)**. An English recording
   creates Portuguese and Chinese dubbing jobs, using one source upload.
4. Watch the job rows and **Behind the translation**. A submitted order is not a
   completed audio file. Available renditions appear in **Listen in**; subtitles
   can arrive later. The original remains playable.

There is no per-upload target checklist. Changing site/listening/subtitle language
or playing bundled media creates no order. Saving a new clip with translation
enabled does. Review credit usage in your Ollang account; this app does not quote
prices or promise completion times, refunds, or a free-processing allowance.

The [local CLI](../examples/README.md) can list saved clip IDs without a key and
request selected targets with explicit `--submit`. It calls this app's durable
queue; it does not handle the provider key itself.

## API operations used here

The [Ollang API reference](https://api-docs.ollang.com/home) and
[API conventions](https://api-docs.ollang.com/concepts/api-conventions) describe
the service contract. The [provider adapter](../server/provider.ts) defines the
requests this particular application sends:

| Operation                                                                                  | Request                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                                                                             | Server-side `X-Api-Key` header                                                                                                                                                              |
| Base URL                                                                                   | `https://api-integration.ollang.com`                                                                                                                                                        |
| [Upload](https://api-docs.ollang.com/apis/ollang-api-reference/direct-file-upload)         | `POST /integration/upload/direct`; WAV, name, source language                                                                                                                               |
| [Create dubbing order](https://api-docs.ollang.com/apis/ollang-api-reference/create-order) | `POST /integration/orders/create`; `orderType: aiDubbing`, level 0, one target, `dubbingStyle: lipsync`                                                                                     |
| [Read status](https://api-docs.ollang.com/apis/ollang-api-reference/get-order-by-id)       | `GET /integration/orders/{id}`; verify saved project/type/languages                                                                                                                         |
| Reconcile uncertain creation                                                               | Saved IDs, [project lookup](https://api-docs.ollang.com/apis/ollang-api-reference/get-project-by-id), and [order listing](https://api-docs.ollang.com/apis/ollang-api-reference/get-orders) |
| [Translate interface strings](localization.md)                                             | JSON upload, `orderType: document`, then [content export](https://api-docs.ollang.com/apis/ollang-api-reference/export-content)                                                             |

`lipsync` is intentional for this audio example. This demo's three-language
selection is an application choice; see Ollang's
[supported-language catalog](https://api-docs.ollang.com/apis/ollang-api-reference/supported-languages)
for the wider provider catalog. Adding another app language requires catalog,
playback, submission, and test updates; changing a dropdown alone is insufficient.

Audio is collected from the order's audio artifact. Caption records preserve the
text language and the audio timeline they were delivered for. A dubbed parent
need not have a VTT; child captions may use the original timeline. The player can
apply a duration-based timing fallback, which does not establish word alignment.
Audio can play before all caption tracks are collected. See
[the integration walkthrough](integration.md) and [recovery](provider-recovery.md).

## Limits and data

This app accepts browser imports up to 20 MB, saves 1–120 seconds of canonical
48 kHz mono PCM WAV, and enforces a 12 MiB saved-file limit. These are application
limits, not a statement of Ollang's maximum upload size. Consult the current
[API conventions](https://api-docs.ollang.com/concepts/api-conventions) for service
limits and pagination. Account throttling and processing time are provider
behavior; the worker's backoff and two-hour review window are local policies.

Microphone capture, editing, and Whisper detection are local. An authorized
translation sends the saved recording and source-language metadata to Ollang;
interface catalog generation sends English UI strings. Collected outputs and
receipts are stored locally. Stopping/removing local containers does not delete
provider uploads. Consult the [Ollang Trust Center](https://trust.ollang.com/) and
your applicable terms for provider retention, deletion, and permitted output use.
Do not assume a repository code license grants rights to generated voices/media.

## Get help

For account, key, or billing questions, start at the
[developer portal](https://developers.ollang.com). For API problems, use Ollang's
[troubleshooting guide](https://api-docs.ollang.com/troubleshooting) and
[status page](https://status.ollang.com). The official documentation lists
**info@ollang.com** for provider support. Share request/project/order IDs privately
when required; redact keys, signed URLs, private recordings, and transcripts.

For this repository's reproducible application bugs, use its GitHub Issues tab
and the [bug-report guidance](../CONTRIBUTING.md). Potential vulnerabilities belong
in the private route described in [SECURITY.md](../SECURITY.md).
