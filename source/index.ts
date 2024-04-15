import {
  access,
  createWriteStream,
  existsSync,
  mkdirSync,
  symlink,
} from "node:fs";
import { https } from "follow-redirects";
import LambdaFS from "./lambdafs";
import { join } from "node:path";
import { URL } from "node:url";
import {
  downloadAndExtract,
  isRunningInAwsLambda,
  isValidUrl,
  isRunningInAwsLambdaNode20,
} from "./helper";

/** Viewport taken from https://github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.viewport.md */
interface Viewport {
  /**
   * The page width in pixels.
   */
  width: number;
  /**
   * The page height in pixels.
   */
  height: number;
  /**
   * Specify device scale factor.
   * See {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | devicePixelRatio} for more info.
   * @default 1
   */
  deviceScaleFactor?: number;
  /**
   * Whether the `meta viewport` tag is taken into account.
   * @default false
   */
  isMobile?: boolean;
  /**
   * Specifies if the viewport is in landscape mode.
   * @default false
   */
  isLandscape?: boolean;
  /**
   * Specify if the viewport supports touch events.
   * @default false
   */
  hasTouch?: boolean;
}

if (isRunningInAwsLambda()) {
  if (process.env["FONTCONFIG_PATH"] === undefined) {
    process.env["FONTCONFIG_PATH"] = "/tmp/fonts";
  }

  if (process.env["LD_LIBRARY_PATH"] === undefined) {
    process.env["LD_LIBRARY_PATH"] = "/tmp/al2/lib";
  } else if (
    process.env["LD_LIBRARY_PATH"].startsWith("/tmp/al2/lib") !== true
  ) {
    process.env["LD_LIBRARY_PATH"] = [
      ...new Set([
        "/tmp/al2/lib",
        ...process.env["LD_LIBRARY_PATH"].split(":"),
      ]),
    ].join(":");
  }
}

if (isRunningInAwsLambdaNode20()) {
  if (process.env["FONTCONFIG_PATH"] === undefined) {
    process.env["FONTCONFIG_PATH"] = "/tmp/fonts";
  }

  if (process.env["LD_LIBRARY_PATH"] === undefined) {
    process.env["LD_LIBRARY_PATH"] = "/tmp/al2023/lib";
  } else if (
    process.env["LD_LIBRARY_PATH"].startsWith("/tmp/al2023/lib") !== true
  ) {
    process.env["LD_LIBRARY_PATH"] = [
      ...new Set([
        "/tmp/al2023/lib",
        ...process.env["LD_LIBRARY_PATH"].split(":"),
      ]),
    ].join(":");
  }
}

class Chromium {
  /**
   * If true, the graphics stack and webgl is enabled,
   * If false, webgl will be disabled.
   * (If false, the swiftshader.tar.br file will also not extract)
   */
  private static graphicsMode: boolean = true;

  /**
   * Downloads or symlinks a custom font and returns its basename, patching the environment so that Chromium can find it.
   */
  static font(input: string): Promise<string> {
    if (process.env["HOME"] === undefined) {
      process.env["HOME"] = "/tmp";
    }

    if (existsSync(`${process.env["HOME"]}/.fonts`) !== true) {
      mkdirSync(`${process.env["HOME"]}/.fonts`);
    }

    return new Promise((resolve, reject) => {
      if (/^https?:[/][/]/i.test(input) !== true) {
        input = `file://${input}`;
      }

      const url = new URL(input);
      const output = `${process.env["HOME"]}/.fonts/${url.pathname
        .split("/")
        .pop()}`;

      if (existsSync(output) === true) {
        return resolve(output.split("/").pop() as string);
      }

      if (url.protocol === "file:") {
        access(url.pathname, (error) => {
          if (error != null) {
            return reject(error);
          }

          symlink(url.pathname, output, (error) => {
            return error != null
              ? reject(error)
              : resolve(url.pathname.split("/").pop() as string);
          });
        });
      } else {
        https.get(input, (response) => {
          if (response.statusCode !== 200) {
            return reject(`Unexpected status code: ${response.statusCode}.`);
          }

          const stream = createWriteStream(output);

          stream.once("error", (error) => {
            return reject(error);
          });

          response.on("data", (chunk) => {
            stream.write(chunk);
          });

          response.once("end", () => {
            stream.end(() => {
              return resolve(url.pathname.split("/").pop() as string);
            });
          });
        });
      }
    });
  }

