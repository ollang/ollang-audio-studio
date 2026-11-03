# Install and review with an agent

Use these prompts with an agent that can read this checkout and run local
commands. `AGENTS.md` holds the shared rules; `CLAUDE.md` imports them and
`.github/copilot-instructions.md` points to them. Tools differ in how they load
instructions, so every prompt explicitly asks the agent to read the files.
You do not need a separate skill or a credential-handling plugin to run the app.

## Installation prompt

Copy this into a new agent session opened in the repository:

```text
Read AGENTS.md, README.md and docs/getting-started.md. Install and run this
repository locally with Docker Compose. Execute the setup, do not just give me
commands. Preserve existing .env files, recordings, receipts and volumes. Use
only this standalone checkout; do not copy credentials from another project.

Check Docker/Compose and the available app port. Create .env from .env.example
only if absent and keep it private. The default goal is the full translation
workflow: configure the key before starting the app. If a key is already present,
preserve it and do not save test recordings against that installation without
an approved provider scope.

If I have no key configured, tell me:
"Create your free Ollang developer account at https://developers.ollang.com and
obtain your API key. Put it in this checkout's .env as OLLANG_API_KEY.
Do not paste the key into this chat. Reply 'ready' when you have saved the file."
Include the absolute local .env path and wait for my confirmation. If I choose
to skip account/key setup, start the key-free preview instead.

When I confirm, verify presence without printing values. Build the app image if
needed for the one-off presence check; that check does not start the worker.
Before starting/recreating an existing install with a key, inspect any saved
automatic translation requests or queued work. Enabling the key may start/resume
them. Summarize counts/targets without dumping private titles or transcripts.
Obtain approval for provider work not already authorized by my instructions.
A key's presence alone is not consent to submit audio.

Build/start the app with the chosen configuration, or recreate it if already
running so its server receives the environment. Confirm the exact local URL,
app reachability, bundled playback, and Whisper readiness. A loading detector is
not a completed readiness check. Use presence-only diagnostics and the read-only
provider preflight when a key is configured; report unknown credits/permissions
accurately. Do not print .env, expanded Compose configuration, provider receipts,
signed URLs or key values. Never put keys in browser code or commit them.

Do not submit a live recording or generate interface translations unless I
explicitly ask. Tell me that saving a new recording with the key enabled requests
automatic English/Portuguese/Chinese translations and uses Ollang credits. Leave
it ready for me to perform the first live test. Report the final URL, app/detector
readiness, key presence/access status, and anything not verified.
```

The agent can use the [one-off presence check](configuration.md#verify-presence-before-starting-provider-work)
before recreating the app. It prints booleans and does not start a worker.

The agent should ask for information only where needed: missing dependencies it
cannot install, a port conflict it cannot resolve safely, private key placement,
or authorization for provider work. Your explicit choices apply throughout the
session; it should not ask the same approval repeatedly.

## Live-test prompt

After installation, either test manually using [the first-clip instructions](getting-started.md#translate-a-first-clip)
or explicitly authorize a bounded agent-run test:

```text
Read AGENTS.md and docs/ollang.md. Use the existing configured key without
printing it. Translate one approved fixtures/short/en.wav recording through the
running app into Portuguese and Chinese: one source upload and two top-level
dubbing orders, plus any automatic child orders created by Ollang. Use a separate
new series named "Live translation check" so the bundled story is unchanged.

Tell me before submission if this scope cannot be followed. Check readiness and
inspect existing work first; never repeat an uncertain provider POST or erase
receipts to retry. Save through the app with automatic translation enabled, watch
detection/confirmation and both jobs, then verify collected audio and captions.
Report actual submissions, completion/attention states and playback evidence.
Leave translated meaning, voice quality and subtitle synchronization for my
listening review. Do not request replacement/QC/revision orders or publish files.
```

This prompt authorizes credit-consuming work; the installation prompt does not.
Automatic provider child orders are distinguished from the two requested dubs.
Use the [CLI example](../examples/README.md) only for a manual-mode saved clip;
do not add a second manual submission to a clip already translating automatically.

## Fresh-install verification prompt

Use a new export/checkout rather than the already-running workspace:

```text
Read AGENTS.md and docs/getting-started.md. Follow the README from a fresh copy,
using a distinct Compose project and an unused APP_PORT. Keep keys blank; do not
copy a key or .env from another checkout. Preserve all existing Docker volumes.

Record OS/architecture and Docker/Compose versions. Run the documented setup,
verify the final URL, app health, Whisper readiness, bundled playback in all
three languages, site/subtitle choices, and a short local record/import/edit/save.
No live provider calls are authorized. Record any waiting automatic intent left
by saving audio; do not enable a key or silently remove data afterward.

Check stop/start persistence using only your new project. Record exact commands,
exit results, readiness and any manual intervention. Report broken instructions
before fixing them. Stop only the services you created; do not use down -v.
Do not claim Windows, other browsers, physical microphones, or fresh-account
signup were verified unless you actually tested those paths.
```

For isolation, set an unused `APP_PORT` in the fresh copy's `.env`, then use the
same project selection on **every** command, for example:

```sh
docker compose -p studio-install-check --env-file .env up --build -d
docker compose -p studio-install-check --env-file .env exec app node scripts/doctor.mjs
docker compose -p studio-install-check --env-file .env stop
```

Project names create separate named volumes. Keep any checkout/data needed to
review the result; do not delete someone else's project or reuse its volume.

## Independent-review prompt

```text
Review this standalone candidate as an external developer evaluating a public
Ollang reference repository. Read AGENTS.md and the public guides. Report findings
before making changes. Inspect structure, strict types/input validation, SQL and
media boundaries, secrets, automatic-translation intent, provider receipts and
recovery, editor resource cleanup, playback state, subtitle provenance, app
localization, dependency/media rights and installation usability.

Run checks and critical browser workflows with isolated data and fake providers.
Do not adopt the builder's test claims. Do not use a live key, submit Ollang orders,
publish, or modify the owner's running app. Verify that key-free installation and
agent instructions are understandable from this checkout alone. Distinguish bugs,
missing company decisions, unverified environments and preferences. Give file/line
evidence, impact, severity, reproduction steps and checks a fix should rerun.
```

## What a completed handoff contains

Return the source revision/checksum, commands/results, URL, configuration-presence
checks, tested environments, remaining failures, and any provider scope actually
used. Keep logs/screenshots synthetic and redact private data. Distinguish a
working installation, automated regression results, live-provider evidence, and
human listening acceptance. None alone establishes the others.
