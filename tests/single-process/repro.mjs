/**
 * Reproduction for the removal of `--single-process` from `Chromium.args`.
 *
 * Runs one browser containing one page that wedges its own renderer plus two
 * healthy pages, and times every CDP call made after the wedge.
 *
 *   MODE=without  the default args as this checkout produces them (the default)
 *   MODE=with     the same args with `--single-process` added back
 *
 * Everything is served from a local HTTP server inside the container, so the
 * run is self-contained and touches no external site.
 */
import chromium from "@sparticuz/chromium";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const MODE = process.env.MODE === "with" ? "with" : "without";
const PROTOCOL_TIMEOUT_MS = Number(process.env.PROTOCOL_TIMEOUT_MS ?? 20_000);
const NAVIGATION_TIMEOUT_MS = Number(process.env.NAVIGATION_TIMEOUT_MS ?? 10_000);
const OUT_DIR = process.env.OUT_DIR ?? "/out";
const PORT = 8099;

/** Printed by Chromium once the DevTools endpoint is up. */
const DEVTOOLS_LISTENING_REGEX = /DevTools listening on ws:/;

/**
 * A page that never returns to the task queue: the MutationObserver callback
 * mutates the tree it observes, so it re-queues itself as a microtask forever.
 * The setTimeout escape hatch is a task and therefore never runs.
 */
const HANG_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>wedge</title></head>
  <body>
    <h1>wedge</h1>
    <script>
      const target = document.createElement('div');
      document.body.appendChild(target);
      const observer = new MutationObserver(() => {
        target.remove();
        document.body.appendChild(target);
      });
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
      setTimeout(() => { document.title = 'escaped'; }, 2000);
      target.setAttribute('data-tick', '1');
    </script>
  </body>
</html>`;

const okHtml = (n) => `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>healthy ${n}</title></head>
  <body><h1 id="h">healthy ${n}</h1><script>window.__ok = ${n};</script></body>
