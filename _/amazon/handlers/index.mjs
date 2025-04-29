import { ok } from "node:assert";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const handler = async (event, context) => {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({
        // Add in more args for serverless environments
        args: chromium.args,
      }),
      defaultViewport: {
        deviceScaleFactor: 1,
        hasTouch: false,
        height: 1080,
        isLandscape: true,
        isMobile: false,
        width: 1920,
      },
      dumpio: true,
      executablePath: await chromium.executablePath(),
      headless: "shell",
      acceptInsecureCerts: true,
    });

    console.log("Chromium version", await browser.version());

    for (let job of event) {
      const page = await browser.newPage();

      if (job.hasOwnProperty("url") === true) {
        await page.goto(job.url, { waitUntil: ["domcontentloaded", "load"] });

        if (job.hasOwnProperty("expected") === true) {
          if (job.expected.hasOwnProperty("title") === true) {
            ok(
              (await page.title()) === job.expected.title,
              `Title assertion failed.`
            );
          }

          if (job.expected.hasOwnProperty("screenshot") === true) {
            if (job.expected.hasOwnProperty("remove") === true) {
              await page.evaluate((selector) => {
                document.getElementById(selector).remove();
              }, job.expected.remove);
            }
            const screenshot = Buffer.from(await page.screenshot());
            /*
            console.log(
              `data:image/png;base64,${screenshot.toString("base64")}`,
              createHash("sha1")
                .update(screenshot.toString("base64"))
                .digest("hex")
            );
            */
            ok(
              createHash("sha1")
                .update(screenshot.toString("base64"))
                .digest("hex") === job.expected.screenshot,
              `Screenshot assertion failed.`
            );
          }
        }
      }
    }
  } catch (error) {
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
