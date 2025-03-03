# @sparticuz/chromium

[![@sparticuz/chromium](https://img.shields.io/npm/v/@sparticuz/chromium.svg?style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium)
[![Chromium](https://img.shields.io/github/size/sparticuz/chromium/bin/chromium.br?label=Chromium&style=for-the-badge)](bin/)
[![npm](https://img.shields.io/npm/dw/@sparticuz/chromium?label=%40sparticuz%2Fchromium&style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium)
[![npm](https://img.shields.io/npm/dw/@sparticuz/chromium-min?label=%40sparticuz%2Fchromium-min&style=for-the-badge)](https://www.npmjs.com/package/@sparticuz/chromium-min)
[![Donate](https://img.shields.io/badge/donate-paypal-orange.svg?style=for-the-badge)](https://paypal.me/sparticuz)

## Chromium for Serverless platforms

[sparticuz/chrome-aws-lambda](https://github.com/sparticuz/chrome-aws-lambda) was originally forked from [alixaxel/chrome-aws-lambda#264](https://github.com/alixaxel/chrome-aws-lambda/pull/264).
The biggest difference, besides the chromium version, is the inclusion of some code from https://github.com/alixaxel/lambdafs, as well as dropping that as a dependency. Due to some changes in WebGL, the files in bin/swiftshader.tar.br need to be extracted to `/tmp` instead of `/tmp/swiftshader`. This necessitated changes in lambdafs.

However, it quickly became difficult to maintain because of the pace of `puppeteer` updates. This package, `@sparticuz/chromium`, is not chained to `puppeteer` versions, but also does not include the overrides and hooks that the original package contained. It is only `chromium`, as well as the special code needed to decompress the brotli package, and a set of predefined arguments tailored to serverless usage.

## Install

[`puppeteer` ships with a preferred version of `chromium`](https://pptr.dev/faq/#q-why-doesnt-puppeteer-vxxx-work-with-chromium-vyyy). In order to figure out what version of `@sparticuz/chromium` you will need, please visit [Puppeteer's Chromium Support page](https://pptr.dev/chromium-support).

> For example, as of today, the latest version of `puppeteer` is `18.0.5`. The latest version of `chromium` stated on `puppeteer`'s support page is `106.0.5249.0`. So you need to install `@sparticuz/chromium@106`.

```shell
# Puppeteer or Playwright is a production dependency
npm install --save puppeteer-core@$PUPPETEER_VERSION
# @sparticuz/chromium can be a DEV dependency IF YOU ARE USING A LAYER, if you are not using a layer, use as a production dependency!
npm install --save-dev @sparticuz/chromium@$CHROMIUM_VERSION
```

If your vendor does not allow large deploys (`chromium.br` is 50+ MB), you'll need to host the `chromium-v#-pack.tar` separately and use the [`@sparticuz/chromium-min` package](https://github.com/Sparticuz/chromium#-min-package).

```shell
npm install --save @sparticuz/chromium-min@$CHROMIUM_VERSION
```

If you wish to install an older version of Chromium, take a look at [@sparticuz/chrome-aws-lambda](https://github.com/Sparticuz/chrome-aws-lambda#versioning) or [@alixaxel/chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda).

## Versioning

The @sparticuz/chromium version schema is as follows:
`MajorChromiumVersion.MinorChromiumIncrement.@Sparticuz/chromiumPatchLevel`

Because this package follows Chromium's releases, it does NOT follow semantic versioning. **Breaking changes can occur with the 'patch' level.** Please check the release notes for information on breaking changes.

## Usage

This package works with all the currently supported AWS Lambda Node.js runtimes out of the box.

```javascript
const test = require("node:test");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// Optional: If you'd like to disable webgl, true is the default.
chromium.setGraphicsMode = false;

// Optional: Load any fonts you need. Open Sans is included by default in AWS Lambda instances
await chromium.font(
  "https://raw.githack.com/googlei18n/noto-emoji/master/fonts/NotoColorEmoji.ttf"
);

test("Check the page title of example.com", async (t) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
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
const { chromium: playwright } = require("playwright-core");
const chromium = require("@sparticuz/chromium");

test("Check the page title of example.com", async (t) => {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
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

You should allocate at least 512 MB of RAM to your instance, however 1600 MB (or more) is recommended.

### -min package

The -min package DOES NOT include the chromium brotli files. There are a few instances where this is useful. Primarily, this is useful when your host has file size limits.

To use the -min package please install the `@sparticuz/chromium-min` package.

When using the -min package, you need to specify the location of the brotli files.

In this example, /opt/chromium contains all the brotli files

```
/opt
  /chromium
    /aws.tar.br
    /chromium.br
    /swiftshader.tar.br
```

```javascript
const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath("/opt/chromium"),
  headless: chromium.headless,
});
```

In the following example, https://www.example.com/chromiumPack.tar contains all the brotli files. Generally, this would be a location on S3, or another very fast downloadable location, that is in close proximity to your function's execution location.

On the initial iteration, `@sparticuz/chromium` will download the pack tar file, untar the files to `/tmp/chromium-pack`, then will un-brotli the `chromium` binary to `/tmp/chromium`. The following iterations will see that `/tmp/chromium` exists and will use the already downloaded files.

The latest chromium-pack.tar file will be on the latest [release](https://github.com/Sparticuz/chromium/releases).

```javascript
const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(
    "https://www.example.com/chromiumPack.tar"
  ),
  headless: chromium.headless,
});
```

### Examples

Here are some example projects and help with other services

- [Production Dependency](https://github.com/Sparticuz/chromium/tree/master/examples/production-dependency)
- [Serverless Framework with Lambda Layer](https://github.com/Sparticuz/chromium/tree/master/examples/serverless-with-lambda-layer)
- [Serverless Framework with Pre-existing Lambda Layer](https://github.com/Sparticuz/chromium/tree/master/examples/serverless-with-preexisting-lambda-layer)
- [Chromium-min](https://github.com/Sparticuz/chromium/tree/master/examples/remote-min-binary)
- [AWS SAM](https://github.com/Sparticuz/chromium/tree/master/examples/aws-sam)
- [Webpack](https://github.com/Sparticuz/chromium/issues/24#issuecomment-1343196897)
- [Netlify](https://github.com/Sparticuz/chromium/issues/24#issuecomment-1414107620)

### Running Locally & Headless/Headful mode

This version of `chromium` is built using the `headless.gn` build variables, which does not even include a GUI. Also, this package does not include an ARM version yet, which means it will not work on any M Series Apple products. If you need to test your code using a headful or ARM version, please use your locally installed version of `chromium/chrome`, or you may use the `puppeteer` provided version. Users have reported installing `rosetta` on MacOS will also work.

```shell
npx @puppeteer/browsers install chromium@latest --path /tmp/localChromium
```

For more information on installing a specific version of `chromium`, check out [@puppeteer/browsers](https://www.npmjs.com/package/@puppeteer/browsers).

For example, you can set your code to use an ENV variable such as `IS_LOCAL`, then use if/else statements to direct puppeteer to the correct environment.

```javascript
const browser = await puppeteer.launch({
  args: process.env.IS_LOCAL ? puppeteer.defaultArgs() : chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: process.env.IS_LOCAL
    ? "/tmp/localChromium/chromium/linux-1122391/chrome-linux/chrome"
    : await chromium.executablePath(),
  headless: process.env.IS_LOCAL ? false : chromium.headless,
});
```

## Frequently asked questions

### Can I use ARM or Graviton instances?

At this point, @sparticuz/chromium does not support ARM.

- https://github.com/Sparticuz/chrome-aws-lambda/pull/11

### Can I use Google Chrome or Chrome for Testing, what is chrome-headless-shell?

`headless_shell` is a purpose built version of `chromium` specific for headless purposes. It does not include the GUI at all and only works via remote debugging connection. This is what this package is built on.

- https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md
- https://source.chromium.org/chromium/chromium/src/+/main:headless/app/headless_shell.cc
- https://developer.chrome.com/blog/chrome-headless-shell

### Can I use the "new" Headless mode?

From what I can tell, `headless_shell` does not seem to include support for the "new" headless mode.

### It doesn't work with Webpack!?!

Try marking this package as an external.

- https://webpack.js.org/configuration/externals/

### I'm experiencing timeouts or failures closing Chromium

This is a common issue. Chromium sometimes opens up more pages than you ask for. You can try the following

```typescript
for (const page of await browser.pages()) {
  await page.close();
}
await browser.close();
```

You can also try the following if one of the calls is hanging for some reason.

```typescript
await Promise.race([browser.close(), browser.close(), browser.close()]);
```

Always `await browser.close()`, even if your script is returning an error.

### `BrowserContext` isn't working properly (Target.closed)

You may not be able to create a new context, you can try to use the default context as seen in this patch: https://github.com/Sparticuz/chromium/issues/298

### Do I need to use @sparticuz/chromium?

This package is designed to be run on a vanilla Lambda instance. If you are using a dockerfile to publish your code to Lambda, it may be a better idea to install `chromium` and it's dependencies from the distribution's repositories.

### I need Accessible pdf files

This is due to the way @sparticuz/chromium is built. If you require accessible pdf's, you'll need to
recompile chromium yourself with the following patch. You can then use that binary with @sparticuz/chromium-min.

_Note_: This will increase the time required to generate a PDF.

```patch
diff --git a/_/ansible/plays/chromium.yml b/_/ansible/plays/chromium.yml
index b42c740..49111d7 100644
--- a/_/ansible/plays/chromium.yml
+++ b/_/ansible/plays/chromium.yml
@@ -249,8 +249,9 @@
           blink_symbol_level = 0
           dcheck_always_on = false
           disable_histogram_support = false
-          enable_basic_print_dialog = false
           enable_basic_printing = true
+          enable_pdf = true
+          enable_tagged_pdf = true
           enable_keystone_registration_framework = false
           enable_linux_installer = false
           enable_media_remoting = false
```

## Fonts

The Amazon Linux 2 AWS Lambda runtime is not provisioned with any font faces.

Because of this, this package ships with [Open Sans](https://fonts.google.com/specimen/Open+Sans), which supports the following scripts:

- Latin
- Greek
- Cyrillic

To provision additional fonts, simply call the `font()` method with an absolute path or URL:

```typescript
await chromium.font("/var/task/fonts/NotoColorEmoji.ttf");
// or
await chromium.font(
  "https://raw.githack.com/googlei18n/noto-emoji/master/fonts/NotoColorEmoji.ttf"
);
```

> `Noto Color Emoji` (or similar) is needed if you want to [render emojis](https://getemoji.com/).

> For URLs, it's recommended that you use a CDN, like [raw.githack.com](https://raw.githack.com/) or [gitcdn.xyz](https://gitcdn.xyz/).

This method should be invoked _before_ launching Chromium.

---

Alternatively, it's also possible to provision fonts via AWS Lambda Layers.

Simply create a directory named `.fonts` or `fonts` and place any font faces you want there:

```
.fonts
├── NotoColorEmoji.ttf
└── Roboto.ttf
```

Afterwards, you just need to ZIP the directory and upload it as a AWS Lambda Layer:

```shell
zip -9 --filesync --move --recurse-paths fonts.zip fonts/
```

Font directories are specified inside of the `fonts.conf` file found inside of the `bin/fonts.tar.br` file. These are the default folders:

- `/var/task/.fonts`
- `/var/task/fonts`
- `/opt/fonts`
- `/tmp/fonts`

## Graphics

By default, this package uses `swiftshader`/`angle` to do CPU acceleration for WebGL. This is the only known way to enable WebGL on a serverless platform. You can disable WebGL by setting `chromium.setGraphiceMode = false;` _before_ launching Chromium. Disabling this will also skip the extract of the `bin/swiftshader.tar.br` file, which saves about a second of initial execution time. Disabling graphics is recommended if you know you are not using any WebGL.

## API

| Method / Property                   | Returns           | Description                                                                                                                                             |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `font(url)`                         | `Promise<string>` | Provisions a custom font and returns its basename.                                                                                                      |
| `args`                              | `Array<string>`   | Provides a list of recommended additional [Chromium flags](https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md). |
| `defaultViewport`                   | `Object`          | Returns a sensible default viewport for serverless.                                                                                                     |
| `executablePath(location?: string)` | `Promise<string>` | Returns the path the Chromium binary was extracted to.                                                                                                  |
|                                     |
| `headless`                          | `"shell"`         | Returns `"shell"` which is what `chrome-headless-shell` requires                                                                                        |
| `setGraphicsMode`                   | `void`            | Sets the graphics mode to either `true` or `false`                                                                                                      |
| `graphics`                          | `boolean`         | Returns a boolean depending on whether webgl is enabled or disabled                                                                                     |

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

The above will create a `chromium.zip` file, which can be uploaded to your Layers console. You can and should upload using the `aws cli`. (Replace the variables with your own values)

```shell
bucketName="chromiumUploadBucket" && \
versionNumber="107" && \
aws s3 cp chromium.zip "s3://${bucketName}/chromiumLayers/chromium${versionNumber}.zip" && \
aws lambda publish-layer-version --layer-name chromium --description "Chromium v${versionNumber}" --content "S3Bucket=${bucketName},S3Key=chromiumLayers/chromium${versionNumber}.zip" --compatible-runtimes nodejs --compatible-architectures x86_64
```

Alternatively, you can also download the layer artifact from one of our [releases](https://github.com/Sparticuz/chromium/releases).

According to our benchmarks, it's 40% to 50% faster than using the off-the-shelf `puppeteer` bundle.

## Migration from `chrome-aws-lambda`

- Change the import or require to be `@sparticuz/chromium`
- Add the import or require for `puppeteer-core`
- Change the browser launch to use the native `puppeteer.launch()` function
- Change the `executablePath` to be a function.

```diff
-const chromium = require('@sparticuz/chrome-aws-lambda');
+const chromium = require("@sparticuz/chromium");
+const puppeteer = require("puppeteer-core");

exports.handler = async (event, context, callback) => {
  let result = null;
  let browser = null;

  try {
-    browser = await chromium.puppeteer.launch({
+    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
-      executablePath: await chromium.executablePath,
+      executablePath: await chromium.executablePath(),
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

## Backers

Thank you for your support!

[![Munawwar](https://avatars.githubusercontent.com/Munawwar?size=100)](https://github.com/munawwar)
[![syntaxfm](https://avatars.githubusercontent.com/syntaxfm?size=100)](https://github.com/syntaxfm)
[![th3madhack3r](https://avatars.githubusercontent.com/th3madhack3r?size=100)](https://github.com/th3madhack3r)

### Past

![C2BB](https://avatars.githubusercontent.com/C2BB?size=30)
![acchou](https://avatars.githubusercontent.com/acchou?size=30)
![infr](https://avatars.githubusercontent.com/infr?size=30)
![aarmora](https://avatars.githubusercontent.com/aarmora?size=30)
![azymnis](https://avatars.githubusercontent.com/azymnis?size=30)
![mushilabs](https://avatars.githubusercontent.com/mushilabs?size=30)
![omgovich](https://avatars.githubusercontent.com/omgovich?size=30)
<img src="https://avatars.githubusercontent.com/kuda1992" width="30" />
![jlee512](https://avatars.githubusercontent.com/jlee512?size=30)
![swain](https://avatars.githubusercontent.com/swain?size=30)

## License

MIT
