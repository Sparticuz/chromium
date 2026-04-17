# EC2 Chromium Build

## Overview

The `build-chromium.sh` script runs on EC2 via user-data to compile Chromium
headless_shell for x64 and arm64. The instance self-terminates on completion.

## Build Process

1. GHA workflow builds `fonts.tar.br` and uploads to S3
2. GHA workflow launches EC2 with `build-chromium.sh` embedded in user-data
3. Instance schedules 6-hour self-destruct (`shutdown -h +360`)
4. Installs dependencies, syncs Chromium source, applies patches
5. Builds x64 headless_shell natively, then cross-compiles arm64
6. Strips, brotli-compresses, uploads artifacts to S3
7. Sends `repository_dispatch` event to GitHub
8. Instance shuts down (terminates via `instance_initiated_shutdown_behavior`)

In parallel with step 2, the workflow also launches a small arm64 instance
(`m8g.medium`) that packages native AL2023 system libraries for arm64. This
runs `build-arm64-libs.sh` and takes ~5 minutes.

## Build Options

Add these labels to the PR **before** adding `binaries:build`:

| Label             | Default    | Effect                                                     |
| ----------------- | ---------- | ---------------------------------------------------------- |
| `build:on-demand` | off (spot) | Use on-demand pricing instead of spot (~3x more expensive) |
| `build:ssh`       | off        | Enable SSH access + screen session for live monitoring     |

**Spot pricing** is the default. Spot instances cost ~70% less but can be
interrupted with 2 minutes notice. If interrupted, the safety net will detect
the stale build and mark it as failed. Just retry.

**SSH monitoring** (when `build:ssh` is set):

```bash
# Get the instance IP from pending.json
aws s3 cp s3://BUCKET/REVISION/pending.json - | jq -r .public_ip

# SSH in and attach to the build screen session
ssh root@<IP>
screen -r build
```

**Progress without SSH:**

```bash
aws s3 cp s3://BUCKET/REVISION/build.json - | jq .
```

## Script Layout

| File                  | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `build-chromium.sh`   | Orchestrator: self-destruct, logging, validation, ERR trap, sources sub-scripts               |
| `setup.sh`            | NVMe mount, swap, sysctl, dnf install, depot_tools, gclient sync, patches                     |
| `build-x64.sh`        | gn gen, autoninja, strip, brotli, AL2023 libs, S3 upload for x64                              |
| `build-arm64.sh`      | sysroot, gn gen, autoninja, llvm-strip, brotli, S3 upload for arm64                           |
| `build-arm64-libs.sh` | Standalone script for arm64 AL2023 system lib packaging (runs on m8g.medium)                  |
| `teardown.sh`         | Log scrub+upload, build.json (success), manifest.json assembly, repository_dispatch, shutdown |
| `args-x64.gn`         | Static GN build args for x64                                                                  |
| `args-arm64.gn`       | Static GN build args for arm64                                                                |
| `patches/*.sed`       | sed scripts applied to Chromium source                                                        |
| `.gclient`            | gclient configuration                                                                         |
| `revision.txt`        | Chromium revision number                                                                      |

## AWS Prerequisites (one-time setup)

### IAM User for GitHub Actions Runner

The GHA runner uses `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` to launch
EC2 instances, manage security groups, and read/write S3 markers. Create an
IAM user (or use OIDC federation) with the following policy:

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
      "Resource": "arn:aws:iam::*:role/chromium-build"
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
      "Resource": ["arn:aws:s3:::BUCKET_NAME", "arn:aws:s3:::BUCKET_NAME/*"]
    }
  ]
}
```

**Where these permissions are used:**

| Permission                                                                                   | Used by                                           | Purpose                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `ec2:DescribeVpcs`, `ec2:DescribeSubnets`                                                    | `build-chromium.yml`                              | Find default VPC and subnet                                  |
| `ec2:DescribeSecurityGroups`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress` | `build-chromium.yml`                              | Create or reuse `chromium-build` SG, add SSH rule            |
| `ec2:DescribeInstanceTypeOfferings`                                                          | `build-chromium.yml`                              | Find AZs supporting the instance type                        |
| `ec2:RunInstances`, `ec2:CreateTags`                                                         | `build-chromium.yml`                              | Launch the build instance                                    |
| `ec2:DescribeInstances`                                                                      | `build-chromium.yml`, `build-safety-net.yml`      | Wait for running state; find instances by tag                |
| `ec2:TerminateInstances`                                                                     | `build-chromium.yml`, `build-safety-net.yml`      | Emergency teardown; stale build cleanup                      |
| `ssm:GetParameters`                                                                          | `build-chromium.yml`                              | Fetch latest AL2023 AMI ID                                   |
| `iam:PassRole`                                                                               | `build-chromium.yml`                              | Attach `chromium-build` instance profile to EC2              |
| `s3:PutObject`                                                                               | `build-chromium.yml`                              | Upload `pending.json` marker                                 |
| `s3:GetObject`                                                                               | `build-chromium.yml`, `test.yml`, `release.yml`   | Download `pending.json` for update; download build artifacts |
| `s3:DeleteObject`                                                                            | `build-complete.yml`, `build-safety-net.yml`      | Clean up `pending.json`                                      |
| `s3:ListBucket`                                                                              | `build-safety-net.yml`, `test.yml`, `release.yml` | List pending markers; `aws s3 sync`                          |

