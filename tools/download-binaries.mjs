/**
 * Downloads the current revision's Chromium binaries from S3 into bin/x64/ and bin/arm64/.
 *
 * Requires:
 *   S3_BUCKET — name of the S3 bucket used by the EC2 build system
 *
 * The revision is read from _/ec2/revision.txt.
 * S3 layout mirrors the EC2 upload path: s3://<bucket>/<revision>/<arch>/
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error("Error: S3_BUCKET environment variable is required.");
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- This is a CLI tool
  process.exit(1);
}

const revision = readFileSync(
  resolve(__dirname, "../_/ec2/revision.txt"),
  "utf8",
).trim();

console.log(
  `Downloading binaries for revision ${revision} from s3://${bucket}...`,
);

// Download arch-specific binaries (chromium.br, swiftshader.tar.br, al2023.tar.br)
for (const arch of ["x64", "arm64"]) {
  const dest = resolve(__dirname, `../bin/${arch}`);
  mkdirSync(dest, { recursive: true });

  const src = `s3://${bucket}/${revision}/${arch}/`;
  console.log(`\nSyncing ${arch}: ${src} → bin/${arch}/`);

  // eslint-disable-next-line sonarjs/os-command -- we trust the S3 paths
  execSync(`aws s3 sync "${src}" "${dest}/"`, { stdio: "inherit" });
}

// Download shared fonts artifact (arch-independent)
const fontsSrc = `s3://${bucket}/${revision}/fonts.tar.br`;
const fontsDest = resolve(__dirname, "../bin/fonts.tar.br");
console.log(`\nDownloading fonts: ${fontsSrc} → bin/fonts.tar.br`);
// eslint-disable-next-line sonarjs/os-command -- we trust the S3 paths
execSync(`aws s3 cp "${fontsSrc}" "${fontsDest}"`, { stdio: "inherit" });

console.log("\nBinaries downloaded successfully.");
