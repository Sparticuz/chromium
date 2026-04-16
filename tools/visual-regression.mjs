/* eslint-disable n/no-missing-import */
// tools/visual-regression.mjs
// Takes screenshots of test pages using the packaged Chromium binary.
// Usage: node tools/visual-regression.mjs <output-dir>
//
// Writes to <output-dir>/:
//   example.com.png   — screenshot of https://example.com
//   webgl.png         — screenshot of https://get.webgl.org (logo removed)
//   manifest.json     — { "example.com": { hash: "..." }, "webgl": { hash: "..." } }

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

import { setupLambdaEnvironment } from "../build/esm/helper.js";
import chromium from "../build/esm/index.js";
import { inflate } from "../build/esm/lambdafs.js";

const OUTPUT_DIR = process.argv[2];
if (!OUTPUT_DIR) {
  console.error("Usage: node tools/visual-regression.mjs <output-dir>");
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  process.exit(1);
}

await mkdir(OUTPUT_DIR, { recursive: true });

const pages = [
  {
    name: "example.com",
    url: "https://example.com",
  },
  {
    name: "webgl",
    remove: "logo-container",
    url: "https://get.webgl.org",
  },
];

// Match the Lambda environment setup used by tests/chromium.test.ts
process.env["FONTCONFIG_PATH"] = join(tmpdir(), "fonts");
setupLambdaEnvironment(join(tmpdir(), "al2023", "lib"));
await inflate(join("bin", "al2023.tar.br"));

const browser = await puppeteer.launch({
  args: puppeteer.defaultArgs({
    args: chromium.args,
    headless: "shell",
  }),
  defaultViewport: {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920,
  },
  executablePath: await chromium.executablePath("./bin/"),
  headless: "shell",
});

console.log("Chromium version:", await browser.version());

const manifest = {};

for (const job of pages) {
  const page = await browser.newPage();
  await page.goto(job.url, { waitUntil: ["domcontentloaded", "load"] });

  if (job.remove) {
    await page.evaluate((selector) => {
      // eslint-disable-next-line no-undef
      document.querySelector(`#${selector}`)?.remove();
    }, job.remove);
  }

  const screenshot = Buffer.from(await page.screenshot());
  const pngPath = join(OUTPUT_DIR, `${job.name}.png`);
  await writeFile(pngPath, screenshot);

  // Hash matches the existing test approach: hash the data URI string
  const base64 = `data:image/png;base64,${screenshot.toString("base64")}`;
  const hash = createHash("sha256").update(base64).digest("hex");

  manifest[job.name] = { hash };
  console.log(`${job.name}: ${hash}`);
  await page.close();
}

await writeFile(
  join(OUTPUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);

for (const page of await browser.pages()) {
  await page.close();
}
await browser.close();

console.log(`Screenshots saved to ${OUTPUT_DIR}`);
