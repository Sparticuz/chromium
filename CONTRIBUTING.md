# Contributing

This guide covers everything a maintainer needs to set up the infrastructure from
scratch and work with the Chromium build system. For TypeScript-only changes that
don't touch the build system, skip to [Development Workflow](#development-workflow).

## Table of Contents

- [Contributing](#contributing)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [AWS Setup](#aws-setup)
    - [1. S3 Bucket](#1-s3-bucket)
    - [2. IAM Role for EC2 (Instance Profile)](#2-iam-role-for-ec2-instance-profile)
    - [3. IAM User for GitHub Actions](#3-iam-user-for-github-actions)
  - [SSH Key Setup](#ssh-key-setup)
  - [GitHub Repository Setup](#github-repository-setup)
    - [Secrets](#secrets)
    - [Labels](#labels)
    - [Workflow Permissions](#workflow-permissions)
  - [Development Workflow](#development-workflow)
    - [TypeScript Changes](#typescript-changes)
    - [Updating the Chromium Revision](#updating-the-chromium-revision)
  - [Build System](#build-system)
    - [How It Works](#how-it-works)
    - [Label Lifecycle](#label-lifecycle)
    - [Build Options](#build-options)
    - [Monitoring a Build](#monitoring-a-build)
    - [Safety Net](#safety-net)
    - [Visual Regression](#visual-regression)
  - [Release Process](#release-process)
  - [Troubleshooting](#troubleshooting)
    - [Build fails with "No subnet found in an AZ that supports c8id.4xlarge"](#build-fails-with-no-subnet-found-in-an-az-that-supports-c8id4xlarge)
    - [Spot instance interrupted mid-build](#spot-instance-interrupted-mid-build)
    - [Build marked as stale by safety net but still running](#build-marked-as-stale-by-safety-net-but-still-running)
    - [`pending.json` orphaned in S3](#pendingjson-orphaned-in-s3)
    - [Labels added by workflow don't trigger builds](#labels-added-by-workflow-dont-trigger-builds)
    - [Workflows not visible on Actions tab](#workflows-not-visible-on-actions-tab)
    - [`aws s3 sync` returns zero objects](#aws-s3-sync-returns-zero-objects)

---

## Prerequisites

- AWS account with permissions to create IAM users, roles, and S3 buckets
- GitHub repository admin access (for secrets, labels, workflow settings)
- Node.js >= 22.17.0
- npm
- AWS CLI v2 (for local testing and IAM setup)

## AWS Setup

Three resources are needed: an S3 bucket, an IAM role for the EC2 build instance,
and an IAM user for the GitHub Actions runner.

### 1. S3 Bucket

Create a private S3 bucket in `us-east-1`.

```bash
aws s3 mb s3://YOUR-BUCKET-NAME --region us-east-1
```

No special bucket policy, versioning, or lifecycle rules are required. The bucket
stores build artifacts, progress markers, and build logs organized by revision:

```
REVISION/
  pending.json          # build-in-progress marker
  build.json            # build status + progress timeline
  build.log             # full build log
  manifest.json         # artifact checksums and metadata
  fonts.tar.br          # font archive
  x64/
    chromium.br          # brotli-compressed headless_shell
    swiftshader.tar.br   # SwiftShader libraries
    al2023.tar.br        # AL2023 system libraries (x64)
  arm64/
    chromium.br
    swiftshader.tar.br
    al2023.tar.br        # AL2023 system libraries (arm64, from m8g.medium)
```

### 2. IAM Role for EC2 (Instance Profile)

The EC2 build instance needs its own IAM role to upload artifacts to S3. This role
is separate from the GitHub Actions user and has minimal permissions.

**Create the role:**

```bash
# Create the role with EC2 trust policy
aws iam create-role \
  --role-name chromium-build \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": { "Service": "ec2.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }
    ]
  }'
```

**Attach the S3 policy** (replace `YOUR-BUCKET-NAME`):

```bash
aws iam put-role-policy \
  --role-name chromium-build \
  --policy-name chromium-build-s3 \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "S3ArtifactUpload",
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "arn:aws:s3:::YOUR-BUCKET-NAME",
          "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        ]
      }
    ]
  }'
```

**Create the instance profile and associate the role:**

```bash
aws iam create-instance-profile --instance-profile-name chromium-build
aws iam add-role-to-instance-profile \
  --instance-profile-name chromium-build \
  --role-name chromium-build
```

The instance profile must be named `chromium-build` — the workflow references it
by name when launching EC2 instances.

### 3. IAM User for GitHub Actions

The GitHub Actions runner needs an IAM user with permissions for EC2 management,
S3 access, SSM parameter reads, and IAM PassRole. Create a dedicated user:

```bash
aws iam create-user --user-name chromium-gha-runner
```

**Attach this inline policy** (replace `YOUR-BUCKET-NAME` and `YOUR-ACCOUNT-ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2BuildManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:DescribeInstanceTypeOfferings",
        "ec2:RunInstances",
        "ec2:DescribeInstances",
        "ec2:TerminateInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSMReadAMI",
      "Effect": "Allow",
      "Action": "ssm:GetParameters",
      "Resource": "arn:aws:ssm:*:*:parameter/aws/service/ami-amazon-linux-latest/*"
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::YOUR-ACCOUNT-ID:role/chromium-build"
    },
    {
      "Sid": "S3ArtifactAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ]
    }
  ]
}
```

```bash
aws iam put-user-policy \
  --user-name chromium-gha-runner \
  --policy-name chromium-build-policy \
  --policy-document file://policy.json
```

**Permission breakdown:**

| Permission                            | Used by                | Purpose                                 |
| ------------------------------------- | ---------------------- | --------------------------------------- |
| `ec2:DescribeVpcs`, `DescribeSubnets` | `build-chromium.yml`   | Find default VPC and subnet             |
| `ec2:DescribeSecurityGroups`          | `build-chromium.yml`   | Check if `chromium-build` SG exists     |
| `ec2:CreateSecurityGroup`             | `build-chromium.yml`   | Create SG on first run                  |
| `ec2:AuthorizeSecurityGroupIngress`   | `build-chromium.yml`   | Open port 22 when SSH is enabled        |
| `ec2:DescribeInstanceTypeOfferings`   | `build-chromium.yml`   | Find AZs supporting the instance type   |
| `ec2:RunInstances`, `CreateTags`      | `build-chromium.yml`   | Launch the build instance               |
| `ec2:DescribeInstances`               | `build-chromium.yml`   | Wait for running state, get public IP   |
| `ec2:TerminateInstances`              | `build-chromium.yml`   | Emergency teardown; stale build cleanup |
| `ssm:GetParameters`                   | `build-chromium.yml`   | Fetch latest AL2023 AMI ID              |
| `iam:PassRole`                        | `build-chromium.yml`   | Attach `chromium-build` profile to EC2  |
| `s3:PutObject`                        | `build-chromium.yml`   | Upload `pending.json` marker            |
| `s3:GetObject`                        | `build-chromium.yml`   | Read `pending.json` for update          |
| `s3:DeleteObject`                     | `build-complete.yml`   | Clean up `pending.json`                 |
| `s3:ListBucket`                       | `build-safety-net.yml` | Scan for stale pending markers          |

**Generate access keys:**

```bash
aws iam create-access-key --user-name chromium-gha-runner
```

Save the `AccessKeyId` and `SecretAccessKey` — you'll add them as GitHub secrets
in the next section.

## SSH Key Setup

SSH access to the build instance is optional (controlled by the `build:ssh` label).
Generate a dedicated key pair for build monitoring:

```bash
ssh-keygen -t ed25519 -C "chromium-build" -f ~/.ssh/chromium-build
```

This creates two files:

| File                        | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `~/.ssh/chromium-build`     | Private key — stays on your machine            |
| `~/.ssh/chromium-build.pub` | Public key — add to GitHub as `SSH_PUBLIC_KEY` |

When `build:ssh` is set on a PR, the workflow injects the public key into the EC2
instance's `/root/.ssh/authorized_keys` via user-data. You then SSH in with:

```bash
ssh -i ~/.ssh/chromium-build root@<INSTANCE_IP>
```

The instance IP is stored in `pending.json` in S3 (see
[Monitoring a Build](#monitoring-a-build)).

## GitHub Repository Setup

### Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                     | Value                                            |
| -------------------------- | ------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`        | From `create-access-key` output                  |
| `AWS_SECRET_ACCESS_KEY`    | From `create-access-key` output                  |
| `CHROMIUM_BUILD_S3_BUCKET` | S3 bucket name (plain text, not ARN)             |
| `RELEASE_TOKEN`            | GitHub PAT (see below)                           |
| `SSH_PUBLIC_KEY`           | Contents of `~/.ssh/chromium-build.pub`          |
| `NPM_PUBLISH_TOKEN`        | npm granular access token for `@sparticuz` scope |

**`RELEASE_TOKEN`** — a GitHub Personal Access Token used for two things:

1. `repository_dispatch` from EC2 to trigger `build-complete.yml`
2. Tag push in `prepare-release.yml` to trigger `release.yml`

Both require `contents:write` scope. For a **fine-grained PAT**, grant
`contents:write` on this repository only. For a **classic PAT**, the `repo`
scope covers everything.

**`NPM_PUBLISH_TOKEN`** — create a granular access token on npmjs.com:

- Packages: `@sparticuz/chromium`, `@sparticuz/chromium-min`
- Permissions: Read and write

### Labels

The following labels must exist. Create them via `gh` CLI or the GitHub UI:

```bash
# Build trigger labels (added by maintainer)
gh label create "binaries:build"     --description "Trigger: start EC2 Chromium build"              --color "0E8A16"
gh label create "binaries:test"      --description "Trigger: run tests against built binaries"      --color "0E8A16"

# Build state labels (managed by workflows)
gh label create "binaries:needed"    --description "Chromium binaries need to be built for this PR" --color "FBCA04"
gh label create "binaries:building"  --description "Chromium build in progress"                     --color "ededed"
gh label create "binaries:available" --description "Chromium binaries ready in S3"                  --color "1D76DB"
gh label create "binaries:testing"   --description "Tests running against built binaries"           --color "ededed"
gh label create "binaries:verified"  --description "Binaries built and tests passed"                --color "0E8A16"
gh label create "binaries:failed"    --description "Chromium build or tests failed"                 --color "D93F0B"

# Build option labels
gh label create "build:on-demand"    --description "Use on-demand EC2 pricing instead of spot"      --color "D93F0B"
gh label create "build:ssh"          --description "Enable SSH + screen session on build instance"   --color "0E8A16"
```

### Workflow Permissions

Go to **Settings → Actions → General → Workflow permissions** and enable:

- **Allow GitHub Actions to create and approve pull requests**

This is required for the `check-chromium-update` workflow, which uses
`peter-evans/create-pull-request` to open PRs automatically.

## Development Workflow

### TypeScript Changes

1. Edit source files in [`source/`](source/).
2. Create or update tests in [`tests/`](tests/).
3. Lint: `npm run lint`
4. Build: `npm run build`
5. Unit tests: `npm run test:source`
6. Integration tests: `npm run test:integration` (requires AWS SAM CLI and Docker)

### Updating the Chromium Revision

The `check-chromium-update` workflow runs daily and opens a PR automatically when
a new stable Chromium version is available. To update manually:

1. Run `npm run update` to fetch the latest stable revision into
   [`_/ec2/revision.txt`](_/ec2/revision.txt).
2. Edit GN args if needed: [`_/ec2/args-x64.gn`](_/ec2/args-x64.gn),
   [`_/ec2/args-arm64.gn`](_/ec2/args-arm64.gn).
3. Edit or add patches in [`_/ec2/patches/`](_/ec2/patches/) if needed.
4. Open a PR. The `check-pr-binaries` workflow detects the revision change and
   adds the `binaries:needed` label.
5. When ready to build, manually add the `binaries:build` label. This triggers
   the EC2 build (~5 hours). The workflow swaps it to `binaries:building`.
6. Wait for `binaries:available` label (build complete).
7. Add the `binaries:test` label to run tests. The workflow swaps it to
   `binaries:testing`, and on success sets `binaries:verified`.
8. Run `npm run test:source` and `npm run test:integration` to verify locally.

> **Security note:** PRs that include binary files are not accepted. Binaries are
> built by EC2 and stored in S3.

## Build System

### How It Works

The build runs entirely on EC2, with no SSH or long-lived GitHub runner connection.

1. Adding the `binaries:building` label triggers `build-chromium.yml`.
2. The workflow builds `fonts.tar.br` on the GHA runner and uploads to S3.
3. The workflow packages the `_/ec2/` directory into user-data, launches a
   `c8id.4xlarge` instance, comments on the PR, and exits (~2 minutes).
4. In parallel, a small arm64 instance (`m8g.medium`) launches to package
   native AL2023 system libraries for arm64 (~5 minutes).
5. The main EC2 instance boots, extracts the build scripts, schedules a 6-hour
   self-destruct, and runs the build.
6. Build scripts execute in order: `setup.sh` → `build-x64.sh` →
   `build-arm64.sh` → `teardown.sh`.
7. On completion (success or failure), the instance uploads results to S3, sends
   a `repository_dispatch` event to trigger `build-complete.yml`, and shuts down.
8. `build-complete.yml` updates PR labels and comments with the result.

### Label Lifecycle

| State                 | Label                | Set by                                 |
| --------------------- | -------------------- | -------------------------------------- |
| New revision detected | `binaries:needed`    | `check-pr-binaries` (automated)        |
| Human approves build  | `binaries:build`     | Maintainer (manual) — trigger label    |
| Build running         | `binaries:building`  | `build-chromium` (swaps from `build`)  |
| Build succeeds        | `binaries:available` | `build-complete` (automated)           |
| Build fails           | `binaries:failed`    | `build-complete` or `build-safety-net` |
| Human approves tests  | `binaries:test`      | Maintainer (manual) — trigger label    |
| Tests running         | `binaries:testing`   | `test` (swaps from `test`)             |
| Tests pass            | `binaries:verified`  | `test` (automated, final state)        |
| Retry after failure   | `binaries:build`     | Maintainer (manual)                    |

Trigger labels (`binaries:build`, `binaries:test`) are always added manually by
a maintainer. Workflows immediately swap them to state labels (`binaries:building`,
`binaries:testing`). This is a security gate — it ensures builds and tests require
explicit human approval.

### Build Options

Add these labels to the PR **before** adding `binaries:building`:

| Label             | Default    | Effect                                                      |
| ----------------- | ---------- | ----------------------------------------------------------- |
| `build:on-demand` | off (spot) | Use on-demand pricing (~$1.77/hr instead of ~$0.55/hr spot) |
| `build:ssh`       | off        | Enable SSH access and run the build in a `screen` session   |

**Spot pricing** is the default (~70% cheaper). If the spot instance is
interrupted, the safety net detects it and marks the build as failed. Retry by
re-adding `binaries:building`.

### Monitoring a Build

**Without SSH** — check progress via S3:

```bash
aws s3 cp s3://BUCKET/REVISION/build.json - | jq .
```

The build file accumulates events at each phase (setup, build-x64, build-arm64,
teardown) with timestamps and elapsed time. The top-level `status` field shows
the current state (`in_progress`, `success`, or `failed`).

**With SSH** (requires `build:ssh` label):

```bash
# Get the instance IP
aws s3 cp s3://BUCKET/REVISION/pending.json - | jq -r .public_ip

# SSH in and attach to the build screen session
ssh -i ~/.ssh/chromium-build root@<IP>
screen -r build
```

Detach from screen with `Ctrl-A D` without interrupting the build.

### Safety Net

The `build-safety-net.yml` workflow runs daily at 12:00 UTC. It scans S3 for
`pending.json` markers past their 6-hour deadline, terminates any orphaned EC2
instances, cleans up S3 markers, labels the PR as `binaries:failed`, and opens a
GitHub issue documenting what happened.

You can also trigger it manually from the Actions tab.

### Visual Regression

When the test workflows run on a PR with `binaries:available`, a visual
regression job takes screenshots of `example.com` and `get.webgl.org` using the
new Chromium binary, compares them against the previous release's screenshots
using [odiff](https://github.com/dmtrKovalenko/odiff), and posts a PR comment
with:

- Side-by-side images (baseline, current, diff) via S3 presigned URLs
- SHA-256 hashes for each screenshot
- Match/changed status

This is informational only — visual changes don't block the workflow. If hashes
changed, update the expected values in `_/amazon/events/example.com.json` and
in `tests/chromium.test.ts`.

## Release Process

Releases are manual, triggered across two workflows:

1. **`prepare-release.yml`** — triggered manually via `workflow_dispatch` from the
   Actions tab. You provide the version (e.g. `148.0.0`). It bumps `package.json`,
   commits, creates a git tag, and pushes. The tag push triggers the next step.

2. **`release.yml`** — triggers automatically on tag push. It downloads binaries
   from S3, builds the TypeScript, publishes `@sparticuz/chromium` and
   `@sparticuz/chromium-min` to npm with provenance, creates Lambda layer zips,
   and creates a draft GitHub release with all assets attached.

After `release.yml` completes, review and publish the draft release on GitHub.

## Troubleshooting

### Build fails with "No subnet found in an AZ that supports c8id.4xlarge"

The instance type is not available in all availability zones. The workflow handles
this automatically by querying `DescribeInstanceTypeOfferings`, but if the default
VPC has no subnets in compatible AZs, you'll need to create one. Check which AZs
support the instance type:

```bash
aws ec2 describe-instance-type-offerings \
  --location-type availability-zone \
  --filters "Name=instance-type,Values=c8id.4xlarge" \
  --query 'InstanceTypeOfferings[].Location'
```

### Spot instance interrupted mid-build

Spot instances can be reclaimed with 2 minutes notice. The build will fail, and
the safety net will detect the stale `pending.json` and label the PR as
`binaries:failed`. Retry by adding `binaries:build` again. If spot
interruptions are frequent, use the `build:on-demand` label.

### Build marked as stale by safety net but still running

The safety net terminates instances past the 6-hour deadline. If a build
legitimately needs more time (unlikely — typical builds are ~5 hours), the
instance will be terminated. Check S3 for `build.json` to see which phase it
was in, then retry.

### `pending.json` orphaned in S3

If the GHA workflow fails after creating `pending.json` but before launching EC2
(or EC2 launch fails), the emergency teardown step cleans it up. If it's still
orphaned, the daily safety net will catch it. To clean up manually:

```bash
aws s3 rm s3://BUCKET/REVISION/pending.json
```

### Labels added by workflow don't trigger builds

This is by design. GitHub does not trigger workflows from label events caused by
`GITHUB_TOKEN` (prevents infinite loops). State labels like `binaries:building`
and `binaries:available` are set by workflows using `GITHUB_TOKEN` and serve as
visual status indicators only — they do not trigger other workflows.

The trigger labels (`binaries:build`, `binaries:test`) must always be added
manually by a maintainer. After a build completes, the maintainer adds
`binaries:test` to trigger the test workflow.

### Workflows not visible on Actions tab

`schedule` and `workflow_dispatch` workflows only appear on the Actions tab when
they exist on the default branch. Push workflow changes to `master` before
expecting them to show up.

### `aws s3 sync` returns zero objects

The IAM user needs `s3:ListBucket` on the **bucket** ARN (not the object ARN).
Without it, `sync` silently returns nothing instead of failing. Verify the policy
includes both `arn:aws:s3:::BUCKET` and `arn:aws:s3:::BUCKET/*` resources.
