# Provider jobs and recovery

The app stores write intent and provider receipts in SQLite before advancing a
job. This favors avoiding duplicate paid work over automatically retrying every
failure. Keep the data volume and use one app process per volume.

| State         | Meaning / next action                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| `queued`      | User requested translation; local worker has not started                          |
| `uploading`   | Upload intent is saved; a stopped/ambiguous request may have succeeded            |
| `submitting`  | Order-creation intent is saved before the POST                                    |
| `reconciling` | Resolve saved creation IDs or find the unique matching order in the saved project |
| `processing`  | Known parent is being polled                                                      |
| `collecting`  | Parent completed; collecting assets. Validated local audio can already play       |
| `ready`       | Validated audio and expected source/target captions are saved                     |
| `unknown`     | Submission cannot be resolved safely; inspect existing provider work              |
| `failed`      | A definite request/provider failure stopped work; no replacement is created       |
| `attention`   | Configuration, identity, collection or retry bounds require review                |

## Restart behavior

New web saves persist automatic intent. Once the source is confirmed and a key
is configured, the server queues supported non-source languages. On startup it
repairs confirmed intents that were not yet queued; existing clip/target receipts
prevent duplicate creation. Key-free saved intents can therefore start after key
configuration. Legacy/manual-mode clips remain manual.

Queued work and known orders can resume. An interrupted order-creation POST
enters reconciliation. An interrupted upload without a saved project ID is held
as uncertain; it is never silently repeated. A job is tied to its original key and
provider origin; using a different scope does not resume it.

Original audio is staged and atomically published before its SQLite row. A retry
can recover an interrupted partial orphan when no clip was committed. Complete
orphans require matching bytes; committed clips retain their idempotency checks.
Unpublished staging files are never served as recordings.

Detection has a separate local recovery path: interrupted detection asks for
language confirmation or a detection retry. Unsaved editor drafts are in memory
and do not survive page reload.

## Operator review

Expand **Behind the translation** and inspect the error/state. If **Check existing
order** is available, it resumes safe lookup/collection for the saved project; it
does not create a replacement order. Inspect provider history before resolving an
upload without a project receipt. There is currently no receipt-attachment UI.

The worker uses bounded retries for reads/collection and a two-hour overall
window. Repeated throttles/outages can reach attention; it is not an unlimited
retry service. Key/auth, credit, identity and invalid asset errors stop work for
review. [The Ollang guide](ollang.md) tracks provider-specific limits still to confirm.

Audio is saved atomically before caption collection and remains available while
captions are delayed. Each validated caption track is saved independently.
Retries and restarts reuse the collected audio instead of downloading and
normalizing it repeatedly. If captions remain missing or malformed, the job can
reach `attention`; its saved audio and valid captions remain playable. **Check
existing order** resumes only reads/collection and never requests another dub.
The player says Ready to listen when audio is available, even while collection
continues. It shows existing subtitle availability/fallback messages as needed.

`provider_auth` identifies HTTP 401; `provider_forbidden` identifies HTTP 403.
Both stop the affected request for review. In the read-only setup preflight, a
wallet-only 403 is reported as missing billing permission with unknown credits;
it is not reported as an invalid translation key or a zero balance.

Do not delete a database or clear receipts as a retry mechanism: provider work
exists independently of local state. Keep private project/order IDs and signed
URLs out of public bug reports.

## Subtitle provenance

Original transcription/subtitle children are stored on the original audio
timeline. Only an export attached to the dubbed parent is assigned to that dub.
The player first prefers the listener's text language and exact audio timeline,
then computes a duration-adjusted fallback; English is the text-language fallback.
Stored records are never relabeled as a different delivered timeline. See
[playback policy](../src/playback.ts) and [caption tests](../tests/playback-captions.test.ts).
