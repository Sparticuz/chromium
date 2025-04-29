import { existsSync, mkdirSync } from "node:fs";
import { inflate } from "./lambdafs.js";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  downloadAndExtract,
  isRunningInAwsLambda,
  isValidUrl,
  isRunningInAwsLambdaNode20,
  setupLambdaEnvironment,
  createSymlink,
  downloadFile,
} from "./helper.js";

const nodeMajorVersion = parseInt(process.versions.node.split(".")[0] ?? "");

// Setup the lambda environment
if (isRunningInAwsLambda(nodeMajorVersion)) {
  setupLambdaEnvironment("/tmp/al2/lib");
} else if (isRunningInAwsLambdaNode20(nodeMajorVersion)) {
  setupLambdaEnvironment("/tmp/al2023/lib");
}

export default class {
  /**
   * If true, the graphics stack and webgl is enabled,
   * If false, webgl will be disabled.
   * (If false, the swiftshader.tar.br file will also not extract)
   */
  private static graphicsMode: boolean = true;

  /**
   * Downloads or symlinks a custom font and returns its basename, patching the environment so that Chromium can find it.
   */
  static async font(input: string): Promise<string> {
    const fontsDir = `${process.env["HOME"]}/.fonts`;

    // Create fonts directory if it doesn't exist
    if (!existsSync(fontsDir)) {
      mkdirSync(fontsDir);
    }

    // Convert local path to file URL if needed
    if (!/^https?:[/][/]/i.test(input)) {
      input = `file://${input}`;
    }

    const url = new URL(input);
    const fontName = url.pathname.split("/").pop();

    if (!fontName) {
      throw new Error(`Invalid font name: ${url.pathname}`);
    }
    const outputPath = `${fontsDir}/${fontName}`;

    // Return font name if it already exists
    if (existsSync(outputPath)) {
      return fontName;
    }

    // Handle local file
    if (url.protocol === "file:") {
      try {
        await createSymlink(url.pathname, outputPath);
        return fontName;
      } catch (error) {
        throw new Error(`Failed to create symlink for font: ${error}`);
      }
    }
    // Handle remote file
    else {
      try {
        await downloadFile(input, outputPath);
        return fontName;
      } catch (error) {
        throw new Error(`Failed to download font: ${error}`);
      }
    }
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
      "--disk-cache-size=33554432", // https://source.chromium.org/search?q=lang:cpp+symbol:kDiskCacheSize&ss=chromium
      "--no-default-browser-check", // Disable the default browser check, do not prompt to set it as such
      "--no-pings", // Don't send hyperlink auditing pings
      "--single-process", // Runs the renderer and plugins in the same process as the browser. NOTES: Needs to be single-process to avoid `prctl(PR_SET_NO_NEW_PRIVS) failed` error
      "--font-render-hinting=none", // https://github.com/puppeteer/puppeteer/issues/2410#issuecomment-560573612
    ];
    const chromiumDisableFeatures = [
      "AudioServiceOutOfProcess",
      "IsolateOrigins",
      "site-per-process", // Disables OOPIF. https://www.chromium.org/Home/chromium-security/site-isolation
    ];
    const chromiumEnableFeatures = ["SharedArrayBuffer"];

    const graphicsFlags = [
      "--hide-scrollbars", // https://source.chromium.org/search?q=lang:cpp+symbol:kHideScrollbars&ss=chromium
      "--ignore-gpu-blocklist", // https://source.chromium.org/search?q=lang:cpp+symbol:kIgnoreGpuBlocklist&ss=chromium
      "--in-process-gpu", // Saves some memory by moving GPU process into a browser process thread
      "--window-size=1920,1080", // Sets the initial window size. Provided as string in the format "800,600".
    ];

    // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
    this.graphics
      ? graphicsFlags.push(
          // As the unsafe WebGL fallback, SwANGLE (ANGLE + SwiftShader Vulkan)
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader"
        )
      : graphicsFlags.push("--disable-webgl");

    const insecureFlags = [
      "--allow-running-insecure-content", // https://source.chromium.org/search?q=lang:cpp+symbol:kAllowRunningInsecureContent&ss=chromium
      "--disable-setuid-sandbox", // Lambda runs as root, so this is required to allow Chromium to run as root
      "--disable-site-isolation-trials", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSiteIsolation&ss=chromium
      "--disable-web-security", // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableWebSecurity&ss=chromium
    ];

    const headlessFlags = [
      "--headless='shell'", // We only support running chrome-headless-shell
      "--no-sandbox", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoSandbox&ss=chromium
      "--no-zygote", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoZygote&ss=chromium
    ];

    return [
      ...chromiumFlags,
      `--disable-features=${[...chromiumDisableFeatures].join(",")}`,
      `--enable-features=${[...chromiumEnableFeatures].join(",")}`,
      ...graphicsFlags,
      ...insecureFlags,
      ...headlessFlags,
    ];
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
    if (existsSync("/tmp/chromium")) {
      return "/tmp/chromium";
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
    input ??= join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

    /**
     * If the input directory doesn't exist, throw an error.
     */
    if (!existsSync(input)) {
      throw new Error(`The input directory "${input}" does not exist.`);
    }

    // Extract the required files
    const promises = [
      inflate(`${input}/chromium.br`),
      inflate(`${input}/fonts.tar.br`),
      inflate(`${input}/swiftshader.tar.br`),
    ];
    if (isRunningInAwsLambda(nodeMajorVersion)) {
      // If running in AWS Lambda, extract more required files
      promises.push(inflate(`${input}/al2.tar.br`));
    }
    if (isRunningInAwsLambdaNode20(nodeMajorVersion)) {
      promises.push(inflate(`${input}/al2023.tar.br`));
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
   * @default true
   */
  public static set setGraphicsMode(value: boolean) {
    if (typeof value !== "boolean") {
      throw new Error(
        `Graphics mode must be a boolean, you entered '${value}'`
      );
    }
    this.graphicsMode = value;
  }
}
