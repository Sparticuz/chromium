import {
  access,
  createWriteStream,
  existsSync,
  mkdirSync,
  symlink,
} from "node:fs";
import { IncomingMessage } from "node:http";
import LambdaFS from "./lambdafs";
import { join } from "node:path";
import { URL } from "node:url";
import { downloadAndExtract, isValidUrl } from "./helper";

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
   * @defaultValue 1
   */
  deviceScaleFactor?: number;
  /**
   * Whether the `meta viewport` tag is taken into account.
   * @defaultValue false
   */
  isMobile?: boolean;
  /**
   * Specifies if the viewport is in landscape mode.
   * @defaultValue false
   */
  isLandscape?: boolean;
  /**
   * Specify if the viewport supports touch events.
   * @defaultValue false
   */
  hasTouch?: boolean;
}

if (
  process.env.AWS_EXECUTION_ENV !== undefined &&
  /^AWS_Lambda_nodejs(?:14|16|18)[.]x$/.test(process.env.AWS_EXECUTION_ENV) ===
    true
) {
  if (process.env.FONTCONFIG_PATH === undefined) {
    process.env.FONTCONFIG_PATH = "/tmp/aws";
  }

  if (process.env.LD_LIBRARY_PATH === undefined) {
    process.env.LD_LIBRARY_PATH = "/tmp/aws/lib";
  } else if (process.env.LD_LIBRARY_PATH.startsWith("/tmp/aws/lib") !== true) {
    process.env.LD_LIBRARY_PATH = [
      ...new Set(["/tmp/aws/lib", ...process.env.LD_LIBRARY_PATH.split(":")]),
    ].join(":");
  }
}

class Chromium {
  /**
   * Downloads or symlinks a custom font and returns its basename, patching the environment so that Chromium can find it.
   * If headless is not true, `null` is returned instead.
   */
  static font(input: string): Promise<string | null> {
    if (Chromium.headless !== true) {
      return new Promise((resolve) => {
        return resolve(null);
      });
    }

    if (process.env.HOME === undefined) {
      process.env.HOME = "/tmp";
    }

    if (existsSync(`${process.env.HOME}/.fonts`) !== true) {
      mkdirSync(`${process.env.HOME}/.fonts`);
    }

    return new Promise((resolve, reject) => {
      if (/^https?:[/][/]/i.test(input) !== true) {
        input = `file://${input}`;
      }

      const url = new URL(input);
      const output = `${process.env.HOME}/.fonts/${url.pathname
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
        let handler =
          url.protocol === "http:" ? require("http").get : require("https").get;

        handler(input, (response: IncomingMessage) => {
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
   */
  static get args(): string[] {
    const result = [
      "--allow-running-insecure-content", // https://source.chromium.org/search?q=lang:cpp+symbol:kAllowRunningInsecureContent&ss=chromium
      "--autoplay-policy=user-gesture-required", // https://source.chromium.org/search?q=lang:cpp+symbol:kAutoplayPolicy&ss=chromium
      "--disable-background-timer-throttling",
      "--disable-component-update", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableComponentUpdate&ss=chromium
      "--disable-domain-reliability", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableDomainReliability&ss=chromium
      "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process", // https://source.chromium.org/search?q=file:content_features.cc&ss=chromium
      "--disable-ipc-flooding-protection",
      "--disable-print-preview", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisablePrintPreview&ss=chromium
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSetuidSandbox&ss=chromium
      "--disable-site-isolation-trials", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSiteIsolation&ss=chromium
      "--disable-speech-api", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSpeechAPI&ss=chromium
      "--disable-web-security", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableWebSecurity&ss=chromium
      "--disk-cache-size=33554432", // https://source.chromium.org/search?q=lang:cpp+symbol:kDiskCacheSize&ss=chromium
      "--enable-features=SharedArrayBuffer", // https://source.chromium.org/search?q=file:content_features.cc&ss=chromium
      "--hide-scrollbars", // https://source.chromium.org/search?q=lang:cpp+symbol:kHideScrollbars&ss=chromium
      "--ignore-gpu-blocklist", // https://source.chromium.org/search?q=lang:cpp+symbol:kIgnoreGpuBlocklist&ss=chromium
      "--in-process-gpu", // https://source.chromium.org/search?q=lang:cpp+symbol:kInProcessGPU&ss=chromium
      "--mute-audio", // https://source.chromium.org/search?q=lang:cpp+symbol:kMuteAudio&ss=chromium
      "--no-default-browser-check", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoDefaultBrowserCheck&ss=chromium
      "--no-first-run",
      "--no-pings", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoPings&ss=chromium
      "--no-sandbox", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoSandbox&ss=chromium
      "--no-zygote", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoZygote&ss=chromium
      "--use-gl=angle", // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
      "--use-angle=swiftshader", // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
      "--window-size=1920,1080", // https://source.chromium.org/search?q=lang:cpp+symbol:kWindowSize&ss=chromium
    ];

    if (Chromium.headless === true) {
      result.push("--single-process"); // https://source.chromium.org/search?q=lang:cpp+symbol:kSingleProcess&ss=chromium
    } else {
      result.push("--start-maximized"); // https://source.chromium.org/search?q=lang:cpp+symbol:kStartMaximized&ss=chromium
    }

    return result;
  }

  /**
   * Returns sensible default viewport settings.
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

    const promises = [
      LambdaFS.inflate(`${input}/chromium.br`),
      LambdaFS.inflate(`${input}/swiftshader.tar.br`),
    ];

    if (
      process.env.AWS_EXECUTION_ENV !== undefined &&
      /^AWS_Lambda_nodejs(?:14|16|18)[.]x$/.test(
        process.env.AWS_EXECUTION_ENV
      ) === true
    ) {
      promises.push(LambdaFS.inflate(`${input}/aws.tar.br`));
    }

    const result = await Promise.all(promises);
    return result.shift() as string;
  }

  /**
   * Returns a boolean indicating if we are running on AWS Lambda or Google Cloud Functions.
   * True is returned if the NODE_ENV is set to 'test' for easier integration testing.
   * False is returned if Serverless environment variables `IS_LOCAL` or `IS_OFFLINE` are set.
   */
  static get headless() {
    if (
      process.env.IS_LOCAL !== undefined ||
      process.env.IS_OFFLINE !== undefined
    ) {
      return false;
    }
    if (process.env.NODE_ENV === "test") {
      return true;
    }
    const environments = [
      "AWS_LAMBDA_FUNCTION_NAME",
      "FUNCTION_NAME",
      "FUNCTION_TARGET",
      "FUNCTIONS_EMULATOR",
    ];

    return environments.some((key) => process.env[key] !== undefined);
  }
}

export = Chromium;
