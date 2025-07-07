import { join } from "node:path";

/**
 * Get the bin directory path for CommonJS modules
 */
export function getBinPath(): string {
  // eslint-disable-next-line unicorn/prefer-module
  return join(__dirname, "..", "bin");
}
