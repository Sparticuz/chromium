// @ts-expect-error I have no types
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
        project: "tsconfig.json",
        // I have engines already set to >=20.11
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "unicorn/prevent-abbreviations": "off",
    },
  }
);
