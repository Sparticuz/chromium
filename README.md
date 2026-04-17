# @sparticuz/chromium

[![@sparticuz/chromium](https://img.shields.io/npm/v/@sparticuz/chromium.svg?style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium)
![Package size](https://img.shields.io/npm/unpacked-size/%40sparticuz%2Fchromium?style=for-the-badge&label=Chromium)
[![npm](https://img.shields.io/npm/dw/@sparticuz/chromium?label=%40sparticuz%2Fchromium&style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium)
[![npm](https://img.shields.io/npm/dw/@sparticuz/chromium-min?label=%40sparticuz%2Fchromium-min&style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium-min)
[![GitHub Downloads](https://img.shields.io/github/downloads/Sparticuz/chromium/total?style=for-the-badge)](https://github.com/Sparticuz/chromium/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/Sparticuz?style=for-the-badge)](https://github.com/sponsors/Sparticuz)

## Chromium for Serverless Platforms

[sparticuz/chrome-aws-lambda](https://github.com/sparticuz/chrome-aws-lambda) was originally forked from [alixaxel/chrome-aws-lambda#264](https://github.com/alixaxel/chrome-aws-lambda/pull/264).

The main difference, aside from the Chromium version, is the inclusion of some code from https://github.com/alixaxel/lambdafs, while removing it as a dependency. Due to changes in WebGL, the files in `bin/swiftshader.tar.br` must now be extracted to `/tmp` instead of `/tmp/swiftshader`. This required changes in lambdafs.

However, maintaining the package became difficult due to the rapid pace of `puppeteer` updates. `@sparticuz/chromium` is not tied to specific `puppeteer` versions and does not include the overrides and hooks found in the original package. It provides only Chromium, the code required to decompress the Brotli package, and a set of predefined arguments tailored for serverless environments.

## Install

[`puppeteer` ships with a preferred version of `chromium`](https://pptr.dev/faq#q-why-doesnt-puppeteer-vxxx-work-with-a-certain-version-of-chrome-or-firefox). To determine which version of `@sparticuz/chromium` you need, visit the [Puppeteer Chromium Support page](https://pptr.dev/chromium-support).

> For example, as of today, the latest version of `puppeteer` is `18.0.5`, and the latest supported version of Chromium is `106.0.5249.0`. Therefore, you should install `@sparticuz/chromium@106`.

```shell
# Puppeteer or Playwright is a production dependency
npm install --save puppeteer-core@$PUPPETEER_VERSION
# @sparticuz/chromium can be a DEV dependency IF YOU ARE USING A LAYER. If you are not using a layer, use it as a production dependency!
npm install --save-dev @sparticuz/chromium@$CHROMIUM_VERSION
```

If your vendor does not allow large deployments (since `chromium.br` is over 50 MB), you will need to host the `chromium-v#-pack.tar` separately and use the [`@sparticuz/chromium-min` package](https://github.com/Sparticuz/chromium#-min-package).

```shell
npm install --save @sparticuz/chromium-min@$CHROMIUM_VERSION
```

If you need to install an older version of Chromium, see [@sparticuz/chrome-aws-lambda](https://github.com/Sparticuz/chrome-aws-lambda#versioning) or [@alixaxel/chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda).

## Versioning

The @sparticuz/chromium version schema is as follows:
`MajorChromiumVersion.MinorChromiumIncrement.@Sparticuz/chromiumPatchLevel`

Because this package follows Chromium's release cycle, it does NOT follow semantic versioning. **Breaking changes may occur at the 'patch' level.** Please check the release notes for details on breaking changes.

## Usage

This package works with all currently supported AWS Lambda Node.js runtimes out of the box.

```javascript
const test = require("node:test");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// Optional: If you'd like to disable webgl, true is the default.
chromium.setGraphicsMode = false;

test("Check the page title of example.com", async (t) => {
  const viewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920,
  };
  const browser = await puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: viewport,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });

  const page = await browser.newPage();
  await page.goto("https://example.com");
  const pageTitle = await page.title();
  await browser.close();

  t.assert.strictEqual(pageTitle, "Example Domain");
});
```

### Usage with Playwright

```javascript
const test = require("node:test");
// Need to rename playwright's chromium object to something else
const { chromium: playwright } = require("playwright-core");
const chromium = require("@sparticuz/chromium");

test("Check the page title of example.com", async (t) => {
  const browser = await playwright.launch({
    args: chromium.args, // Playwright merges the args
    executablePath: await chromium.executablePath(),
    // headless: true, /* true is the default */
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://example.com");
  const pageTitle = await page.title();
  await browser.close();

  t.assert.strictEqual(pageTitle, "Example Domain");
});
```

You should allocate at least 512 MB of RAM to your instance; however, 1600 MB (or more) is recommended.

### -min Package

The -min package does NOT include the Chromium Brotli files. This is useful when your host has file size limits.

To use the -min package, install the `@sparticuz/chromium-min` package instead of `@sparticuz/chromium`

When using the -min package, you must specify the location of the Brotli files.

In this example, `/opt/chromium` contains all the Brotli files:

```
/opt
  /chromium
    /al2023.tar.br
    /chromium.br
    /fonts.tar.br
    /swiftshader.tar.br
```

```javascript
const viewport = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
};
const browser = await puppeteer.launch({
  args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
  defaultViewport: viewport,
  executablePath: await chromium.executablePath("/opt/chromium"),
  headless: "shell",
});
```

In the following example, `https://www.example.com/chromiumPack.tar` contains all the Brotli files. Generally, this would be a location on S3 or another very fast downloadable location that is close to your function's execution environment.

On the first run, `@sparticuz/chromium` will download the pack tar file, untar the files to `/tmp/chromium-pack`, and then decompress the `chromium` binary to `/tmp/chromium`. Subsequent runs (during a warm start) will detect that `/tmp/chromium` exists and use the already downloaded files.

The latest `chromium-pack.arch.tar` file is available in the latest [release](https://github.com/Sparticuz/chromium/releases).

```javascript
const viewport = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
};
const browser = await puppeteer.launch({
  args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
  defaultViewport: viewport,
  executablePath: await chromium.executablePath(
    "https://www.example.com/chromiumPack.tar",
  ),
  headless: "shell",
});
```

### Examples

Here are some example projects and guides for other services:

- [Production Dependency](https://github.com/Sparticuz/chromium/tree/master/examples/production-dependency)
- [Serverless Framework with Lambda Layer](https://github.com/Sparticuz/chromium/tree/master/examples/serverless-with-lambda-layer)
- [Serverless Framework with Pre-existing Lambda Layer](https://github.com/Sparticuz/chromium/tree/master/examples/serverless-with-preexisting-lambda-layer)
- [Chromium-min](https://github.com/Sparticuz/chromium/tree/master/examples/remote-min-binary)
- [AWS SAM](https://github.com/Sparticuz/chromium/tree/master/examples/aws-sam)
- [Webpack](https://github.com/Sparticuz/chromium/issues/24#issuecomment-1343196897)
- [Netlify](https://github.com/Sparticuz/chromium/issues/24#issuecomment-1414107620)

### Running Locally & Headless/Headful Mode

This version of Chromium is built using the `headless.gn` build variables, which do not include a GUI. If you need to test your code using a headful instance, use your locally installed version of Chromium/Chrome, or the version provided by Puppeteer.

```shell
npx @puppeteer/browsers install chromium@latest --path /tmp/localChromium
```

For more information on installing a specific version of `chromium`, check out [@puppeteer/browsers](https://www.npmjs.com/package/@puppeteer/browsers).

For example, you can set your code to use an environment variable such as `IS_LOCAL`, then use if/else statements to direct Puppeteer to the correct environment.

```javascript
const viewport = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
};
const headlessType = process.env.IS_LOCAL ? false : "shell";
const browser = await puppeteer.launch({
  args:
    process.env.IS_LOCAL ?
      puppeteer.defaultArgs()
    : puppeteer.defaultArgs({ args: chromium.args, headless: headlessType }),
  defaultViewport: viewport,
  executablePath:
    process.env.IS_LOCAL ?
      "/tmp/localChromium/chromium/linux-1122391/chrome-linux/chrome"
    : await chromium.executablePath(),
  headless: headlessType,
});
```

### macOS and Playwright

The Chromium binary included in this package is compiled for **Linux only** and will not work on macOS or Windows. For local development:

**With Puppeteer:**
Set the `IS_LOCAL` environment variable and install Chrome or Chromium locally. The code example above demonstrates this pattern.

**With Playwright:**
Install a local Chromium using Playwright's CLI, then configure your code to use it in local development:

```typescript
import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

const isLocal = process.env.IS_LOCAL;

const browser = await playwright.launch({
  args: isLocal ? [] : chromium.args,
  executablePath:
    isLocal ?
      "/path/to/local/chromium" // e.g., from `npx playwright install chromium`
    : await chromium.executablePath(),
  headless: true,
});
```

To install Chromium locally via Playwright:

```bash
npx playwright install chromium
```

## Bundler Configuration

When using a bundler (esbuild, webpack, rollup, etc.), `@sparticuz/chromium` must be marked as **external**. The package relies on relative path resolution to locate its binary files, which breaks when bundled.

<details>
<summary>esbuild</summary>

```bash
esbuild --bundle --external:@sparticuz/chromium index.js
```

Or if you want to externalize all packages:

```bash
esbuild --bundle --packages=external index.js
```

</details>

<details>
<summary>webpack</summary>

```javascript
// webpack.config.js
module.exports = {
  externals: ["@sparticuz/chromium"],
  // ... rest of config
};
```

</details>

<details>
<summary>Serverless Framework (with serverless-esbuild)</summary>

```yaml
# serverless.yml
custom:
  esbuild:
    external:
      - "@sparticuz/chromium"
```

</details>

If you see the error `The input directory "/var/task/bin" does not exist`, this almost certainly means the package was not externalized in your bundler configuration.

## Frequently Asked Questions

### Can I use ARM or Graviton instances?

YES! Starting at Chromium v135, arm64 binaries are available as a Lambda layer zip and a pack tar in each [GitHub release](https://github.com/Sparticuz/chromium/releases).

> **Note:** The npm package (`@sparticuz/chromium`) includes only x64 binaries. For arm64, use the `@sparticuz/chromium-min` package and then use one of these options:
>
> - **Lambda layer** — download `chromium-VERSION-layer.arm64.zip` from the release and upload it as a Lambda layer
> - **Remote pack** — host `chromium-VERSION-pack.arm64.tar` at an HTTPS URL and pass it to `chromium.executablePath("https://example.com/chromium-pack.arm64.tar")`

### Can I use Google Chrome or Chrome for Testing? What is chrome-headless-shell?

`headless_shell` is a purpose-built version of Chromium specifically for headless purposes. It does not include a GUI and only works via remote debugging connection. This is what this package is built on.

- https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md
- https://source.chromium.org/chromium/chromium/src/+/main:headless/app/headless_shell.cc
- https://developer.chrome.com/blog/chrome-headless-shell

### Can I use the "new" Headless mode?

From what I can tell, `headless_shell` does not seem to include support for the "new" headless mode.

### It doesn't work with Webpack!?

Try marking this package as an external dependency.

- https://webpack.js.org/configuration/externals/

### I'm experiencing timeouts or failures closing Chromium

This is a common issue. Chromium sometimes opens more pages than you expect. You can try the following:

```typescript
for (const page of await browser.pages()) {
  await page.close();
}
await browser.close();
```

You can also try the following if one of the calls is hanging for some reason:

```typescript
await Promise.race([browser.close(), browser.close(), browser.close()]);
```

Always `await browser.close()`, even if your script is returning an error.

### `BrowserContext` isn't working properly (Target.closed)

You may not be able to create a new context. You can try to use the default context as seen in this patch: https://github.com/Sparticuz/chromium/issues/298

### Do I need to use @sparticuz/chromium?

This package is designed to be run on a vanilla Lambda instance. If you are using a Dockerfile to publish your code to Lambda, it may be better to install Chromium and its dependencies from the distribution's repositories.

### I need accessible PDF files

This is due to the way @sparticuz/chromium is built. If you require accessible PDFs, you'll need to
recompile Chromium yourself with the following patch. You can then use that binary with @sparticuz/chromium-min.

_Note_: This will increase the time required to generate a PDF.

```patch
diff --git a/_/ec2/args-x64.gn b/_/ec2/args-x64.gn
--- a/_/ec2/args-x64.gn
+++ b/_/ec2/args-x64.gn
@@ -6,7 +6,9 @@
 disable_histogram_support = false
-enable_basic_print_dialog = false
 enable_basic_printing = true
+enable_pdf = true
+enable_tagged_pdf = true
 enable_keystone_registration_framework = false
```

### Can I use a language other than Javascript (NodeJS)?

Yes, you will need to write your own Brotli extraction algorithm and args inclusion. (Basically, rewrite the typescript files). The binaries, once extracted, will work with any language.

- C Sharp: https://github.com/Podginator/lambda-chromium-playwright-CSharp/tree/main

<details>
<summary>Playwright: Lambda /tmp fills up after repeated invocations</summary>

Playwright does not automatically clean up its user data directory between invocations on a warm Lambda. Over time, `/tmp` fills up and you'll see `ERR_INSUFFICIENT_RESOURCES` errors.

**Workaround:** Set a unique `--user-data-dir` for each invocation and clean it up afterward:

```typescript
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

const userDataDir = `/tmp/pw-${randomUUID()}`;

const browser = await playwright.launch({
  args: [...chromium.args, `--user-data-dir=${userDataDir}`],
  executablePath: await chromium.executablePath(),
  headless: true,
});

try {
  // ... your code ...
} finally {
  await browser.close();
  await rm(userDataDir, { recursive: true, force: true });
}
```

This issue does not affect Puppeteer, which manages user data directories differently.

</details>

## Fonts

The AWS Lambda runtime is not provisioned with any font faces.

Because of this, this package ships with [Open Sans](https://fonts.google.com/specimen/Open+Sans), which supports the following scripts:

- Latin
- Greek
- Cyrillic

You can provision additional fonts via AWS Lambda Layers.

Create a directory named `.fonts` or `fonts` and place any font faces you want there:

```
.fonts
├── NotoColorEmoji.ttf
└── Roboto.ttf
```

Afterwards, zip the directory and upload it as an AWS Lambda Layer:

```shell
zip -9 --filesync --move --recurse-paths fonts.zip fonts/
```

Font directories are specified inside the `fonts.conf` file found inside the `bin/fonts.tar.br` file. These are the default folders:

- `/var/task/.fonts`
- `/var/task/fonts`
- `/opt/fonts`
- `/tmp/fonts`

## Graphics

By default, this package uses `swiftshader`/`angle` to do CPU acceleration for WebGL. This is the only known way to enable WebGL on a serverless platform. You can disable WebGL by setting `chromium.setGraphicsMode = false;` _before_ launching Chromium. Chromium still requires extracting the `bin/swiftshader.tar.br` file in order to launch. Testing is needed to determine if there is any positive speed impact from disabling WebGL.

## API

| Method / Property                   | Returns           | Description                                                                                                                                             |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                              | `Array<string>`   | Provides a list of recommended additional [Chromium flags](https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md). |
| `executablePath(location?: string)` | `Promise<string>` | Returns the path where the Chromium binary was extracted.                                                                                               |
| `setGraphicsMode`                   | `void`            | Sets the graphics mode to either `true` or `false`.                                                                                                     |
| `graphics`                          | `boolean`         | Returns a boolean indicating whether WebGL is enabled or disabled.                                                                                      |

## Extra Args documentation

- [Comparisons](https://docs.google.com/spreadsheets/d/1n-vw_PCPS45jX3Jt9jQaAhFqBY6Ge1vWF_Pa0k7dCk4)
- [Puppeteer Default Args](https://github.com/puppeteer/puppeteer/blob/729c160cba596a9b7b505abd4be99cba1af2e1f3/packages/puppeteer-core/src/node/ChromeLauncher.ts#L156)
- [Playwright Default Args](https://github.com/microsoft/playwright/blob/ed23a935121687d246cb61f4146b50a7972864d9/packages/playwright-core/src/server/chromium/chromium.ts#L276)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including AWS setup,
SSH key generation, GitHub configuration, and the build/release process.

**Quick start for code changes:**

1. Edit source files in [`source/`](source/).
2. Create or update tests in [`tests/`](tests/).
3. Lint: `npm run lint`
4. Build: `npm run build`
5. Test: `npm run test:source` (unit) and `npm run test:integration` (requires AWS SAM CLI + Docker).

**Updating Chromium binaries:**

1. Run `npm run update` to fetch the latest revision into [`_/ec2/revision.txt`](_/ec2/revision.txt).
2. Open a PR — the `binaries:needed` label is added automatically.
3. Add the `binaries:build` label to start the EC2 build (~5 hours).
4. After `binaries:available` appears, add the `binaries:test` label to run tests.
5. See [CONTRIBUTING.md](CONTRIBUTING.md#build-system) for build options and monitoring.

> **Note:** PRs with binary files are not accepted. Binaries are built by EC2 and stored in S3.

## AWS Lambda Layer

[Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) are a convenient way to manage common dependencies between different Lambda Functions.

The following set of (Linux) commands will create a layer of this package:

```shell
archType="x64" && \
git clone --depth=1 https://github.com/sparticuz/chromium.git && \
cd chromium && \
make chromium.${archType}$.zip
```

The above will create a `chromium.x64.zip` file, which can be uploaded to your Layers console. If you are using `arm64`, replace the value accordingly. You can and should upload using the `aws cli`. (Replace the variables with your own values.)

```shell
bucketName="chromiumUploadBucket" && archType="x64" && versionNumber="v135.0.0" && \
aws s3 cp chromium.${archType}.zip "s3://${bucketName}/chromiumLayers/chromium-${versionNumber}-layer.${archType}.zip" && \
aws lambda publish-layer-version --layer-name chromium --description "Chromium v${versionNumber} for ${archType}" --content "S3Bucket=${bucketName},S3Key=chromiumLayers/chromium-${versionNumber}-layer.${archType}.zip" --compatible-runtimes "nodejs20.x" "nodejs22.x" --compatible-architectures $(if [ "$archType" = "x64" ]; then echo "x86_64"; else echo "$archType"; fi)
```

Alternatively, you can also download the layer artifact from one of our [releases](https://github.com/Sparticuz/chromium/releases).

## Compression

The Chromium binary is compressed using the Brotli algorithm.

This provides the best compression ratio and faster decompression times.

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

## Backers

If you or your organization have benefited financially from this package, please consider supporting.

Thank you to the following users and companies for your support!

![Sponsors](https://raw.githubusercontent.com/Sparticuz/Sparticuz/refs/heads/master/sponsorkit/sponsors.svg)

## License

MIT
