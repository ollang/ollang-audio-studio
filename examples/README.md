# Local application CLI

This script calls the running Audio Studio API on your computer. The server owns
the Ollang key, job receipts and polling; the script reads no key and makes no
direct Ollang requests. For the server-to-server integration, read the
[Ollang walkthrough](../docs/integration.md).

Use Node 22.17+ and [start the app](../docs/getting-started.md). These commands run
from the repository root; the CLI needs no additional npm dependencies.

## Find a saved clip — read-only

Save a recording in the web app, then run:

```sh
node examples/translate-clip.mjs --list-clips
```

This performs only `GET /api/clips` and prints a JSON list of local clip IDs,
titles, language codes, durations, statuses and confirmation flags. It makes no
translation request and requires no Ollang key. `[]` means no saved clips; the
bundled preview series is not a saved recording. Titles may contain your private
content, so review the output before sharing it.

New web recordings normally translate automatically after source detection or
confirmation when the server has a key. Listing is read-only, but the earlier
web Save may already have queued work. Use this CLI's submission mode for a
manual-mode recording or intentionally missing target; do not submit a second
path merely because automatic work is still processing.

Copy a clip's `id` for the next command. It must have `status: "ready"` and
`confirmationRequired: false`; otherwise finish detection or confirm the spoken
language in the app. A displayed language alone does not establish readiness.

## Request a translation — uses Ollang credits

Configure the running server with your own key following [Ollang setup](../docs/ollang.md).
Replace `YOUR_LOCAL_CLIP_UUID` with the ID from the list:

```sh
node examples/translate-clip.mjs --clip YOUR_LOCAL_CLIP_UUID --target pt --submit
```

The current client accepts `en`, `pt` and `zh`; choose a target different from
the clip's source language. Repeat `--target` for another language. This is the
app's current selection, not Ollang's full language catalog.

`--submit` is required because the command requests paid provider work. It sends
one request to the app's `/api/clips/:id/translations` route, which queues one job
per new target. The printed states mean accepted/current local work, not finished
translations. Watch completion and listen in the web app. Repeating the same
clip/target request uses the existing job; the script does not create a separate
direct Ollang order or bypass unknown/failed job states.

## Options and failures

```sh
node examples/translate-clip.mjs --help
node examples/translate-clip.mjs --list-clips --port 4320
```

Use `--port` on either mode when the app's loopback port differs from 4310.
Listing cannot be combined with `--clip`, `--target` or `--submit`. Invalid
arguments and app/network errors exit unsuccessfully. Check the app and port
first. After an uncertain submission, inspect the web app's existing job rather
than creating another clip or deleting receipts to retry; see
[job recovery](../docs/provider-recovery.md).
