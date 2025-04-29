import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "update_browser_revision.mjs",
        "build",
        "docker",
        "examples",
        "vitest.config.ts",
        "_",
      ],
      reporter: ["json", "json-summary", "text"],
      reportOnFailure: true,
    },
  },
});
