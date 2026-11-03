# Configuration reference

Create `.env` from `.env.example` only if it is absent. It belongs in the
repository root and stays private. Get a key from your
[free developer account](https://developers.ollang.com); account signup is optional
for bundled playback and local capture/editing/detection. See [Ollang setup](ollang.md)
for enabling translation.

| Variable         | Default                 | Purpose                                                                 |
| ---------------- | ----------------------- | ----------------------------------------------------------------------- |
| `APP_PORT`       | `4310`                  | Docker host app port, bound to `127.0.0.1`                              |
| `OLLANG_API_KEY` | empty                   | Server-side key for new/resumed provider work                           |
| `PORT`           | `4310`                  | Native API port; Compose fixes its internal app port                    |
| `HOST`           | `127.0.0.1`             | Native API bind address; the Docker container uses `0.0.0.0` internally |
| `DATA_DIR`       | `.data`                 | Native SQLite/media/receipt directory; `/data` in Docker                |
| `DETECTOR_URL`   | `http://127.0.0.1:4312` | Native detector URL; Compose uses private `http://audio:4312`           |

The first two values cover the usual Docker setup. Native-development settings
are optional; do not add overrides without a reason. The server validates native
ports/URLs before listening. Shell environment values take precedence over `.env`.

## API key

`OLLANG_API_KEY` is the only Ollang setting. Audio and interface-string uploads
use Ollang's default destination. Never put credentials in `.env.example`,
`VITE_*`, browser source, screenshots or issue reports.

After changing Docker environment values:

```sh
docker compose up -d --no-deps app
docker compose exec app node scripts/doctor.mjs
```

An ordinary `docker compose restart` retains the old environment. Use
`docker compose config --quiet` to validate Compose without printing expanded
key values. Native development reads `.env` when its Node process starts.

## Verify presence before starting provider work

For an agent-assisted key setup, this one-off command checks the Compose-supplied
environment without starting the application or its translation worker:

```sh
docker compose run --rm --no-deps app node -e '
  console.log(JSON.stringify({
    apiKeyConfigured: Boolean(process.env.OLLANG_API_KEY)
  }));
'
```

It prints booleans only. It does not prove key validity or available credits. Review
saved automatic requests and authorization before recreating the app; use the
read-only provider preflight for access checks. Keep the same project/`.env`
selection on this command as on the rest of the installation.

## Automatic translation and persistence

There is no per-recording target setting: the app uses English, Portuguese and
Chinese, excluding the source language. The shared definition is
`shared/translations.ts`; adding a language requires coordinated catalog, UI,
provider and test changes.

New browser saves retain automatic intent even without a key. Configuring a key
can start confirmed requests that were waiting, and existing queued jobs can
resume after restart. Review those requests before enabling an existing library.
Legacy manual-mode recordings are not converted automatically; they retain a
single **Translate audio** button.

Jobs are bound to their original key/provider scope. Changing that scope
does not move or resubmit existing work. Preserve the local receipts and see
[job recovery](provider-recovery.md) before changing unfinished jobs' configuration.
The browser receives only presence booleans and public state, never keys,
provider IDs or signed asset URLs.
