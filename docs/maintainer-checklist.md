# Maintainer release checklist

The local workflow has passed automated checks and an owner-reported live
end-to-end test. Complete the release checks below before making the repository public. Keep private account
values and provider receipts out of every public file.

## Decisions to supply

| Decision                                                 | Recommendation / required input                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GitHub organization, repository name/URL, default branch | Configured: `ollang/ollang-audio-studio`, default branch `main`. The repository starts private for review.    |
| Code license and copyright holder                        | Completed: MIT; copyright 2026 Ollang Inc., verified from ollang.com footer.                                  |
| Private security-reporting route                         | Contact configured: info@ollang.com. Enable GitHub private vulnerability reporting after repository creation. |
| Rights to redistribute included media and branding       | Completed: owner approved redistribution; separate permission scope appears in `MEDIA_NOTICE.md`.             |

Source and documentation are MIT licensed; bundled media has separate permission
notices. Repository bugs can use GitHub Issues; provider account
support is linked separately in [Ollang setup](ollang.md).

## Signup and first-use review

- [x] Maintainer supplied <https://developers.ollang.com> as the canonical free
      developer-account/API-key entry point (November 1, 2026).
- [ ] Confirm that this public URL resolves and the signup/key flow works from a
      fresh browser/account. It did not resolve from the builder's environment
      during the November 1 documentation pass; this is an external readiness item.
- [ ] Verify a new account can follow the guide using only an API key,
      understand credits, and complete one approved short translation. The owner's
      successful configured-account test does not establish fresh-account setup.
- [x] Owner confirmed bundled media redistribution permission (November 1).
- [ ] Confirm current provider policy links for new account usage.
      Public copy makes no quota, retention-duration, refund or completion-time promise.

## Implementation and documentation review

- [x] Owner accepted player, recorder/editor, uploading and the live automatic
      translation workflow (November 1). This is functional acceptance, not blanket
      linguistic review of every sample output or recovery branch.
- [x] Local implementation checks: static/catalog/docs/build, Node 22 and clean
      Node 24 image tests, complete Chromium desktop/mobile browser scenarios,
      audio-service checks and bounded real Whisper probes. Recheck affected
      commands after final edits; do not present an old run as current evidence.
- [x] `dubbingStyle: lipsync` is the intended adapter setting.
- [x] Shipped English/Portuguese/Chinese choices, automatic save intent, uncertain
      source confirmation, original playback and independent subtitle selection
      are documented. App catalogs are bundled; visitors do not translate UI copy.
- [x] Owner approved the public README, install/use documentation and agent prompts
      (November 1). Independent review and a human fresh-install exercise remain
      separate checks; this approval is not evidence of a completed install.
- [ ] Have a human follow the fresh-install instructions without builder help.
- [ ] Independently review translated meaning, voice quality, complete endings and
      subtitle timing for the bundled material. Keep original/dub timeline claims
      consistent with the manifest and playback policy.
- [x] Complete independent code/presentation/documentation/install review in two fresh
      sessions; fix and independently verify all three recovery findings (November 1).
- [x] Export the standalone source, scan for credentials/private data, and freeze
      the independently reviewed source. Recheck the final Git tree before pushing.

## GitHub and publication

- [x] Add the approved MIT license, Ollang Inc. copyright, media notice and
      info@ollang.com private reporting fallback.
- [x] Resolve repository metadata, licensing, security contact and media permission.
- [ ] Run `npm run docs:release` on the exact final files.
- [x] Set repository description and topics. The repository remains private.
- [ ] Add the public site/full-video link when available. Keep large video exports
      out of normal source history.
- [x] Enable Dependabot alerts and security updates.
- [ ] Enable private vulnerability reporting, secret scanning and push protection
      where available; configure branch protection and reviews.
- [x] Verify the initial hosted CI, including the independently reviewed browser
      decoding fix. Recheck hosted CI after subsequent commits.
- [ ] Review dependency updates using the [maintenance policy](dependency-maintenance.md)
      and scan the final built images before public release.
- [x] Create the private repository from the standalone export. Parent workspace
      history, local recordings and credentials are excluded.
- [ ] Approve the final source snapshot and independent-review findings before
      creating/pushing/publishing the public release.

The baseline is [GitHub's repository guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).
Agent entry points follow [GitHub's custom-instruction guidance](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
while keeping shared project policy in `AGENTS.md`. Do not promise support for an
agent, browser, operating system or architecture that has not been exercised.
