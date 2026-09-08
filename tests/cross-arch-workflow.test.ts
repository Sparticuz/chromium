// Run with: npx vitest run tests/cross-arch-workflow.test.ts (requires jq).
/* eslint-disable sonarjs/no-os-command-from-path, sonarjs/publicly-writable-directories -- Local workflow check uses PATH tools and an isolated mkdtemp directory. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/test.yml", import.meta.url),
  "utf8",
);
function script(name: string): string {
  const crossArch = workflow
    .split("  cross-arch-comparison:")[1]
    ?.split("  finalize:")[0];
  const body = crossArch
    ?.split(`      - name: ${name}\n`)[1]
    ?.split("\n      - name:")[0]
    ?.split("        run: |\n")[1];
  assert.ok(body, `Missing workflow script: ${name}`);
  return body.replaceAll(/^ {10}/gm, "");
}

test("merge retains both screenshot sets and existing binary metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "cross-arch-"));
  try {
    const original = {
      arm64: { chromium: "binary-arm64" },
      revision: "123",
      x64: { chromium: "binary-x64" },
    };
    for (const arch of ["x64", "arm64"]) {
      mkdirSync(join(dir, "screenshots", arch), { recursive: true });
      writeFileSync(
        join(dir, "screenshots", arch, "manifest.json"),
        JSON.stringify({
          "example.com": { hash: `${arch}-example` },
          webgl: { hash: `${arch}-webgl` },
        }),
      );
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(original));
    // Execute the actual workflow merge, without either S3 operation.
    const merge = script("Merge screenshot hashes into revision manifest");
    execFileSync("bash", [
      "-eu",
      "-c",
      merge
        .slice(merge.indexOf("jq --"), merge.lastIndexOf("aws s3 cp"))
        .replaceAll("/tmp/", `${dir}/`),
    ]);
    const result: unknown = JSON.parse(
      readFileSync(join(dir, "manifest-merged.json"), "utf8"),
    );
    assert.deepEqual(result, {
      ...original,
      arm64: {
        ...original.arm64,
        screenshots: { "example.com": "arm64-example", webgl: "arm64-webgl" },
      },
      x64: {
        ...original.x64,
        screenshots: { "example.com": "x64-example", webgl: "x64-webgl" },
      },
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("only a successful matching comparison is Identical", () => {
  const dir = mkdtempSync(join(tmpdir(), "cross-arch-"));
  try {
    for (const arch of ["x64", "arm64"]) {
      mkdirSync(join(dir, "screenshots", arch), { recursive: true });
      writeFileSync(
        join(dir, "screenshots", arch, "example.com.png"),
        "fixture",
      );
      // webgl deliberately absent: must never report Identical.
    }
    const stub = `export async function compare() {
      if (process.env.RESULT === 'error') throw new Error('odiff failed');
      return JSON.parse(process.env.RESULT);
    }`;
    const command = script("Run odiff cross-arch comparison")
      .replace(
        "'odiff-bin'",
        `'data:text/javascript;base64,${Buffer.from(stub).toString("base64")}'`,
      )
      .replaceAll("/tmp/", `${dir}/`);
    const output = join(dir, "output");
    for (const [result, status] of [
      ['{"match":true}', "Identical"],
      ['{"match":false,"reason":"pixel-diff"}', "Changed"],
      ['{"match":false,"reason":"layout-diff"}', "Changed"],
      ["error", "Error"],
    ] as const) {
      writeFileSync(output, "");
      execFileSync("bash", ["-eu", "-c", command], {
        env: { ...process.env, GITHUB_OUTPUT: output, RESULT: result },
        stdio: "pipe",
      });
      assert.equal(
        readFileSync(output, "utf8"),
        `example_com_status=${status}\nwebgl_status=Unavailable\n`,
      );
      writeFileSync(
        join(dir, "screenshots", "urls.txt"),
        "example_com_x64=x64.png\nexample_com_arm64=arm64.png\nwebgl_x64=x64.png\nwebgl_arm64=arm64.png\n",
      );
      const comment = script("Post PR comment");
      const render = comment
        .slice(0, comment.indexOf("# Find existing cross-arch comment"))
        .replaceAll("${{ steps.diff.outputs.example_com_status }}", status)
        .replaceAll("${{ steps.diff.outputs.webgl_status }}", "Unavailable")
        .replaceAll(/\$\{\{[^}]+\}\}/g, "n/a")
        .replaceAll("/tmp/", `${dir}/`);
      execFileSync("bash", ["-eu", "-c", render]);
      const report = readFileSync(
        join(dir, "screenshots", "cross-comment.md"),
        "utf8",
      );
      assert.ok(report.includes(`| ![arm64](arm64.png) | ${status} |`));
      assert.ok(report.includes("| `n/a...` | `n/a...` | Unavailable |"));
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
