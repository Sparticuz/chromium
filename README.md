# @sparticuz/chromium

[![@sparticuz/chromium](https://img.shields.io/npm/v/@sparticuz/chromium.svg?style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium)
[![TypeScript](https://img.shields.io/npm/types/chrome-aws-lambda?style=for-the-badge)](https://www.typescriptlang.org/dt/search?search=chromium)
[![Chromium](https://img.shields.io/badge/chromium-51_MB-brightgreen.svg?style=for-the-badge)](bin/)
[![Donate](https://img.shields.io/badge/donate-paypal-orange.svg?style=for-the-badge)](https://paypal.me/sparticuz)

## Chromium for Serverless platforms

This package was originally forked from [alixaxel/chrome-aws-lambda#264](https://github.com/alixaxel/chrome-aws-lambda/pull/264).
The biggest difference, besides the chromium version, is the inclusion of some code from https://github.com/alixaxel/lambdafs,
as well as dropping that as a dependency. Due to some changes in WebGL, the files in bin/swiftshader.tar.br need to
be extracted to `/tmp` instead of `/tmp/swiftshader`. This necessitated changes in lambdafs.

However, it quickly became difficult to maintain because of the pace of `puppeteer` updates. This package, `@sparticuz/chromium`,
is not chained to `puppeteer` versions, but also does not include the overrides and hooks that the original package contained. It is only `chromium`, as well as the special code needed to decompress the brotli package.

## Install

[`puppeteer` ships with a prefered version of `chromium`](https://pptr.dev/faq/#q-why-doesnt-puppeteer-vxxx-work-with-chromium-vyyy).
In order to figure out what version of `@sparticuz/chromium` you will need, please visit [Puppeteer's Chromium Support page](https://pptr.dev/chromium-support).

> For example, as of today, the latest version of `puppeteer` is `18.0.5`. The latest version of `chromium` stated on `puppeteer`'s support page is `106.0.5249.0`. So you need to install `@sparticuz/chromium@106`.

```shell
# Puppeteer or Playwright is a production dependency
npm install --save puppeteer-core@$PUPPETEER_VERSION
# @sparticuz/chromium is a DEV dependency IF YOU ARE USING A LAYER, if not, use as a production dependency!
npm install --save-dev @sparticuz/chromium@$CHROMIUM_VERSION
```

If you wish to install an older version of Chromium, take a look at [@sparticuz/chrome-aws-lambda](https://github.com/Sparticuz/chrome-aws-lambda#versioning) or [@alixaxel/chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda).

## Versioning

The @sparticuz/chromium version schema is as follows:
`MajorChromiumVersion.MinorChromiumIncrement.@Sparticuz/chromiumPatchLevel`

## Usage

This package works with all the currently supported AWS Lambda Node.js runtimes out of the box.

```javascript
const test = requie("node:test");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

test("Check the page title of example.com", async (t) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto("https://example.com");
  const pageTitle = await page.title();
  await browser.close();

  assert.strictEqual(pageTitle, "Example Domain");
});
```

### Usage with Playwright

```javascript
const test = require("node:test");
// Need to rename playwright's chromium object to something else
const { chromium: playwright } = require('playwright-core');
const chromium = require('@sparticuz/chromium');

test("Check the page title of example.com", async (t) => {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://example.com");
  const pageTitle = await page.title();
  await browser.close();

  assert.strictEqual(pageTitle, "Example Domain");
});
```

You should allocate at least 512 MB of RAM to your Lambda, however 1600 MB (or more) is recommended.

### Running Locally

This package will run in headless mode when `NODE_ENV = "test"`. If you want to run using your own local binary, set `IS_LOCAL` to anything.

## API

| Method / Property | Returns              | Description                                                                                                                                             |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `font(url)`       | `{?Promise<string>}` | Provisions a custom font and returns its basename.                                                                                                      |
| `args`            | `{!Array<string>}`   | Provides a list of recommended additional [Chromium flags](https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md). |
| `defaultViewport` | `{!Object}`          | Returns more sensible default viewport settings.                                                                                                        |
| `executablePath`  | `{?Promise<string>}` | Returns the path the Chromium binary was extracted to.                                                                                                  |
| `headless`        | `{!boolean}`         | Returns `true` if we are running on AWS Lambda or GCF.                                                                                                  |

## Fonts

The Amazon Linux 2 AWS Lambda runtime is no longer provisioned with any font faces.

Because of this, this package ships with [Open Sans](https://fonts.google.com/specimen/Open+Sans), which supports the following scripts:

* Latin
* Greek
* Cyrillic

To provision additional fonts, simply call the `font()` method with an absolute path or URL:

```typescript
await chromium.font('/var/task/fonts/NotoColorEmoji.ttf');
// or
await chromium.font('https://raw.githack.com/googlei18n/noto-emoji/master/fonts/NotoColorEmoji.ttf');
```

> `Noto Color Emoji` (or similar) is needed if you want to [render emojis](https://getemoji.com/).

> For URLs, it's recommended that you use a CDN, like [raw.githack.com](https://raw.githack.com/) or [gitcdn.xyz](https://gitcdn.xyz/).

This method should be invoked _before_ launching Chromium.

> On non-serverless environments, the `font()` method is a no-op to avoid polluting the user space.

---

Alternatively, it's also possible to provision fonts via AWS Lambda Layers.

Simply create a directory named `.fonts` and place any font faces you want there:

```
.fonts
├── NotoColorEmoji.ttf
└── Roboto.ttf
```

Afterwards, you just need to ZIP the directory and upload it as a AWS Lambda Layer:

```shell
zip -9 --filesync --move --recurse-paths .fonts.zip .fonts/
```
## Compiling

To compile your own version of Chromium check the [Ansible playbook instructions](_/ansible).

## AWS Lambda Layer

[Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) is a convenient way to manage common dependencies between different Lambda Functions.

The following set of (Linux) commands will create a layer of this package:

```shell
git clone --depth=1 https://github.com/sparticuz/chromium.git && \
cd chromium && \
make chromium.zip
```

The above will create a `chromium.zip` file, which can be uploaded to your Layers console.

Alternatively, you can also download the layer artifact from one of our [CI workflow runs](https://github.com/Sparticuz/chromium/actions/workflows/aws.yml?query=is%3Asuccess+branch%3Amaster), however, they expire from Github after a certain time period.

## Google Cloud Functions

Since version `1.11.2`, it's also possible to use this package on Google/Firebase Cloud Functions.

According to our benchmarks, it's 40% to 50% faster than using the off-the-shelf `puppeteer` bundle.

## Compression

The Chromium binary is compressed using the Brotli algorithm.

This allows us to get the best compression ratio and faster decompression times.

| File          | Algorithm | Level | Bytes     | MiB       | %          | Inflation  |
| ------------- | --------- | ----- | --------- | --------- | ---------- | ---------- |
| `chromium`    | -         | -     | 136964856 | 130.62    | -          | -          |
| `chromium.gz` | Gzip      | 1     | 51662087  | 49.27     | 62.28%     | 1.035s     |
| `chromium.gz` | Gzip      | 2     | 50438352  | 48.10     | 63.17%     | 1.016s     |
| `chromium.gz` | Gzip      | 3     | 49428459  | 47.14     | 63.91%     | 0.968s     |
| `chromium.gz` | Gzip      | 4     | 47873978  | 45.66     | 65.05%     | 0.950s     |
| `chromium.gz` | Gzip      | 5     | 46929422  | 44.76     | 65.74%     | 0.938s     |
| `chromium.gz` | Gzip      | 6     | 46522529  | 44.37     | 66.03%     | 0.919s     |
| `chromium.gz` | Gzip      | 7     | 46406406  | 44.26     | 66.12%     | 0.917s     |
| `chromium.gz` | Gzip      | 8     | 46297917  | 44.15     | 66.20%     | 0.916s     |
| `chromium.gz` | Gzip      | 9     | 46270972  | 44.13     | 66.22%     | 0.968s     |
| `chromium.gz` | Zopfli    | 10    | 45089161  | 43.00     | 67.08%     | 0.919s     |
| `chromium.gz` | Zopfli    | 20    | 45085868  | 43.00     | 67.08%     | 0.919s     |
| `chromium.gz` | Zopfli    | 30    | 45085003  | 43.00     | 67.08%     | 0.925s     |
| `chromium.gz` | Zopfli    | 40    | 45084328  | 43.00     | 67.08%     | 0.921s     |
| `chromium.gz` | Zopfli    | 50    | 45084098  | 43.00     | 67.08%     | 0.935s     |
| `chromium.br` | Brotli    | 0     | 55401211  | 52.83     | 59.55%     | 0.778s     |
| `chromium.br` | Brotli    | 1     | 54429523  | 51.91     | 60.26%     | 0.757s     |
| `chromium.br` | Brotli    | 2     | 46436126  | 44.28     | 66.10%     | 0.659s     |
| `chromium.br` | Brotli    | 3     | 46122033  | 43.99     | 66.33%     | 0.616s     |
| `chromium.br` | Brotli    | 4     | 45050239  | 42.96     | 67.11%     | 0.692s     |
| `chromium.br` | Brotli    | 5     | 40813510  | 38.92     | 70.20%     | **0.598s** |
| `chromium.br` | Brotli    | 6     | 40116951  | 38.26     | 70.71%     | 0.601s     |
| `chromium.br` | Brotli    | 7     | 39302281  | 37.48     | 71.30%     | 0.615s     |
| `chromium.br` | Brotli    | 8     | 39038303  | 37.23     | 71.50%     | 0.668s     |
| `chromium.br` | Brotli    | 9     | 38853994  | 37.05     | 71.63%     | 0.673s     |
| `chromium.br` | Brotli    | 10    | 36090087  | 34.42     | 73.65%     | 0.765s     |
| `chromium.br` | Brotli    | 11    | 34820408  | **33.21** | **74.58%** | 0.712s     |

## License

MIT
