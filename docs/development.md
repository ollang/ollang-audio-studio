# Development

Use Node 22.17+; `.nvmrc` pins the tested local version. Docker is still the simplest
way to run the Python/FFmpeg/Whisper dependency. Install JavaScript dependencies:

```sh
npm ci
npm run setup
```

`setup` creates `.env` only when it is absent. It never replaces your existing key.
For browser development, start just the detector with its loopback port exposed:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build audio
npm run dev
```

Open <http://localhost:4311>. The development command starts the API on 4310 and
Vite on 4311; Vite proxies `/api` to the API. Ctrl+C stops both processes. Do not
run the packaged app on 4310 at the same time. Stop that app first if necessary
with `docker compose stop app`; recordings in its volume are preserved. Native
development uses its separate `.data` directory.

For individual process control, use `npm run dev:server` and `npm run dev:client`
in separate terminals. `PORT` changes the native API port and Vite proxy target.
The Node server reads `.env` itself; credentials stay outside the browser bundle.

## Production-shaped local run

```sh
npm run build
npm start
```

Open the API port directly (4310 by default). This serves `dist`; source changes
require a rebuild. Vite development does not require an existing `dist` directory.
The detector command above is still needed for local speech detection.

## Changes worth keeping small

- Put UI copy in `locales/en.json`, use stable keys, and update catalogs through
  [the localization workflow](localization.md). Editing copy alone does not authorize
  paid submissions.
- Preserve original audio and edit history. Verify saved bytes as well as preview.
- Keep protocol parsing in `server/provider.ts` and recovery policy in the worker.
  Do not add automatic POST retries after ambiguous network failures.
- Explain invariants and tradeoffs in comments. Prefer a clear function/module
  name to a comment that restates an assignment.
- Use the existing formatter, lint rules, strict types and [tests](testing.md).

The repository's public export is explicit. If you add a guide or example, update
`scripts/lib/repository.mjs`. `npm run docs:check` validates local links in the
public guide set; the export test checks that guides and CI survive packaging.
