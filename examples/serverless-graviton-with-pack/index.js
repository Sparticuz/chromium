const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium-min");

module.exports = {
  handler: async () => {
    try {
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(
          "https://github.com/Sparticuz/chromium/releases/download/v135.0.0-next.3/chromium-v135.0.0-next.3-pack.arm64.tar"
        ),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });

      const page = await browser.newPage();

      await page.goto("https://www.example.com", { waitUntil: "networkidle0" });

      console.log("Chromium:", await browser.version());
      console.log("Page Title:", await page.title());

      await page.close();

      await browser.close();
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
