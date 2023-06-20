"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = require("node:fs");
const follow_redirects_1 = require("follow-redirects");
const lambdafs_1 = __importDefault(require("./lambdafs"));
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const helper_1 = require("./helper");
if ((0, helper_1.isRunningInAwsLambda)()) {
    if (process.env["FONTCONFIG_PATH"] === undefined) {
        process.env["FONTCONFIG_PATH"] = "/tmp/aws";
    }
    if (process.env["LD_LIBRARY_PATH"] === undefined) {
        process.env["LD_LIBRARY_PATH"] = "/tmp/aws/lib";
    }
    else if (process.env["LD_LIBRARY_PATH"].startsWith("/tmp/aws/lib") !== true) {
        process.env["LD_LIBRARY_PATH"] = [
            ...new Set([
                "/tmp/aws/lib",
                ...process.env["LD_LIBRARY_PATH"].split(":"),
            ]),
        ].join(":");
    }
}
class Chromium {
    /**
     * Downloads or symlinks a custom font and returns its basename, patching the environment so that Chromium can find it.
     */
    static font(input) {
        if (process.env["HOME"] === undefined) {
            process.env["HOME"] = "/tmp";
        }
        if ((0, node_fs_1.existsSync)(`${process.env["HOME"]}/.fonts`) !== true) {
            (0, node_fs_1.mkdirSync)(`${process.env["HOME"]}/.fonts`);
        }
        return new Promise((resolve, reject) => {
            if (/^https?:[/][/]/i.test(input) !== true) {
                input = `file://${input}`;
            }
            const url = new node_url_1.URL(input);
            const output = `${process.env["HOME"]}/.fonts/${url.pathname
                .split("/")
                .pop()}`;
            if ((0, node_fs_1.existsSync)(output) === true) {
                return resolve(output.split("/").pop());
            }
            if (url.protocol === "file:") {
                (0, node_fs_1.access)(url.pathname, (error) => {
                    if (error != null) {
                        return reject(error);
                    }
                    (0, node_fs_1.symlink)(url.pathname, output, (error) => {
                        return error != null
                            ? reject(error)
                            : resolve(url.pathname.split("/").pop());
                    });
                });
            }
            else {
                follow_redirects_1.https.get(input, (response) => {
                    if (response.statusCode !== 200) {
                        return reject(`Unexpected status code: ${response.statusCode}.`);
                    }
                    const stream = (0, node_fs_1.createWriteStream)(output);
                    stream.once("error", (error) => {
                        return reject(error);
                    });
                    response.on("data", (chunk) => {
                        stream.write(chunk);
                    });
                    response.once("end", () => {
                        stream.end(() => {
                            return resolve(url.pathname.split("/").pop());
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
    static get args() {
        /**
         * These are the default args in puppeteer.
         * https://github.com/puppeteer/puppeteer/blob/3a31070d054fa3cd8116ca31c578807ed8d6f987/packages/puppeteer-core/src/node/ChromeLauncher.ts#L185
         */
        const puppeteerFlags = [
            "--allow-pre-commit-input",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-client-side-phishing-detection",
            "--disable-component-extensions-with-background-pages",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-hang-monitor",
            "--disable-ipc-flooding-protection",
            "--disable-popup-blocking",
            "--disable-prompt-on-repost",
            "--disable-renderer-backgrounding",
            "--disable-sync",
            "--enable-automation",
            // TODO(sadym): remove '--enable-blink-features=IdleDetection' once
            // IdleDetection is turned on by default.
            "--enable-blink-features=IdleDetection",
            "--export-tagged-pdf",
            "--force-color-profile=srgb",
            "--metrics-recording-only",
            "--no-first-run",
            "--password-store=basic",
            "--use-mock-keychain",
        ];
        const puppeteerDisableFeatures = [
            "Translate",
            "BackForwardCache",
            // AcceptCHFrame disabled because of crbug.com/1348106.
            "AcceptCHFrame",
            "MediaRouter",
            "OptimizationHints",
        ];
        const puppeteerEnableFeatures = ["NetworkServiceInProcess2"];
        const chromiumFlags = [
            "--disable-domain-reliability",
            "--disable-print-preview",
            "--disable-speech-api",
            "--disk-cache-size=33554432",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-pings",
            "--single-process", // Needs to be single-process to avoid `prctl(PR_SET_NO_NEW_PRIVS) failed` error
        ];
        const chromiumDisableFeatures = [
            "AudioServiceOutOfProcess",
            "IsolateOrigins",
            "site-per-process",
        ];
        const chromiumEnableFeatures = ["SharedArrayBuffer"];
        const graphicsFlags = [
            "--hide-scrollbars",
            "--ignore-gpu-blocklist",
            "--in-process-gpu",
            "--window-size=1920,1080", // https://source.chromium.org/search?q=lang:cpp+symbol:kWindowSize&ss=chromium
        ];
        // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
        this.graphics
            ? graphicsFlags.push("--use-gl=angle", "--use-angle=swiftshader")
            : graphicsFlags.push("--disable-webgl");
        const insecureFlags = [
            "--allow-running-insecure-content",
            "--disable-setuid-sandbox",
            "--disable-site-isolation-trials",
            "--disable-web-security",
            "--no-sandbox",
            "--no-zygote", // https://source.chromium.org/search?q=lang:cpp+symbol:kNoZygote&ss=chromium
        ];
        const headlessFlags = [
            this.headless === "new" ? "--headless='new'" : "--headless",
        ];
        return [
            ...puppeteerFlags,
            ...chromiumFlags,
            `--disable-features=${[
                ...puppeteerDisableFeatures,
                ...chromiumDisableFeatures,
            ].join(",")}`,
            `--enable-features=${[
                ...puppeteerEnableFeatures,
                ...chromiumEnableFeatures,
            ].join(",")}`,
            ...graphicsFlags,
            ...insecureFlags,
            ...headlessFlags,
        ];
    }
    /**
     * Returns sensible default viewport settings for serverless environments.
     */
    static get defaultViewport() {
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
    static async executablePath(input) {
        /**
         * If the `chromium` binary already exists in /tmp/chromium, return it.
         */
        if ((0, node_fs_1.existsSync)("/tmp/chromium") === true) {
            return Promise.resolve("/tmp/chromium");
        }
        /**
         * If input is a valid URL, download and extract the file. It will extract to /tmp/chromium-pack
         * and executablePath will be recursively called on that location, which will then extract
         * the brotli files to the correct locations
         */
        if (input && (0, helper_1.isValidUrl)(input)) {
            return this.executablePath(await (0, helper_1.downloadAndExtract)(input));
        }
        /**
         * If input is defined, use that as the location of the brotli files,
         * otherwise, the default location is ../bin.
         * A custom location is needed for workflows that using custom packaging.
         */
        input ??= (0, node_path_1.join)(__dirname, "..", "bin");
        /**
         * If the input directory doesn't exist, throw an error.
         */
        if (!(0, node_fs_1.existsSync)(input)) {
            throw new Error(`The input directory "${input}" does not exist.`);
        }
        // Extract the required files
        const promises = [lambdafs_1.default.inflate(`${input}/chromium.br`)];
        if (this.graphics) {
            // Only inflate graphics stack if needed
            promises.push(lambdafs_1.default.inflate(`${input}/swiftshader.tar.br`));
        }
        if ((0, helper_1.isRunningInAwsLambda)()) {
            // If running in AWS Lambda, extract more required files
            promises.push(lambdafs_1.default.inflate(`${input}/aws.tar.br`));
        }
        // Await all extractions
        const result = await Promise.all(promises);
        // Returns the first result of the promise, which is the location of the `chromium` binary
        return result.shift();
    }
    /**
     * Returns the headless mode.
     * `true` means the 'old' (legacy, chromium < 112) headless mode.
     * "new" means the 'new' headless mode.
     * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
     * @returns true | "new"
     */
    static get headless() {
        return this.headlessMode;
    }
    /**
     * Sets the headless mode.
     * `true` means the 'old' (legacy, chromium < 112) headless mode.
     * "new" means the 'new' headless mode.
     * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
     * @default "new"
     */
    static set setHeadlessMode(value) {
        if ((typeof value === "string" && value !== "new") ||
            (typeof value === "boolean" && value !== true)) {
            throw new Error(`Headless mode must be either \`true\` or 'new', you entered '${value}'`);
        }
        this.headlessMode = value;
    }
    /**
     * Returns whether the graphics stack is enabled or disabled
     * @returns boolean
     */
    static get graphics() {
        return this.graphicsMode;
    }
    /**
     * Sets whether the graphics stack is enabled or disabled.
     * @param true means the stack is enabled. WebGL will work.
     * @param false means that the stack is disabled. WebGL will not work.
     * `false` will also skip the extract of the graphics driver, saving about a second during initial extract
     * @default true
     */
    static set setGraphicsMode(value) {
        if (typeof value !== "boolean") {
            throw new Error(`Graphics mode must be a boolean, you entered '${value}'`);
        }
        this.graphicsMode = value;
    }
}
/**
 * Determines the headless mode that chromium will run at
 * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
 * @values true or "new"
 */
Chromium.headlessMode = "new";
/**
 * If true, the graphics stack and webgl is enabled,
 * If false, webgl will be disabled.
 * (If false, the swiftshader.tar.br file will also not extract)
 */
Chromium.graphicsMode = true;
module.exports = Chromium;
