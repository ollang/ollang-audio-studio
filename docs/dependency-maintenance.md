# Dependency maintenance

Dependencies are pinned so the example can be reproduced. Dependabot proposes
updates; it does not merge them. A maintainer reviews compatibility and the
current security findings before accepting a change.

## Routine updates and security fixes

Routine version-update PRs are paused for launch with
`open-pull-requests-limit: 0` in the
[Dependabot configuration](../.github/dependabot.yml). Security alerts, security
updates and the weekly security workflow remain enabled. Security fixes use
separate groups and GitHub's independent security queue; the routine PR limit
does not suppress them.

To resume routine maintenance, set the limit to `2` for each ecosystem. The
existing weekly schedules and minor/patch groups will then apply. Maintainers
can still update and test dependencies manually while automatic PRs are paused.

Routine major upgrades are deferred for deliberate review. Docker routine updates
are restricted to patch/digest changes so Python minor-version upgrades do not
silently move the supported interpreter. Node 24 and Python 3.11 remain the tested
container runtimes. The images use Debian 13 (Trixie) and pinned manifest digests.
The app runtime starts Node directly and omits the build-stage npm CLI; container
maintenance commands use `node scripts/...` as shown in the setup guides.

The configuration uses `allow.update-types`, which [GitHub documents as affecting
version updates only](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#update-types-allow).
Security fixes may therefore require a major version even when routine major
upgrades are deferred. Do not add broad dependency/version ignore rules to make
security alerts disappear. A group is a review unit, not permission to auto-merge.

## Review an update

1. Read the dependency's release notes and determine whether the change fixes an
   advisory, affects runtime behavior, or updates only development tooling.
2. Test against current `main`. A bot PR based on an older commit may retain a
   failure that has already been fixed; inspect the actual failed check before
   attributing it to the update.
3. Keep manifests and locks in sync. For Python, update `requirements.in` and the
   complete `requirements.lock`, then run `pip check` in the rebuilt image.
   Include new transitive dependencies in the lock; do not force incompatible
   framework versions with `--no-deps` during installation.
4. Run the [appropriate code, browser, Python and Docker checks](testing.md).
   Runtime/framework upgrades need more than a successful package installation.
5. Merge only after the final checks pass. Close superseded PRs with a reference
   to the tested replacement; record why any major upgrade is deferred.

## Security checks

The [dependency-security workflow](../.github/workflows/security.yml) runs on
relevant PRs/pushes, weekly, and on manual dispatch. It needs no provider key:

- `npm audit --audit-level=high` checks the JavaScript lockfile, including developer
  tools. It blocks known high/critical npm findings.
- Trivy scans each freshly built image, including OS packages and installed
  language packages. It saves a full JSON report and blocks **fixable high or
  critical** findings. The scanner image is pinned by digest; review and refresh
  that digest as part of scanner maintenance.
- Unfixed findings remain visible in the artifact. A passing gate does not mean
  the image has no vulnerabilities. Review their affected paths, exposure and
  vendor status before release; document any accepted residual risk.

Locally, run `npm audit` and the workflow's Docker build/scan commands against
isolated image tags. To audit only the complete Python lock with
[pip-audit](https://github.com/pypa/pip-audit), use a separate tooling environment:

```sh
pip-audit --disable-pip --no-deps -r audio-service/requirements.lock
```

Here `--no-deps` tells the auditor that the lock already enumerates dependencies;
it does not bypass dependency resolution during the Docker build. Keep the audit
tooling out of the application environment. The image scan also covers packaging
tools inherited from the base image, which a lock-only scan can miss.

Record the source commit, platform, image digest, scanner/database date, findings,
remediation and unresolved items. Never describe an unavailable or failed scan
as clean. Container and advisory results change over time, so repeat them for a
release candidate and after dependency changes. Scanners identify known issues;
they do not establish exploitability or replace code review.
