import { resolve } from "node:path";

import { defineConfig } from "tsdown";

/**
 * Rolldown plugin that redirects `paths.js` imports to `paths.cjs.ts` for CJS builds.
 * ESM builds use `paths.ts` (which uses import.meta.url), while CJS builds need
 * `paths.cjs.ts` (which uses __filename).
 */
const cjsPathsPlugin = {
  name: "cjs-paths",
  resolveId(source) {
    if (source.endsWith("/paths.js") || source === "./paths.js") {
      return resolve("source/paths.cjs.ts");
    }
  },
};

export default defineConfig([
  {
    entry: ["source/index.ts"],
    format: "esm",
    outDir: "build/esm",
    tsconfig: "tsconfig.build.json",
  },
  {
    entry: ["source/index.ts"],
    footer: { js: "module.exports = module.exports.default;" },
    format: "cjs",
    outDir: "build/cjs",
    plugins: [cjsPathsPlugin],
    tsconfig: "tsconfig.build.json",
  },
]);
