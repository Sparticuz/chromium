---
name: Bug Report
about: Standard Bug Report
title: "[BUG]"
labels: bug
---

<!---
For Chromium-specific bugs, please refer to: https://issues.chromium.org/issues?q=status:open%20componentid:1456776
For Puppeteer-specific bugs, please refer to: https://github.com/puppeteer/puppeteer/issues
For Playwright-specific bugs, please refer to: https://github.com/microsoft/playwright/issues
-->

## Environment

- `chromium` Version:
- `puppeteer` / `puppeteer-core` Version:
- Node.js Version: <!-- 20.x | 22.x -->
- Lambda / GCF Runtime: <!-- `nodejs20` | `nodejs22.x` -->
- Runtime Architecture: <!-- `x64` | `arm64` -->

## Expected Behavior

<!-- What should have happened. -->

## Current Behavior

<!-- What happened instead. -->

## Steps to Reproduce

<!-- Include code and/or URLs to reproduce this issue. -->

<!--
```js
const chromium = require('chromium');

exports.handler = async (event, context, callback) => {
  let result = null;
  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    let page = await browser.newPage();

    await page.goto(event.url || 'https://example.com');

    result = await page.title();
  } catch (error) {
    return callback(error);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }

  return callback(null, result);
};
```
-->

## Possible Solution

<!-- Not mandatory, but you can suggest a fix or reason for the bug. -->
