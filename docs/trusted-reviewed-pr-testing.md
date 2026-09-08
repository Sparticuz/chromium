# Manually testing a reviewed fork PR

Fork PRs cannot use repository AWS secrets or write labels from a `pull_request`
run. Do **not** fix that by checking out a fork in a privileged
`pull_request_target` job. Use `Test Reviewed PR`
([workflow](../.github/workflows/test-reviewed-pr.yml)) to authorize one reviewed
commit while keeping binary preparation and status reporting separate from PR
execution.

## Maintainer procedure

1. The workflow must first exist on the default branch, **master**, in
   `Sparticuz/chromium`. Review the PR's exact current head commit, including
   dependency/lockfile changes, npm lifecycle scripts, build/test scripts, and any
   workflow changes. Dispatch is permission to execute that code, not merely
   permission to download binaries.
2. Copy the full 40-character **head SHA**, not the PR merge commit or a branch
   name. Ensure the revision in `_/ec2/revision.txt` already has complete binaries
   and a checksum manifest in the existing S3 bucket. This workflow builds no
   Chromium binaries and starts no EC2 instances.
3. In **Actions → Test Reviewed PR → Run workflow**, select **master** as the
   workflow branch. Enter the decimal `pr_number` and full `reviewed_sha`.
   The workflow rejects other refs/source repositories and requires an open PR
   in `Sparticuz/chromium` whose current head still equals that SHA.
4. Inspect the run and the commit status **`reviewed-pr/host-tests`**. Success
   requires preparation and all four host test cases to succeed. Failed,
   cancelled, or skipped jobs cannot produce a successful status. Invalid PR/SHA
   authorization produces no status; failures after SHA validation are reported
   on that SHA. A pending status is set before reading the revision/downloading.
5. A new push requires a **new review and dispatch with the new SHA**. If the head
   changes after validation, this run still tests and reports only the old SHA.
   No `binaries:verified` label is added, and this gate does not authorize a
   release. Prefer a fresh dispatch over rerunning failed jobs: the prepared
   artifact expires after one day. Concurrent dispatches for the same SHA share
   one status context; inspect the linked run when retrying.

The legacy `binaries:test` label workflow remains for same-repository PRs and
master pushes; fork PRs are excluded from that path. `Check PR Binaries` uses
`pull_request_target` **only for metadata API calls and labels** (no checkout,
AWS access, or execution of PR code). Its availability labels are not SHA-bound
proof of tests passing.

## Credentials and artifact boundary

Repository maintainers need permission to dispatch Actions workflows. Repository
policy must allow the explicit job-level `GITHUB_TOKEN` permissions and the
GitHub-hosted `ubuntu-latest` (x64) and `ubuntu-24.04-arm` runners. The workflow has
no default token permissions:

| Job                         | Token permissions                                          | Code/data access                                                                                                               |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `prepare`                   | `contents: read`, `pull-requests: read`, `statuses: write` | Trusted inline code from master; PR metadata and revision read via API at the exact SHA; no checkout, npm, or binary execution |
| `test` (four fresh runners) | `contents: read`                                           | Reviewed SHA checkout with `persist-credentials: false`; no repository secrets or write token                                  |
| `report` (fresh runner)     | `statuses: write`                                          | Trusted preparation SHA output and GitHub job conclusions only; no checkout, test outputs, or test artifacts                   |

Preparation uses the existing `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
`CHROMIUM_BUILD_S3_BUCKET` secrets, scoped **only to the download step**, with
region `us-east-1`. Only S3 `GetObject` access to the revision's fixed objects is
needed; the existing credentials may have broader privileges for other workflows.
No PAT, new secret, deployment environment, SAM setup, or AWS write is needed.

The revision must be digits only (a trailing line ending is allowed). Preparation
downloads only `chromium.br`, `al2023.tar.br`, and `swiftshader.tar.br` for each of
x64 and arm64, plus shared `fonts.tar.br` and `manifest.json`. Trusted Python
stdlib code requires the manifest's string `revision` to match, and validates a
positive integer `size` and a full SHA256 for **every** fixed binary. Metadata is
read from `x64.binaries`, `arm64.binaries`, and `fonts`, as produced by the existing
build. Missing objects/metadata or mismatched sizes/hashes stop the run. It never
uses manifest-controlled filenames, runs downloaded code, or extracts archives in
the privileged job.

All prepared files become one immutable Actions artifact. Tests download by the
artifact **ID emitted by preparation**, not a PR-selected name, before checking
out PR code. No cache is shared. Reporting never downloads or interprets files
from the test runners; those runners cannot select the SHA or status payload.

## Coverage and limitations

Each architecture runs Node **22 and 24**: `npm ci`, `npm run build`, then
`npm run test:source`. This covers TypeScript compilation, source tests, and the
existing host Chromium browser/screenshot assertions, using prepared binaries.
Tests retain the normal `/tmp` location required by the packaged `fonts.conf`.
There is no additional layer packaging, SAM emulation, real Lambda invocation,
S3 screenshot publication, visual-diff comment, deployment, npm publishing, or
automatic release authorization. Host results do not prove real Lambda behavior.

This is **manual authorization, not a sandbox proving malicious code safe**.
Reviewed code and npm dependencies can execute arbitrary commands and access the
network on their disposable hosted test runners. Read-only checkout credentials
and Actions artifact runtime capabilities still exist there; lack of a write
`GITHUB_TOKEN` is not complete isolation. Tests themselves are PR-controlled, so
a green result cannot prove their honesty. Privileged jobs must never consume
PR/test code, outputs, caches, or uploaded reports in a future extension.

Hashes establish consistency with the S3 manifest, not independent provenance:
a compromised build/bucket writer could replace both binaries and manifest.
Trusted workflow/action maintainers and GitHub infrastructure remain in the trust
base. S3 objects are mutable until captured in the prepared artifact. External
web pages, screenshot rendering, runner images, and dependency availability can
cause failures. Force cancellation or infrastructure/API failure can prevent the
report job from completing, leaving pending rather than proof of success; inspect
the run before relying on a status. No live dispatch is required to review these
workflow changes locally.
