const { ok } = require("node:assert");
const { createHash } = require("node:crypto");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

exports.handler = async (event, context) => {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      dumpio: true,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
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
            const screenshot = await page.screenshot();
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
