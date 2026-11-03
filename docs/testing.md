# Testing

## JavaScript and browser checks

From the repo root with Node 22.17+:

```sh
npm ci
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`check` runs strict TypeScript, ESLint, Prettier, catalog/source-hash validation,
and public-document links. `test` runs Node's built-in test runner. Browser tests
serve the production bundle, so **build before running them**. Do not rebuild
`dist` while Playwright is running; changing hashed assets underneath the server
can invalidate an otherwise meaningful test.

Playwright uses port 4315, temporary SQLite/media and controlled detector/provider
HTTP doubles. It never loads your `.env` into its app or submits Ollang orders.
Tests cover saved audio edits, microphone lifecycle, series ordering, job recovery,
language/caption selection, playing/paused state across listening-language changes
(including Original audio), independent subtitle-language/Off selection and
persistence, and accessibility/layout in all
three UI locales. The real-time two-minute capture limit runs once on desktop;
its duplicate mobile case is intentionally skipped.

Caption recovery checks include playable audio before VTT delivery, independently
saved caption tracks, missing/malformed outputs, bounded retry exhaustion,
restart/overall timeout and safe rechecking without another paid request. Invalid
normalized audio remains unavailable. The preflight tests distinguish HTTP 401
from a wallet-only HTTP 403 and never turn unknown credits into zero.

For a focused run:

```sh
npm run test:e2e -- tests/browser/translations.spec.ts
```

Failures retain screenshots/traces under `test-results` and an HTML report under
`playwright-report`. Use `npx playwright show-report`. Review traces before adding
waits or retries; repeating a failing required test does not resolve its cause.

## Python and FFmpeg

Docker includes the pinned Python tools, so host Python is optional:

```sh
docker compose build audio
docker compose run --rm -e RUFF_CACHE_DIR=/tmp/ruff -e MYPY_CACHE_DIR=/tmp/mypy audio sh -c 'ruff check . && mypy app.py && SKIP_MODEL_LOAD=1 pytest -q -o cache_dir=/tmp/pytest'
```

These tests validate actual WAV/FFmpeg behavior but skip model loading. To test the
running Whisper model separately, start the normal Compose services and run:

```sh
docker compose run --rm -v "$PWD:/work:ro" audio python /work/scripts/verify-detector.py
```

The probe reads bounded English/Portuguese/German conversation excerpts and calls the private detector; it makes no Ollang
requests. First wait for detector health to be ready. Detection on synthetic
speech is useful evidence, not a guarantee for every real voice or language.

## CI

The standalone `.github/workflows/ci.yml` checks JavaScript on Node 22/24,
Chromium browser workflows, and the Docker audio-service checks. It requires no
Ollang secrets. Actions are pinned to commit IDs; Dependabot proposes updates.
GitHub-hosted execution is verified only after this candidate is published to a
repository and the workflow actually runs. Local equivalent checks are recorded
separately.

## Live and human review

Live provider work is opt-in and consumes credits. Use only an explicitly approved
fixture, languages and operation count. Provider smoke fixtures under
`fixtures/short` are at most five seconds. Never point automated tests at private
recordings or the normal app's data volume.

Before release, review a physical microphone recording, actual translated voice
quality/meaning, caption timing, and the exact demo flow. Review supported browser,
OS and architecture combinations on those environments. Automated accessibility
checks do not replace keyboard and assistive-technology review.

## Installation candidate

`npm run export -- /tmp/new-studio-copy` creates a standalone source copy with no
dependencies, credentials, databases or internal QA history. Run the README in a
fresh copy with isolated Compose project/port/volumes. Do not reset existing app
volumes. Use [the agent runbook](agent-runbook.md) for the reproduction record.
