# App translations

The browser uses [i18next](https://www.i18next.com/overview/configuration-options)
and [react-i18next](https://react.i18next.com/latest/usetranslation-hook). Ollang
generates the translation files during development. A visitor's browser uses the
bundled catalogs immediately; it never receives the API key or submits a job.

## Files and conventions

- `locales/en.json` is the English source. Use stable keys rather than English
  sentences as identifiers. Changing copy keeps the key.
- `locales/pt.json` and `locales/zh.json` contain the generated translations.
  Commit these files so a fresh installation already has every UI language.
- `locales/manifest.json` records the English source hash for each translated
  key. It detects translations that need updating without storing credentials
  or provider IDs in the public source.
- `src/i18n.ts` configures the bundled resources, English fallback, and React
  integration. `src/locale.ts` resolves browser language preferences. An explicit
  site-language choice is saved locally and takes priority on the next visit.

Use `t('save')` for messages and `t('clipCount', { count })` for plurals.
Messages use standard i18next `{{name}}` interpolation. Keep whole sentences in
the catalog rather than assembling translated fragments. Reserve parameters for
runtime values such as a clip count, duration, or language name. React renders
the result as escaped text; do not use `dangerouslySetInnerHTML` for translations.
Flat keys, including dotted editor keys, are intentional (`keySeparator: false`).
The current source includes `_one` and `_other` plural keys. i18next chooses the
forms appropriate to the selected language through `Intl.PluralRules`; adding a
language with different plural categories requires reviewing the key/validation
contract rather than assuming every locale uses the English categories.

## Update the catalogs

Use Node 22.17+ and `npm ci`. Save your key in the ignored `.env`, following
`.env.example`. The API key is the only Ollang setting for both workflows.

```sh
npm run localize -- plan
npm run localize -- submit
npm run localize -- status
npm run localize -- collect
npm run localize -- check
```

`plan` is the default and makes no provider calls. It prints exact missing/stale
keys and their source hashes for Portuguese and Chinese. `submit` uses Ollang credits:
it checks available credits, uploads one JSON document per language, and
creates one document order for that language's delta. It never uploads recordings.
Use `--language pt` or `--language zh` after any command to select one language.

`status` reads the local receipts. `collect` checks existing orders and exports
completed translations; rerun it while Ollang is processing. It creates no new
orders. Collection validates every returned key, nonempty text, exact placeholder
names/counts, and the current English source hash before replacing a catalog.
`check` runs offline and exits unsuccessfully if keys/placeholders are invalid or
any source hash is missing/stale. Human review of wording remains useful.

For the Docker-only setup, run the same command in the app image and mount the
catalog directory so generated files persist in your checkout:

```sh
docker compose run --rm --no-deps -v "$PWD/locales:/app/locales" app node --import tsx scripts/localize.ts plan
```

Replace `plan` with the desired action. Run `docker compose up -d --build --no-deps app`
after collecting so the app bundles the new catalogs. Native development uses
`npm run build` followed by restarting the local app. Tests start their own
isolated app and never use the live provider.

## Receipts and recovery

The command saves batches, English snapshots, and provider project/order IDs in
`ui-localization.sqlite` under `DATA_DIR` (`.data` natively, `/data` in Docker).
Keep that directory/volume between runs. Use one environment for a translation
run so all commands share the same receipts. Run one catalog-update workflow at
a time. A normal repeat submission skips current, reserved and previously collected
key/hash pairs. Losing a catalog does not authorize buying the same work again.

If a generated catalog or its source-hash manifest is lost or reverted, run
`npm run localize -- collect` using the original receipts and key. The command
reports `restoring`, reads the existing completed orders, and reassembles current
translations across the original and delta batches. It submits no upload/order
and does not require a new credit preflight. `submit` reports `restore_available`
with `next: collect` for matching collected work. Restore from version control if
provider exports are no longer available; never delete receipts to force a retry.

Recovery validates key scope, order identity, source hashes and placeholders
before replacing a complete catalog. Changed or retired English keys are not
restored from stale outputs. New source text still needs its own approved delta;
`collect` never substitutes English to make an incomplete language pass checks.

The intent is committed before each provider write. An interrupted or ambiguous
upload is held for review, with no automatic retry. A lost order response can
be reconciled by `collect` only when its saved project has one matching document
order. Using a different key never resumes a saved batch.
`uploaded` batches can resume order creation with `submit`; `submitting`,
`submission_unknown`, `uploading`, and `upload_unknown` batches never repeat their
uncertain writes. `status` exposes these states. Inspect provider history before
resolving ambiguous uploads; deleting receipts can cause duplicate paid work.

If a source changes during processing, collection rejects the batch. Restore its
English snapshot to collect that result, then edit the copy and plan an explicit
update. Invalid exports leave the existing catalog in place. Catalog files are
replaced atomically; a crash between the catalog and manifest is detectable, and
re-collection of the existing submitted order can finish the update.

## Verify and extend

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Provider tests cover deltas, exact upload fields, duplicate prevention, lost responses,
SQLite recovery, stale sources, placeholder loss, and wrong order identities.
Browser tests cover detected and overridden language, persistence, independent
audio/caption choices, the recorder/editor, and accessibility in every locale.

This example intentionally uses the same three supported languages for the site
and translated audio/subtitles. `shared/translations.ts` defines that set and
`src/locale.ts` reuses it. To extend the app, review the provider's supported code,
update that shared set and developer catalog targets in
`scripts/localization/catalog.ts`, register the bundled resource in `src/i18n.ts`,
and add its native name in `src/App.tsx`. Generate validated catalogs, review plural
forms, and extend submission/playback/locale/browser tests. A new dropdown option
or JSON file alone does not provide translated audio.
