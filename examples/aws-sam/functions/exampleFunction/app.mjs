import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const lambdaHandler = async (event, context) => {
  const browser = await puppeteer.launch({
    args: puppeteer.defaultArgs({
      args: chromium.args,
      headless: "shell",
    }),
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });

  const page = await browser.newPage();

  await page.goto("https://www.example.com", { waitUntil: "networkidle0" });

  const browserVersion = await browser.version();
  const pageTitle = await page.title();

  await page.close();

  await browser.close();

  return { result: "success", browserVersion, pageTitle };
};
