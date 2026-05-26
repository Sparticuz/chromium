import myConfig from "@sparticuz/eslint-config";
import packageJsonConfig from "@sparticuz/eslint-config/package-json";
import prettierConfig from "@sparticuz/eslint-config/prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  ...myConfig.with({
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "unicorn/prevent-abbreviations": "off",
    },
  }),
  ...packageJsonConfig,
  ...prettierConfig,
  globalIgnores([
    "node_modules",
    "examples",
    "build",
    "coverage",
    "vitest.config.ts",
  ]),
);
