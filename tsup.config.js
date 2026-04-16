import { resolve } from "node:path";

import { defineConfig } from "tsup";

/**
 * esbuild plugin that redirects `paths.js` imports to `paths.cjs.ts` for CJS builds.
 * ESM builds use `paths.ts` (which uses import.meta.url), while CJS builds need
 * `paths.cjs.ts` (which uses __filename).
 */
const cjsPathsPlugin = {
  name: "cjs-paths",
  setup(build) {
    build.onResolve({ filter: /\/paths\.js$/ }, () => {
      return { path: resolve("source/paths.cjs.ts") };
    });
  },
};

export default defineConfig([
  {
    clean: true,
    entry: ["source/index.ts"],
    format: "esm",
    outDir: "build/esm",
    tsconfig: "tsconfig.build.json",
  },
  {
    clean: true,
    entry: ["source/index.ts"],
    esbuildOptions(options) {
      options.footer = { js: "module.exports = module.exports.default;" };
    },
    esbuildPlugins: [cjsPathsPlugin],
    format: "cjs",
    outDir: "build/cjs",
    tsconfig: "tsconfig.build.json",
  },
]);