  /**
   * Returns a list of additional Chromium flags recommended for serverless environments.
   * The canonical list of flags can be found on https://peter.sh/experiments/chromium-command-line-switches/.
   * Most of below can be found here: https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md
   */
  static get args(): string[] {
    const chromiumFlags = [
      "--ash-no-nudges", // Avoids blue bubble "user education" nudges (eg., "… give your browser a new look", Memory Saver)
      "--disable-domain-reliability", // Disables Domain Reliability Monitoring, which tracks whether the browser has difficulty contacting Google-owned sites and uploads reports to Google.
      "--disable-print-preview", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisablePrintPreview&ss=chromium
      // "--disable-speech-api", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSpeechAPI&ss=chromium
      "--disk-cache-size=33554432", // https://source.chromium.org/search?q=lang:cpp+symbol:kDiskCacheSize&ss=chromium
      "--no-default-browser-check", // Disable the default browser check, do not prompt to set it as such
      "--no-pings", // Don't send hyperlink auditing pings
      "--single-process", // Runs the renderer and plugins in the same process as the browser. NOTES: Needs to be single-process to avoid `prctl(PR_SET_NO_NEW_PRIVS) failed` error
      "--font-render-hinting=none", // https://github.com/puppeteer/puppeteer/issues/2410#issuecomment-560573612
    ];
    const chromiumDisableFeatures = [
      // "AutofillServerCommunication", // Disables autofill server communication. This feature isn't disabled via other 'parent' flags.
      "AudioServiceOutOfProcess",
      // "DestroyProfileOnBrowserClose", // Disable the feature of: Destroy profiles when their last browser window is closed, instead of when the browser exits.
      // "InterestFeedContentSuggestions", // Disables the Discover feed on NTP
      "IsolateOrigins",
      "site-per-process", // Disables OOPIF. https://www.chromium.org/Home/chromium-security/site-isolation
    ];
    const chromiumEnableFeatures = ["SharedArrayBuffer"];

    const graphicsFlags = [
      "--ignore-gpu-blocklist", // https://source.chromium.org/search?q=lang:cpp+symbol:kIgnoreGpuBlocklist&ss=chromium
      "--in-process-gpu", // Saves some memory by moving GPU process into a browser process thread
      "--window-size=1920,1080", // Sets the initial window size. Provided as string in the format "800,600".
    ];
    // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
    // https://developer.chrome.com/blog/supercharge-web-ai-testing
    // https://www.browserless.io/blog/2023/08/31/browserless-gpu-instances/
    this.graphics &&
      graphicsFlags.push(
        "--enable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader"
      );

    const insecureFlags = [
      "--allow-running-insecure-content", // https://source.chromium.org/search?q=lang:cpp+symbol:kAllowRunningInsecureContent&ss=chromium
      "--disable-setuid-sandbox", // Lambda runs as root, so this is required to allow Chromium to run as root
      "--disable-site-isolation-trials", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSiteIsolation&ss=chromium
      "--disable-web-security", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableWebSecurity&ss=chromium
      "--no-sandbox", // Lambda runs as root, so this is required to allow Chromium to run as root
      "--no-zygote", // https://codereview.chromium.org/2384163002
    ];

    return [
      ...chromiumFlags,
      `--disable-features=${[...chromiumDisableFeatures].join(",")}`,
      `--enable-features=${[...chromiumEnableFeatures].join(",")}`,
      ...graphicsFlags,
      ...insecureFlags,
    ];
  }

  /**
   * Returns sensible default viewport settings for serverless environments.
   */
  static get defaultViewport(): Required<Viewport> {
    return {
      deviceScaleFactor: 1,
      hasTouch: false,
      height: 1080,
      isLandscape: true,
      isMobile: false,
      width: 1920,
    };
  }

  /**
   * Inflates the included version of Chromium
   * @param input The location of the `bin` folder
   * @returns The path to the `chromium` binary
   */
  static async executablePath(input?: string): Promise<string> {
    /**
     * If the `chromium` binary already exists in /tmp/chromium, return it.
     */
    if (existsSync("/tmp/chromium") === true) {
      return Promise.resolve("/tmp/chromium");
    }

    /**
     * If input is a valid URL, download and extract the file. It will extract to /tmp/chromium-pack
     * and executablePath will be recursively called on that location, which will then extract
     * the brotli files to the correct locations
     */
    if (input && isValidUrl(input)) {
      return this.executablePath(await downloadAndExtract(input));
    }

    /**
     * If input is defined, use that as the location of the brotli files,
     * otherwise, the default location is ../bin.
     * A custom location is needed for workflows that using custom packaging.
     */
    input ??= join(__dirname, "..", "bin");

    /**
     * If the input directory doesn't exist, throw an error.
     */
    if (!existsSync(input)) {
      throw new Error(`The input directory "${input}" does not exist.`);
    }

    // Extract the required files
    const promises = [
      LambdaFS.inflate(`${input}/chromium.br`),
      LambdaFS.inflate(`${input}/fonts.tar.br`),
    ];
    if (this.graphics) {
      // Only inflate graphics stack if needed
      promises.push(LambdaFS.inflate(`${input}/swiftshader.tar.br`));
    }
    if (isRunningInAwsLambda()) {
      // If running in AWS Lambda, extract more required files
      promises.push(LambdaFS.inflate(`${input}/al2.tar.br`));
    }
    if (isRunningInAwsLambdaNode20()) {
      promises.push(LambdaFS.inflate(`${input}/al2023.tar.br`));
    }

    // Await all extractions
    const result = await Promise.all(promises);
    // Returns the first result of the promise, which is the location of the `chromium` binary
    return result.shift() as string;
  }

  /**
   * Returns whether the graphics stack is enabled or disabled
   * @returns boolean
   */
  public static get graphics() {
    return this.graphicsMode;
  }

  /**
   * Sets whether the graphics stack is enabled or disabled.
   * @param true means the stack is enabled. WebGL will work.
   * @param false means that the stack is disabled. WebGL will not work.
   * `false` will also skip the extract of the graphics driver, saving about a second during initial extract
   * @default true
   */
  public static set setGraphicsMode(value: boolean) {
    if (typeof value !== "boolean") {
      throw new Error(
        `Graphics mode must be a boolean, you entered '${value}'`
      );
    }

    // Disabling 'disabling the gpu'
    // Blocked by https://github.com/Sparticuz/chromium/issues/247
    // this.graphicsMode = value;
    this.graphicsMode = true;
  }
}

export = Chromium;
