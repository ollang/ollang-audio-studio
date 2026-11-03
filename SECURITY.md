# Security

This application is intended for a trusted local user on loopback. It has no
authentication, tenancy or hosted-service isolation. The default Compose file
exposes only the app on `127.0.0.1`; the detector stays private. The development
override exposes the detector on loopback solely for native development.

Keys remain in Node and the ignored `.env`. Local media and receipts are private
runtime data. Provider assets are collected server-side; API credentials are not
forwarded to asset hosts. Request validation, host/origin checks and browser CSP
reduce unintended access; they do not turn this into a production hosting design.

## Report a vulnerability privately

Email [info@ollang.com](mailto:info@ollang.com) with the subject
**Security report: Ollang Audio Studio**. This is Ollang's public contact address
and the maintainer-approved private reporting fallback. Do not post exploit
details, keys, private audio or signed URLs in a public issue.

If the published repository's Security tab offers **Report a vulnerability**, you
may use GitHub's private reporting flow instead. Repository creation and enabling
that feature are release steps; this document does not imply it is already enabled.

Reports should identify the affected version/snapshot, impact and a minimal
reproduction using synthetic data. The maintainer must establish response and
supported-version policies; this scaffold does not promise an invented SLA.

## Dependency and release checks

Dependencies and base images are pinned. Review updates and upstream advisories,
run tests on changes and keep media/model provenance. CI uses read-only repository
permissions and commit-pinned actions without provider secrets. Review the
[release checklist](docs/maintainer-checklist.md) before public exposure.

The [dependency maintenance guide](docs/dependency-maintenance.md) explains the
automated vulnerability checks, update policy, and review of unresolved image
findings. Passing CI does not establish that every vulnerability is fixed.

The October 31, 2026 audit prompted compatible `fast-uri` patches plus explicit
`glob` 14.0.3 and `minimatch` 11.0.3 overrides. The latter carry fixes for
[glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
[pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).
They support the project's Node versions and retain the APIs used here; lint,
static-route generation and browser workflows are included in verification.
Remove an override when all upstream consumers require a patched version, and
rerun the lockfile audit and tests. An audit snapshot is not a guarantee against
future vulnerabilities.