### IAM Instance Profile: `chromium-build`

The EC2 build instance uses a separate IAM role (via instance profile) for S3
uploads during the build. This role only needs S3 access — it does not need
EC2 or SSM permissions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ArtifactUpload",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::BUCKET_NAME", "arn:aws:s3:::BUCKET_NAME/*"]
    }
  ]
}
```

Attach trust policy for EC2:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Then create an instance profile with the same name and associate the role:

```bash
aws iam create-instance-profile --instance-profile-name chromium-build
aws iam add-role-to-instance-profile \
  --instance-profile-name chromium-build --role-name chromium-build
```

**Where these permissions are used (on EC2):**

| Permission        | Used by                                                                             | Purpose                                   |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| `s3:PutObject`    | `build-x64.sh`, `build-arm64.sh`, `teardown.sh`, `build-chromium.sh` (failure path) | Upload artifacts, build log, `build.json` |
| `s3:DeleteObject` | `teardown.sh`, `build-chromium.sh` (failure path)                                   | Remove `pending.json`                     |
| `s3:GetObject`    | `build-chromium.sh` (report_progress), `teardown.sh`                                | Read-modify-write `build.json`            |

### GitHub Secrets

| Secret                     | Type                | Required scopes / value                    | Used by                                                                   |
| -------------------------- | ------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`        | IAM user credential | See IAM user policy above                  | `build-chromium`, `build-complete`, `build-safety-net`, `test`, `release` |
| `AWS_SECRET_ACCESS_KEY`    | IAM user credential | Corresponding secret key                   | (same as above)                                                           |
| `CHROMIUM_BUILD_S3_BUCKET` | Plain text          | S3 bucket name (not an ARN)                | (same as above)                                                           |
| `AUTOMATION_TOKEN`         | GitHub PAT          | See below                                  | `build-chromium`, `prepare-release`                                       |
| `SSH_PUBLIC_KEY`           | Plain text          | SSH public key (e.g. `ssh-ed25519 AAAA…`)  | `build-chromium` (injected into EC2 user-data)                            |
| `NPM_PUBLISH_TOKEN`        | npm access token    | `publish` permission on `@sparticuz` scope | `release`                                                                 |

#### `AUTOMATION_TOKEN` — GitHub Personal Access Token

This PAT serves two purposes and needs scopes for both:

1. **`repository_dispatch` from EC2** (`build-chromium.yml` → EC2 → `teardown.sh`):
   The EC2 instance calls `POST /repos/{owner}/{repo}/dispatches` to trigger
   `build-complete.yml` on success or failure. This requires **`contents:write`**
   on the repository.

2. **Tag push in `prepare-release.yml`**: The workflow checks out with this
   PAT so that `git push origin master --follow-tags` triggers `release.yml`.
   Pushes made with the default `GITHUB_TOKEN` do not trigger downstream
   workflows. This also requires **`contents:write`**.

**Minimum scopes for a fine-grained PAT:**

| Scope            | Reason                               |
| ---------------- | ------------------------------------ |
| `contents:write` | `repository_dispatch` API + tag push |

**If using a classic PAT:** the `repo` scope covers both needs.

**Security notes:**

- The PAT is embedded in EC2 user-data (base64-encoded, accessible only via
  instance metadata). It is scrubbed from the build log before S3 upload.
- The PAT is not used for any read operations — only for dispatch and push.

#### `NPM_PUBLISH_TOKEN` — npm Access Token

Used only in `release.yml` to publish two packages:

- `npm publish --provenance` for `@sparticuz/chromium`
- `npm publish --provenance` for `@sparticuz/chromium-min`

Create a **granular access token** on npmjs.com with:

- Packages: `@sparticuz/chromium`, `@sparticuz/chromium-min`
- Permissions: **Read and write**

### Security Group: `chromium-build`

Created automatically by the workflow on first run. Uses default VPC egress
rules (all outbound traffic allowed). When the `build:ssh` label is present,
port 22 is opened for SSH access (key-only auth via `SSH_PUBLIC_KEY` secret).

## Local Testing

To test the build script on an EC2 instance:

```bash
export CHROMIUM_REVISION=1596535
export S3_BUCKET=your-bucket
export GITHUB_PAT=ghp_xxx
export GITHUB_REPO=owner/repo
export PR_NUMBER=123
export AWS_DEFAULT_REGION=us-east-1

bash build-chromium.sh
```
