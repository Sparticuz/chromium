import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import chromium from "../source/index.js";

describe("Test Chromium", () => {
  let browser: puppeteer.Browser;

  /**
   * Setup FONTCONFIG_PATH for non-lambda environments
   * This is needed for the fontconfig library to find the fonts
   */
  beforeAll(() => {
    process.env["FONTCONFIG_PATH"] = join(tmpdir(), "fonts");
  });

  it("should open a Chromium window", async () => {
    browser = await puppeteer.launch({
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
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
    const version = await browser.version();
    expect(version).toContain("HeadlessChrome");
  });

  it("should open a new page", async () => {
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const title = await page.title();
    expect(title).toBe("Example Domain");
  });

  it("should take a screenshot", async () => {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle0" });
    const screenshot = Buffer.from(await page.screenshot());
    const base64Screenshot = `data:image/png;base64,${screenshot.toString(
      "base64"
    )}`;
    // console.log(base64Screenshot);
    const hash = createHash("sha256").update(base64Screenshot).digest("hex");
    expect(hash).toBe(
      "d5964286d9e69a60cb04e873a21b4f1f6438405167894d6622b27cf92799b981"
    );
  });

  it("should take a screenshot of get.webgl.org without the logo", async () => {
    const page = await browser.newPage();
    await page.goto("https://get.webgl.org", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const el = document.querySelector("#logo-container");
      if (el) el.remove();
    });
    const screenshot = Buffer.from(await page.screenshot());
    const base64Screenshot = `data:image/png;base64,${screenshot.toString(
      "base64"
    )}`;
    // console.log(base64Screenshot);
    const hash = createHash("sha256").update(base64Screenshot).digest("hex");
    expect(hash).toBe(
      "5b115cbbb6e7981eafd23953c95c0e6ae065557ca52a88ebe2702bd543a71af6"
    );
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (browser) {
      console.log("Closing browser");
      await browser.close();
    }
  });
});