</html>`;

const startServer = () =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(req.url === "/hang" ? HANG_HTML : okHtml(req.url.replaceAll(/\D/g, "") || "0"));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });

/**
 * Starts the binary directly and reads its stderr, so a sandbox failure at
 * startup is captured rather than swallowed by the puppeteer launcher.
 */
const rawLaunchCheck = (executablePath, args) =>
  new Promise((resolve) => {
    const child = spawn(executablePath, [...args, "--remote-debugging-port=0", "about:blank"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const finish = (exitCode) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve({
        devToolsListening: DEVTOOLS_LISTENING_REGEX.test(stderr),
        exitCode,
        stderr,
      });
    };
    const timer = setTimeout(finish, 5000, null);
    child.on("exit", (code) => finish(code));
  });

const steps = [];

/** Times one step and records it, never throwing. */
const step = async (name, fn) => {
  const started = Date.now();
  try {
    const value = await fn();
    steps.push({ ms: Date.now() - started, name, ok: true });
    return value;
  } catch (error) {
    steps.push({
      error: `${error.name}: ${error.message.split("\n")[0]}`,
      ms: Date.now() - started,
      name,
      ok: false,
    });
    return;
  }
};

const main = async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${PORT}`;

  // The default list no longer contains the flag, so "with" is the case that adds it.
  const packageArgs = MODE === "with" ? [...chromium.args, "--single-process"] : chromium.args;
  const args = await puppeteer.defaultArgs({ args: packageArgs, headless: "shell" });

  const executablePath = await chromium.executablePath();

  // Probed with the package's own list rather than puppeteer's, because puppeteer
  // adds --remote-debugging-pipe and the DevTools line is then never printed.
  /** Does Chrome start at all without the flag, or does the sandbox guard bite? */
  const rawLaunch = await rawLaunchCheck(executablePath, packageArgs);

  let stderr = rawLaunch.stderr;
  const launchStarted = Date.now();
  const browser = await puppeteer.launch({
    args,
    defaultViewport: { height: 800, width: 1280 },
    executablePath,
    headless: "shell",
    protocolTimeout: PROTOCOL_TIMEOUT_MS,
  });
  const launchMs = Date.now() - launchStarted;
  browser.process()?.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const version = await browser.version();

  /** A healthy page opened before the wedge, to show it is collateral damage. */
  const healthyBefore = await browser.newPage();
  healthyBefore.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await step("healthy page 1: goto (before wedge)", () =>
    healthyBefore.goto(`${base}/ok/1`, { waitUntil: "domcontentloaded" }),
  );
  await step("healthy page 1: evaluate (before wedge)", () => healthyBefore.evaluate(() => 1 + 1));

  /** The wedge. This page is expected to fail in both modes; it is beyond saving. */
  const wedged = await browser.newPage();
  wedged.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await step("wedged page: goto (expected to time out in both modes)", () =>
    wedged.goto(`${base}/hang`, { waitUntil: "domcontentloaded" }),
  );

  /** Everything below is the question: is the damage contained to that page? */
  await step("healthy page 1: evaluate (after wedge)", () => healthyBefore.evaluate(() => 2 + 2));
  const healthyAfter = await step("browser.newPage() (after wedge)", () => browser.newPage());
  if (healthyAfter) {
    healthyAfter.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    await step("healthy page 2: goto (after wedge)", () =>
      healthyAfter.goto(`${base}/ok/2`, { waitUntil: "domcontentloaded" }),
    );
    await step("healthy page 2: evaluate (after wedge)", () => healthyAfter.evaluate(() => 3 + 3));
  } else {
    steps.push({ error: "skipped, newPage failed", ms: 0, name: "healthy page 2: goto (after wedge)", ok: false }, { error: "skipped, newPage failed", ms: 0, name: "healthy page 2: evaluate (after wedge)", ok: false });
  }
  await step("wedged page: close (Target.closeTarget)", () => wedged.close());

  /** browser.close() can never return under the flag, so bound it. */
  const closeStarted = Date.now();
  const closeBudget = PROTOCOL_TIMEOUT_MS + 10_000;
  const closeHung = await Promise.race([
    (async () => {
      await browser.close();
      return false;
    })(),
    // Unreffed, so the losing timer cannot hold the event loop open afterwards.
    delay(closeBudget, true, { ref: false }),
  ]);
  const closeMs = Date.now() - closeStarted;
  steps.push({
    error: closeHung ? `still running after ${closeBudget} ms, gave up waiting` : undefined,
    ms: closeMs,
    name: "browser.close()",
    ok: !closeHung,
  });

  browser.process()?.kill("SIGKILL");
  server.close();

  const sandboxErrors = [
    "prctl(PR_SET_NO_NEW_PRIVS)",
    "Failed to move to new namespace",
    "Zygote",
    "zygote",
  ].filter((needle) => stderr.includes(needle));

  const result = {
    chromeVersion: version,
    launchMs,
    mode: MODE,
    navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
    protocolTimeoutMs: PROTOCOL_TIMEOUT_MS,
    rawLaunch: { devToolsListening: rawLaunch.devToolsListening, exitCode: rawLaunch.exitCode },
    sandboxErrors,
    singleProcess: args.includes("--single-process"),
    stderrTail: stderr.slice(-2000),
    steps,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/result-${MODE}.json`, JSON.stringify(result, null, 2));

  console.log(`\n=== mode: ${MODE} (--single-process ${result.singleProcess ? "present" : "absent"}) ===`);
  console.log(`chrome: ${version}, launch: ${launchMs} ms`);
  const endpoint = rawLaunch.devToolsListening ? "reached" : "NOT reached";
  const reportedErrors = sandboxErrors.length > 0 ? sandboxErrors.join(", ") : "none";
  console.log(`direct launch: DevTools endpoint ${endpoint}, sandbox errors on stderr: ${reportedErrors}`);
  for (const s of steps) {
    const status = s.ok ? "ok  " : "FAIL";
    const reason = s.error === undefined ? "" : `  <- ${s.error}`;
    console.log(`${status}  ${String(s.ms).padStart(6)} ms  ${s.name}${reason}`);
  }
};

await main();

// The browser is killed rather than closed, so puppeteer can leave handles on the
// event loop. Exit explicitly so the container run always terminates.
// eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- See above; this file is a standalone script, not library code.
process.exit(0);
