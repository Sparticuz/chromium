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
declare class Chromium {
    /**
     * Determines the headless mode that chromium will run at
     * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
     * @values true or "new"
     */
    private static headlessMode;
    /**
     * If true, the graphics stack and webgl is enabled,
     * If false, webgl will be disabled.
     * (If false, the swiftshader.tar.br file will also not extract)
     */
    private static graphicsMode;
    /**
     * Downloads or symlinks a custom font and returns its basename, patching the environment so that Chromium can find it.
     */
    static font(input: string): Promise<string>;
    /**
     * Returns a list of additional Chromium flags recommended for serverless environments.
     * The canonical list of flags can be found on https://peter.sh/experiments/chromium-command-line-switches/.
     */
    static get args(): string[];
    /**
     * Returns sensible default viewport settings for serverless environments.
     */
    static get defaultViewport(): Required<Viewport>;
    /**
     * Inflates the included version of Chromium
     * @param input The location of the `bin` folder
     * @returns The path to the `chromium` binary
     */
    static executablePath(input?: string): Promise<string>;
    /**
     * Returns the headless mode.
     * `true` means the 'old' (legacy, chromium < 112) headless mode.
     * "new" means the 'new' headless mode.
     * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
     * @returns true | "new"
     */
    static get headless(): true | "new";
    /**
     * Sets the headless mode.
     * `true` means the 'old' (legacy, chromium < 112) headless mode.
     * "new" means the 'new' headless mode.
     * https://developer.chrome.com/articles/new-headless/#try-out-the-new-headless
     * @default "new"
     */
    static set setHeadlessMode(value: true | "new");
    /**
     * Returns whether the graphics stack is enabled or disabled
     * @returns boolean
     */
    static get graphics(): boolean;
    /**
     * Sets whether the graphics stack is enabled or disabled.
     * @param true means the stack is enabled. WebGL will work.
     * @param false means that the stack is disabled. WebGL will not work.
     * `false` will also skip the extract of the graphics driver, saving about a second during initial extract
     * @default true
     */
    static set setGraphicsMode(value: boolean);
}
export = Chromium;
