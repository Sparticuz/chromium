/**
 * This file will update the chromium revision in inventory.ini
 * based on the current stable version of chromium
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function updateDevToolsProtocolVersion() {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const result = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json"
  );
  const { channels } = await result.json();

  return channels["Stable"];
}

/**
 * Updates the chromium_revision in the specified inventory file.
 * @param {string} filePath - The path to the inventory.ini file.
 * @param {string} newRevision - The new revision number.
 */
async function updateInventoryFile(filePath, newRevision) {
  try {
    const data = await readFile(filePath, "utf8");
    const updatedData = data.replace(
      /^(chromium_revision=).*$/m,
      `$1${newRevision}`
    );
    await writeFile(filePath, updatedData, "utf8");
    console.log(
      `Successfully updated ${filePath} with revision ${newRevision}`
    );
  } catch (error) {
    console.error(`Error updating inventory file: ${error}`);
  }
}

/**
 * The Command block
 */
const stableChannelInfo = await updateDevToolsProtocolVersion();
const newRevision = stableChannelInfo.revision;

console.log(`Fetched stable Chromium revision: ${newRevision}`);

const inventoryPath = resolve(__dirname, "_/ansible/inventory.ini");
await updateInventoryFile(inventoryPath, newRevision);
