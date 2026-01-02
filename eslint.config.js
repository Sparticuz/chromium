import myConfig from "@sparticuz/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    name: "Ignores",

    ignores: [
      "node_modules",
      "examples",
      "build",
      "coverage",
      "vitest.config.ts",
    ],
  },
  ...myConfig,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "unicorn/prevent-abbreviations": "off",
    },
  }
);
