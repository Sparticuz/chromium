import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get the bin directory path for ESM modules
 */
export function getBinPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin");
}
