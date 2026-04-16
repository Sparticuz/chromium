/**
 * This file will update the chromium revision in _/ec2/revision.txt
 * based on the current stable version of chromium
 */

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fetchStableChannelInfo() {
  const result = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json",
  );
  const { channels } = await result.json();

  return channels["Stable"];
}

/**
 * Writes the revision number to the specified file.
 * @param {string} filePath - The path to the revision file.
 * @param {string} newRevision - The new revision number.
 */
async function updateRevisionFile(filePath, newRevision) {
  try {
    await writeFile(filePath, `${newRevision}\n`, "utf8");
    console.log(
      `Successfully updated ${filePath} with revision ${newRevision}`,
    );
  } catch (error) {
    console.error(`Error updating revision file: ${error}`);
    throw error;
  }
}

/**
 * The Command block
 */
const stableChannelInfo = await fetchStableChannelInfo();
const { revision, version } = stableChannelInfo;

console.log(
  `Fetched stable Chromium revision for Chromium ${version}: ${revision}`,
);

const revisionPath = resolve(__dirname, "../_/ec2/revision.txt");
await updateRevisionFile(revisionPath, revision);
