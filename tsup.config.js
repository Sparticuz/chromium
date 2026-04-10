import { resolve } from "node:path";
import { defineConfig } from "tsup";

/**
 * An esbuild plugin that redirects the ESM paths module import
 * to the CJS-specific paths module for the CommonJS build.
 */
const cjsPathsPlugin = {
  name: "cjs-paths",
  setup(build) {
    build.onResolve({ filter: /\/paths\.js$/ }, (args) => {
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
      // Ensure CJS consumers can use `require('@sparticuz/chromium')`
      // and get the Chromium class directly instead of `{ default: Chromium }`
      options.footer = {
        js: "module.exports = module.exports.default;",
      };
    },
    esbuildPlugins: [cjsPathsPlugin],
    format: "cjs",
    outDir: "build/cjs",
    tsconfig: "tsconfig.build.json",
  },
]);
