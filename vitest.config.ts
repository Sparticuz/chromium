import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "update-browser-revision.mjs",
        "build",
        "docker",
        "examples",
        "vitest.config.ts",
        "_",
        "eslint.config.js",
      ],
      reporter: ["json", "json-summary", "text"],
      reportOnFailure: true,
    },
  },
});
