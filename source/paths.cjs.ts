import { dirname, join } from "node:path";

/**
 * Get the bin directory path for CommonJS modules
 */
export function getBinPath(): string {
  return join(dirname(__filename), "..", "..", "bin");
}
