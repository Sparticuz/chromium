/**
 * This file will update the chromium revision in inventory.ini
 * based on the current stable version of chromium
 */

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 *
 * @param {*} browserVersion
 * @returns {
 *  timestamp: Date;
 *  channels: {
 *    "Stable": {
 *      "channel": string,
 *      "version": string,
 *      "revision": string
 *    },
 *    "Beta": {
 *      "channel": string,
 *      "version": string,
 *      "revision": string
 *    },
 *    "Dev": {
 *      "channel": string,
 *      "version": string,
 *      "revision": string
 *    },
 *    "Canary": {
 *      "channel": string,
 *      "version": string,
 *      "revision": string
 *    }
 *  }
 * }
 */

async function updateDevToolsProtocolVersion() {
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
  } catch (err) {
    console.error(`Error updating inventory file: ${err}`);
  }
}

/**
 * The Command block
 */
const stableChannelInfo = await updateDevToolsProtocolVersion();
const newRevision = stableChannelInfo.revision;

console.log(`Fetched stable Chromium revision: ${newRevision}`);

const inventoryPath = path.resolve(__dirname, "_/ansible/inventory.ini");
await updateInventoryFile(inventoryPath, newRevision);
