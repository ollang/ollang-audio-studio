# Contributing

Start with the [development guide](docs/development.md), [architecture](docs/architecture.md)
and [test guide](docs/testing.md). Prefer changes that keep the Ollang integration
easy to trace. New infrastructure should solve a demonstrated need in this local
example, rather than add setup for its own sake.

For a bug report, include expected/actual behavior, reproduction steps and the
relevant environment/command. Use synthetic audio. Do not attach credentials,
private transcripts, provider IDs, signed URLs or a real `.env`.

For a pull request:

1. Describe the concrete trigger and resulting behavior.
2. Keep related source, meaningful regression tests and documentation together.
3. Run `npm run check`, `npm test`, `npm run build`, and affected browser checks.
4. For audio-service changes, run its lint/type/test command as well.
5. State which environments and live-provider scenarios were actually tested.

Changing copy is not authorization for a paid translation submission. Prepare
the scoped [localization plan](docs/localization.md) and obtain approval before
provider work. Preserve receipts and never weaken uncertain-write handling to
make a test pass. Formatting is provided by `npm run format`.

Current release decisions, including the project license and support channels,
are tracked in the [maintainer checklist](docs/maintainer-checklist.md).
