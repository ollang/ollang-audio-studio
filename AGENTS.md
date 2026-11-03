# Agent guidance

This is a standalone, single-user local Ollang reference app. Start with
[README.md](README.md). For setup, follow [getting started](docs/getting-started.md)
and the [agent runbook](docs/agent-runbook.md). For implementation, also read
[architecture](docs/architecture.md). Use this checkout's files and services;
do not depend on a neighboring project or copy its credentials.

## Installation and keys

- Prefer Docker Compose: it supplies Node, Python, FFmpeg, and CPU Whisper. Check
  the engine and available port, preserve any existing `.env`, then build/start
  with the documented commands. Return the exact URL and app/detector readiness.
- For the default full translation install, configure the key before starting
  the app. If the key is missing, ask the user to create a free developer account
  at <https://developers.ollang.com>, obtain a key, and put it in **this checkout's
  ignored `.env`** as `OLLANG_API_KEY`. Give the absolute file path and wait for
  their confirmation. Never ask them to paste the value into chat.
- The user can skip key setup. Bundled playback, recording/editing, upload and
  local detection work without a key. Do not make account signup a prerequisite
  for trying the app.
- After confirmation, verify presence without values, recreate the app to load
  the environment, and use `doctor` plus the read-only provider preflight. A
  configured key, accepted key, known credit balance, and completed job are
  different facts. Report unavailable/permission-limited checks as unknown.
- Before enabling a key on existing data, inspect waiting automatic intents and
  queued jobs. New browser saves persist intent even without a key; configuring
  one can start/resume those requests. Obtain authorization for any provider
  work not already covered by the user's instructions. An existing key alone
  is not permission to save test recordings against the live app.

## Provider work and data

- Never submit audio or app-string orders without an explicitly approved scope.
  Setup, audits, documentation, formatting, and tests do not authorize provider
  writes. A user asking to run a live test can approve its fixture/languages;
  do not repeat an approval already given for that scope.
- Explain that Save in the configured app requests automatic translations into
  English, Portuguese and Chinese, excluding the source language. Uncertain
  detection requires confirmation first. There is no target-language checklist.
- Keep keys on Node's side. Never print `.env`, expanded Compose configuration,
  credentials, private receipts, raw provider diagnostics or signed URLs. Do not
  put them in `VITE_*`, browser code, screenshots, Git, or public exports.
- Persist write intent and returned IDs before advancing. Do not retry an
  uncertain provider POST, create a replacement job, or delete receipts to bypass
  reconciliation. See [recovery](docs/provider-recovery.md).
- Preserve user audio, database/model volumes and existing installations. Use one
  app process per data volume. Never use `down -v` or reset data without explicit
  authorization. Tests use temporary databases and controlled local providers.

## Implementation

- React/Vite initializes the UI and locale in the browser; do not add SSR. Node
  owns API, SQLite/media and credentials. Python owns audio validation/detection.
  Do not add hosted accounts or public deployment infrastructure without scope.
- Keep protocol parsing in the provider adapter, recovery policy in the worker,
  and shared input/state contracts in `shared/`. Validate inputs; parameterize SQL.
- Copy bundled track arrays before adding local contributions; polling/rendering
  must never mutate the fixture. Preserve original audio and caption provenance.
- Use stable keys in `locales/en.json`, i18next plural forms and `{{name}}`
  parameters. Follow [localization](docs/localization.md). Never fabricate generated
  translations, source hashes, provider output, or test evidence.
- Prefer focused changes. Comments explain units, invariants, recovery boundaries
  and non-obvious decisions rather than restating code. Preserve the approved UI.

## Verification and handoff

- For application changes, run `npm run check`, `npm test`, `npm run build`, and
  relevant browser tests. Run the complete suite for a release candidate. Build
  before browser tests; do not change `dist` while they run. Use [Python checks](docs/testing.md)
  for audio-service changes. For docs/tooling changes, run applicable checks and
  exercise the affected setup/export commands.
- Verify saved audio and recovery where affected; types alone do not prove either.
  Check rendered source/target locales for localization changes. Distinguish fake
  providers, real Whisper, live Ollang, and human listening evidence.
- Update guides and `scripts/lib/repository.mjs` when adding public material.
  Verify a fresh export independently of the working checkout. Keep internal QA,
  credentials, receipts and private recordings out of it.
- Report commands/results, final URL, limitations and remaining human inputs.
  Follow the [maintainer checklist](docs/maintainer-checklist.md) before calling
  a candidate ready to publish. Repository creation, commits/pushes, licensing
  decisions and publication follow the user's explicit scope; do not infer them
  from an installation or documentation task.
