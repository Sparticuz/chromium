/* eslint-disable sonarjs/no-commented-code -- For Debugging purposes */
import chromium from "@sparticuz/chromium";
import { ok } from "node:assert";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";

export const handler = async (
  /** @type {{url: string; expected: {title: string; remove: string; screenshot: string}}[]} */ event,
  // eslint-disable-next-line sonarjs/cognitive-complexity -- I know this is a bit complex but it's a test handler and I don't want to split it up
) => {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({
        // Add in more args for serverless environments
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

    console.log("Chromium version", await browser.version());

    for (const job of event) {
      const page = await browser.newPage();

      if (Object.hasOwn(job, "url") === true) {
        await page.goto(job.url, { waitUntil: ["domcontentloaded", "load"] });

        if (Object.hasOwn(job, "expected") === true) {
          if (Object.hasOwn(job.expected, "title") === true) {
            ok(
              (await page.title()) === job.expected.title,
              `Title assertion failed.`,
            );
          }

          if (Object.hasOwn(job.expected, "screenshot") === true) {
            if (Object.hasOwn(job.expected, "remove") === true) {
              await page.evaluate((selector) => {
                document.querySelector(`#${selector}`)?.remove();
              }, job.expected.remove);
            }
            const screenshot = Buffer.from(await page.screenshot());
            const base64 = `data:image/png;base64,${screenshot.toString(
              "base64",
            )}`;
            const hash = createHash("sha256").update(base64).digest("hex");
            // console.log(base64, hash);
            ok(
              hash === job.expected.screenshot,
              `Screenshot assertion failed.`,
            );
          }
        }
      }
    }
  } catch (error) {
    // @ts-expect-error It's an error
    throw error.message;
  } finally {
    if (browser !== null) {
      for (const page of await browser.pages()) {
        await page.close();
      }
      await browser.close();
    }
  }

  return true;
};
