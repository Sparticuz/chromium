import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const lambdaHandler = async (event, context) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  await page.goto("https://www.example.com", { waitUntil: "networkidle0" });

  const browserVersion = await browser.version();
  const pageTitle = await page.title();

  await page.close();

  await browser.close();

  return { result: 'success', browserVersion, pageTitle };
}
