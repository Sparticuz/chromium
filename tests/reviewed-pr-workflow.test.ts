// Run with: npx vitest run tests/reviewed-pr-workflow.test.ts (requires Python 3.11+).
/* eslint-disable sonarjs/no-os-command-from-path -- Executes trusted workflow snippets with a fake gh in an isolated temporary directory. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/test-reviewed-pr.yml", import.meta.url),
  "utf8",
);
const sha = "a".repeat(40);
const repo = "Sparticuz/chromium";
const stepBoundary = /\n(?: {6}- name:| {2}[a-z]+:)/;
let dir: string;

function script(name: string): string {
  const body = workflow
    .split(`      - name: ${name}\n`)[1]
    ?.split(stepBoundary)[0]
    ?.split("        run: |\n")[1];
  assert.ok(body, `Missing workflow script: ${name}`);
  return body.replaceAll(/^ {10}/gm, "");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "reviewed-pr-"));
  writeFileSync(join(dir, "output"), "");
  writeFileSync(
    join(dir, "gh"),
    String.raw`#!/usr/bin/env python3
import json, os, sys
with open('calls', 'a') as calls:
    calls.write(json.dumps(sys.argv[1:]) + '\n')
if os.environ.get('GH_API_ERROR'):
    sys.exit(1)
print(os.environ.get('GH_RESPONSE', '{}'))
`,
    { mode: 0o755 },
  );
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

function output(): string {
  return readFileSync(join(dir, "output"), "utf8");
}

function pullRequest() {
  return {
    base: { repo: { full_name: repo } },
    head: { repo: { full_name: "contributor/chromium" }, sha },
    number: 59,
    state: "open",
  };
}

function run(name: string, env: Record<string, string> = {}): string {
  return execFileSync("bash", ["-euo", "pipefail", "-c", script(name)], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_OUTPUT: join(dir, "output"),
      GITHUB_REPOSITORY: repo,
      GITHUB_RUN_ID: "1234",
      GITHUB_SERVER_URL: "https://github.com",
      PATH: `${dir}:${process.env["PATH"] ?? ""}`,
      PR_NUMBER: "59",
      REVIEWED_SHA: sha,
      ...env,
    },
    stdio: "pipe",
  });
}

test("authorization rejects malformed inputs, API failures, and non-current or foreign PRs", () => {
  const original = pullRequest();
  const rejected = [
    { PR_NUMBER: "59; touch injected" },
    { PR_NUMBER: "0" },
    { PR_NUMBER: "-59" },
    { REVIEWED_SHA: "a".repeat(39) },
    { REVIEWED_SHA: `${sha}\ninjected=true` },
    { GH_API_ERROR: "true" },
    { GH_RESPONSE: JSON.stringify({ ...original, state: "closed" }) },
    { GH_RESPONSE: JSON.stringify({ ...original, number: 60 }) },
    {
      GH_RESPONSE: JSON.stringify({
        ...original,
        base: { repo: { full_name: "other/chromium" } },
      }),
    },
    {
      GH_RESPONSE: JSON.stringify({
        ...original,
        head: { ...original.head, sha: "b".repeat(40) },
      }),
    },
  ];
  for (const env of rejected) {
    assert.throws(() =>
      run("Validate reviewed PR", {
        GH_RESPONSE: JSON.stringify(original),
        ...env,
      }),
    );
    assert.equal(output(), "");
  }
  run("Validate reviewed PR", {
    GH_RESPONSE: JSON.stringify(original),
    REVIEWED_SHA: sha.toUpperCase(),
  });
  assert.equal(
    output(),
    `reviewed_sha=${sha}\nhead_repo=contributor/chromium\n`,
  );
});

test("revision is read as data at the exact SHA and rejects unsafe S3 prefixes", () => {
  for (const revision of [
    "",
    "../123",
    "123/456",
    "123\nx=y",
    "１２３",
    " 123",
  ]) {
    assert.throws(() =>
      run("Read reviewed revision", {
        GH_RESPONSE: JSON.stringify({
          content: Buffer.from(revision).toString("base64"),
          encoding: "base64",
          type: "file",
        }),
        HEAD_REPO: "contributor/chromium",
      }),
    );
    assert.equal(output(), "");
  }
  run("Read reviewed revision", {
    GH_RESPONSE: JSON.stringify({
      content: Buffer.from("123\n").toString("base64"),
      encoding: "base64",
      type: "file",
    }),
    HEAD_REPO: "contributor/chromium",
  });
  assert.equal(output(), "revision=123\n");
  assert.ok(
    readFileSync(join(dir, "calls"), "utf8").includes(
      `repos/contributor/chromium/contents/_/ec2/revision.txt?ref=${sha}`,
    ),
  );
});

test("integrity checks every fixed file, size, hash, and manifest revision fail-closed", () => {
  const content = Buffer.from("binary fixture");
  const metadata = {
    sha256: createHash("sha256").update(content).digest("hex"),
    size: content.length,
  };
  const binaries = Object.fromEntries(
    ["chromium.br", "al2023.tar.br", "swiftshader.tar.br"].map((name) => [
      name,
      { ...metadata },
    ]),
  );
  const manifest = {
    arm64: { binaries: structuredClone(binaries) },
    fonts: { "fonts.tar.br": { ...metadata } },
    revision: "123",
    x64: { binaries: structuredClone(binaries) },
  };
  const entries = [
    ["fonts.tar.br", manifest.fonts["fonts.tar.br"]],
    ...Object.entries(manifest.x64.binaries).map(
      ([name, data]) => [`x64/${name}`, data] as const,
    ),
    ...Object.entries(manifest.arm64.binaries).map(
      ([name, data]) => [`arm64/${name}`, data] as const,
    ),
  ] as const;
  mkdirSync(join(dir, "prepared", "x64"), { recursive: true });
  mkdirSync(join(dir, "prepared", "arm64"), { recursive: true });
  const save = () => {
    writeFileSync(
      join(dir, "prepared", "manifest.json"),
      JSON.stringify(manifest),
    );
  };
  for (const [name] of entries)
    writeFileSync(join(dir, "prepared", name), content);
  save();
  assert.ok(
    run("Verify binary integrity", { REVISION: "123" }).includes("all seven"),
  );
  assert.throws(() => run("Verify binary integrity", { REVISION: "124" }));
  assert.throws(() => run("Verify binary integrity", { REVISION: "../123" }));
  for (const [name, data] of entries) {
    const path = join(dir, "prepared", name);
    rmSync(path);
    assert.throws(() => run("Verify binary integrity", { REVISION: "123" }));
    writeFileSync(path, Buffer.alloc(content.length, 0));
    assert.throws(() => run("Verify binary integrity", { REVISION: "123" }));
    writeFileSync(path, content);
    for (const invalid of [
      { ...metadata, size: metadata.size + 1 },
      { ...metadata, size: "14" },
      { ...metadata, sha256: "" },
      { size: metadata.size },
    ]) {
      // JSON fixtures deliberately include missing fields and wrong types.
      for (const key of Object.keys(data)) Reflect.deleteProperty(data, key);
      Object.assign(data, invalid);
      save();
      assert.throws(() => run("Verify binary integrity", { REVISION: "123" }));
    }
    Object.assign(data, metadata);
    save();
  }
  rmSync(join(dir, "prepared", "manifest.json"));
  assert.throws(() => run("Verify binary integrity", { REVISION: "123" }));
});

test("download requests only the eight fixed S3 objects and stops on an unavailable object", () => {
  writeFileSync(
    join(dir, "aws"),
    String.raw`#!/usr/bin/env python3
import json, os, sys
with open('downloads', 'a') as calls:
    calls.write(json.dumps(sys.argv[1:]) + '\n')
if os.environ.get('MISSING_OBJECT'):
    sys.exit(1)
`,
    { mode: 0o755 },
  );
  run("Download fixed binaries", {
    REVISION: "123",
    S3_BUCKET: "fixture-bucket",
  });
  const calls: unknown = readFileSync(join(dir, "downloads"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
  const names = [
    ...["x64", "arm64"].flatMap((arch) =>
      ["chromium.br", "al2023.tar.br", "swiftshader.tar.br"].map(
        (name) => `${arch}/${name}`,
      ),
    ),
    "fonts.tar.br",
    "manifest.json",
  ];
  assert.deepEqual(
    calls,
    names.map((name) => [
      "s3",
      "cp",
      `s3://fixture-bucket/123/${name}`,
      `prepared/${name}`,
      "--only-show-errors",
    ]),
  );
  writeFileSync(join(dir, "downloads"), "");
  assert.throws(() =>
    run("Download fixed binaries", {
      MISSING_OBJECT: "true",
      REVISION: "123",
      S3_BUCKET: "fixture-bucket",
    }),
  );
  assert.equal(
    readFileSync(join(dir, "downloads"), "utf8").trim().split("\n").length,
    1,
  );
});

test("report only succeeds for successful preparation and the entire test matrix", () => {
  for (const prepare of ["success", "failure", "cancelled", "skipped"]) {
    for (const tests of ["success", "failure", "cancelled", "skipped"]) {
      writeFileSync(join(dir, "calls"), "");
      run("Report trusted job conclusions", {
        PREPARE_RESULT: prepare,
        TEST_RESULT: tests,
      });
      const args: unknown = JSON.parse(
        readFileSync(join(dir, "calls"), "utf8"),
      );
      assert.ok(Array.isArray(args));
      assert.equal(args[1], `repos/${repo}/statuses/${sha}`);
      assert.ok(args.includes("context=reviewed-pr/host-tests"));
      assert.ok(
        args.includes(
          `state=${prepare === "success" && tests === "success" ? "success" : "failure"}`,
        ),
      );
    }
  }
  const report = workflow.split("  report:")[1];
  assert.ok(report);
  assert.ok(
    report.includes("if: always() && needs.prepare.outputs.reviewed_sha != ''"),
  );
  assert.ok(report.includes("TEST_RESULT: ${{ needs.test.result }}"));
  assert.ok(!report.includes("needs.test.outputs"));
  assert.ok(!report.includes("\n        uses:"));
  assert.ok(
    workflow.includes("artifact-ids: ${{ needs.prepare.outputs.artifact_id }}"),
  );
  assert.ok(
    workflow.includes("ref: ${{ needs.prepare.outputs.reviewed_sha }}"),
  );
  assert.ok(workflow.includes("persist-credentials: false"));
  assert.ok(workflow.includes("fail-fast: false"));
  assert.ok(workflow.includes("node: [22, 24]"));
  assert.ok(workflow.includes("arch: [x64, arm64]"));
});
