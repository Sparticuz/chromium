import { packTar } from "modern-tar/fs";
import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import puppeteer, { Browser } from "puppeteer-core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSymlink,
  downloadAndExtract,
  downloadFile,
  isRunningInAmazonLinux2023,
  isValidUrl,
  setupLambdaEnvironment,
} from "../source/helper.js";
import chromium from "../source/index.js";
import { inflate } from "../source/lambdafs.js";
import { getBinPath } from "../source/paths.js";

describe("Helper", () => {
  // Save original environment and restore after each test
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone environment to avoid test pollution
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore the original environment
    process.env = originalEnv;
  });

  afterAll(() => {
    // Clean up the tmpdir
    for (const file of [
      "aws",
      "chromium-pack",
      "chromium",
      "file.zip",
      "libEGL.so",
      "libGLESv2.so",
      "libvk_swiftshader.so",
      "libvulkan.so.1",
      "vk_swiftshader_icd.json",
    ]) {
      rmSync(join(tmpdir(), file), { force: true, recursive: true });
    }
  });

  describe("createSymlink", () => {
    it("should create a symlink when the source file exists", async () => {
      // Setup: create a temp file
      const temporaryDirectory = tmpdir();
      const sourceFile = join(
        temporaryDirectory,
        `source_${Date.now().toFixed(0)}.txt`,
      );
      const targetLink = join(
        temporaryDirectory,
        `target_${Date.now().toFixed(0)}.txt`,
      );
      writeFileSync(sourceFile, "test content");

      try {
        // Execute
        await createSymlink(sourceFile, targetLink);

        // Verify: targetLink exists and is a symlink
        const stat = lstatSync(targetLink);
        expect(stat.isSymbolicLink()).toBe(true);

        // Verify: the symlink points to the correct file
        const linkTarget = readlinkSync(targetLink);
        expect(linkTarget).toBe(sourceFile);

        // Verify: reading the symlink gives the original content
        const content = readFileSync(targetLink, "utf8");
        expect(content).toBe("test content");
      } finally {
        // Cleanup
        try {
          unlinkSync(sourceFile);
          unlinkSync(targetLink);
        } catch (error) {
          // Ignore errors during cleanup
          console.error("Cleanup error:", error);
        }
      }
    });

    it("should reject if the source file does not exist", async () => {
      const temporaryDirectory = tmpdir();
      const sourceFile = join(
        temporaryDirectory,
        `nonexistent_${Date.now().toFixed(0)}.txt`,
      );
      const targetLink = join(
        temporaryDirectory,
        `target_${Date.now().toFixed(0)}.txt`,
      );

      // Execute & Verify
      await expect(
        createSymlink(sourceFile, targetLink),
      ).rejects.toBeInstanceOf(Error);

      // Cleanup: ensure no symlink was created
      expect(existsSync(targetLink)).toBe(false);
    });
  });

  describe("downloadFile", () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createServer((request, response) => {
            if (request.url === "/index.html") {
              response.writeHead(200, { "Content-Type": "text/html" });
              response.end("<html><body>Hello</body></html>");
            } else {
              response.writeHead(404);
              response.end();
            }
          });
          server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr !== "string") {
              baseUrl = `http://127.0.0.1:${String(addr.port)}`;
            }
            resolve();
          });
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    );

    it("should download a file successfully", async () => {
      const url = `${baseUrl}/index.html`;
      const temporaryDirectory = tmpdir();
      const destinationPath = join(
        temporaryDirectory,
        `download_test_${Date.now().toFixed(0)}.txt`,
      );

      try {
        await downloadFile(url, destinationPath);
        expect(existsSync(destinationPath)).toBe(true);
        const content = readFileSync(destinationPath, "utf8");
        expect(content).toBeTruthy();
      } finally {
        try {
          unlinkSync(destinationPath);
        } catch (error) {
          // Ignore errors during cleanup
          console.error("Cleanup error:", error);
        }
      }
    });

    it("should reject when status code is not 200", async () => {
      // Execute & Verify
      await expect(
        // eslint-disable-next-line sonarjs/publicly-writable-directories -- This file is created in the system temp directory, which is writable
        downloadFile(`${baseUrl}/file.zip`, "/tmp/file.zip"),
      ).rejects.toStrictEqual(new Error("Unexpected status code: 404."));
    });
  });

  describe("setupLambdaEnvironment", () => {
    it("should set FONTCONFIG_PATH if not defined", () => {
      delete process.env["FONTCONFIG_PATH"];
      setupLambdaEnvironment("/lib/path");
      // eslint-disable-next-line sonarjs/publicly-writable-directories -- This test is modifying the process environment, which is acceptable in this context
      expect(process.env["FONTCONFIG_PATH"]).toBe("/tmp/fonts");
    });

    it("should not override FONTCONFIG_PATH if already defined", () => {
      process.env["FONTCONFIG_PATH"] = "/custom/fonts";
      setupLambdaEnvironment("/lib/path");
      expect(process.env["FONTCONFIG_PATH"]).toBe("/custom/fonts");
    });

    it("should set HOME if not defined", () => {
      delete process.env["HOME"];
      setupLambdaEnvironment("/lib/path");
      expect(process.env["HOME"]).toBe("/tmp");
    });

    it("should not override HOME if already defined", () => {
      process.env["HOME"] = "/custom/home";
      setupLambdaEnvironment("/lib/path");
      expect(process.env["HOME"]).toBe("/custom/home");
    });

    it("should set LD_LIBRARY_PATH if not defined", () => {
      delete process.env["LD_LIBRARY_PATH"];
      setupLambdaEnvironment("/lib/path");
      expect(process.env["LD_LIBRARY_PATH"]).toBe("/lib/path");
    });

    it("should prepend baseLibPath to LD_LIBRARY_PATH if not already included", () => {
      process.env["LD_LIBRARY_PATH"] = "/usr/lib:/usr/local/lib";
      setupLambdaEnvironment("/lib/path");
      expect(process.env["LD_LIBRARY_PATH"]).toBe(
        "/lib/path:/usr/lib:/usr/local/lib",
      );
    });

    it("should not modify LD_LIBRARY_PATH if baseLibPath is already at the start", () => {
      process.env["LD_LIBRARY_PATH"] = "/lib/path:/usr/lib";
      setupLambdaEnvironment("/lib/path");
      expect(process.env["LD_LIBRARY_PATH"]).toBe("/lib/path:/usr/lib");
    });
  });

  describe("isValidUrl", () => {
    it("should return true for valid HTTPS URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/path/to/pack.tar")).toBe(true);
    });

    it("should return true for localhost HTTP URLs (development)", () => {
      expect(isValidUrl("http://localhost:3000")).toBe(true);
      expect(isValidUrl("http://127.0.0.1:8080/pack.tar")).toBe(true);
      expect(isValidUrl("http://[::1]:3000")).toBe(true);
    });

    it("should return false for non-HTTPS URLs", () => {
      // eslint-disable-next-line unicorn/prefer-https -- testing http
      expect(isValidUrl("http://example.com")).toBe(false);
      expect(isValidUrl("ftp://ftp.example.com")).toBe(false);
      expect(isValidUrl("file:///etc/passwd")).toBe(false);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("http://")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isRunningInAmazonLinux2023", () => {
    it("should return true for AWS Lambda Node.js 20 environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs20.x";
      expect(isRunningInAmazonLinux2023(20)).toBe(true);
    });

    it("should return true for AWS Lambda Node.js 22 environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs22.x";
      expect(isRunningInAmazonLinux2023(22)).toBe(true);
    });

    it("should return true for AWS Lambda Node.js 24 environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs24.x";
      expect(isRunningInAmazonLinux2023(24)).toBe(true);
    });

    it.each([
      ["AWS_EXECUTION_ENV", "AWS_Lambda_nodejs26.x"],
      ["AWS_LAMBDA_JS_RUNTIME", "nodejs26.x"],
      [
        "CODEBUILD_BUILD_IMAGE",
        "aws/codebuild/amazonlinux2023-x86_64-standard:nodejs26",
      ],
    ])("recognizes Node.js 26 from %s", (variable, value) => {
      process.env = { [variable]: value };
      expect(isRunningInAmazonLinux2023(26)).toBe(true);
    });

    it("should return true for AWS Lambda JS Runtime Node.js 20 environment", () => {
      delete process.env["AWS_EXECUTION_ENV"];
      process.env["AWS_LAMBDA_JS_RUNTIME"] = "nodejs20.x";
      expect(isRunningInAmazonLinux2023(20)).toBe(true);
    });

    it("should return true for CodeBuild with Node.js 20", () => {
      delete process.env["AWS_EXECUTION_ENV"];
      delete process.env["AWS_LAMBDA_JS_RUNTIME"];
      process.env["CODEBUILD_BUILD_IMAGE"] =
        "aws/codebuild/amazonlinux2-x86_64-standard:4.0-nodejs20";
      expect(isRunningInAmazonLinux2023(20)).toBe(true);
    });

    it("should return true for Vercel with Node.js 20", () => {
      delete process.env["AWS_EXECUTION_ENV"];
      delete process.env["AWS_LAMBDA_JS_RUNTIME"];
      delete process.env["CODEBUILD_BUILD_IMAGE"];
      process.env["VERCEL"] = "1";
      expect(isRunningInAmazonLinux2023(20)).toBe(true);
    });

    it("should return false for Node.js 18 AWS Lambda environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs18.x";
      expect(isRunningInAmazonLinux2023(18)).toBe(false);
    });

    it("should return false for non-Lambda environments", () => {
      delete process.env["AWS_EXECUTION_ENV"];
      delete process.env["AWS_LAMBDA_JS_RUNTIME"];
      delete process.env["CODEBUILD_BUILD_IMAGE"];
      delete process.env["VERCEL"];
      expect(isRunningInAmazonLinux2023(20)).toBe(false);
    });
  });

  describe("downloadAndExtract and lambdafs", () => {
    const extractDirectory = join(tmpdir(), "chromium-pack");
    let tarServer: Server;
    let tarServerUrl: string;
    const malformedTars = new Map<string, Buffer>();

    const expectedFiles = ["aws.tar.br", "chromium.br", "swiftshader.tar.br"];

    // Create a local HTTP server that serves a tar archive of test fixtures
    beforeAll(async () => {
      // Create test fixture files that are real brotli-compressed content
      // so the inflate tests can decompress them
      const { mkdirSync } = await import("node:fs");
      const fixtureDirectory = join(tmpdir(), "tar-test-fixtures");
      mkdirSync(fixtureDirectory, { recursive: true });

      // chromium.br — brotli-compressed fake binary
      const chromiumContent = Buffer.alloc(1024, 0x42); // 1KB of 'B'
      writeFileSync(
        join(fixtureDirectory, "chromium.br"),
        brotliCompressSync(chromiumContent),
      );

      // aws.tar.br — brotli-compressed tar containing fonts.conf
      const awsDirectory = join(tmpdir(), "tar-test-aws");
      mkdirSync(awsDirectory, { recursive: true });
      writeFileSync(
        join(awsDirectory, "fonts.conf"),
        "<fontconfig></fontconfig>",
      );
      const awsTar = execSync(`tar cf - -C "${awsDirectory}" fonts.conf`);
      writeFileSync(
        join(fixtureDirectory, "aws.tar.br"),
        brotliCompressSync(awsTar),
      );

      malformedTars.set("/junk.tar", Buffer.from("not a tar"));
      // Keep the header but truncate the file body.
      malformedTars.set("/truncated.tar", awsTar.subarray(0, 514));
      const corruptTar = Buffer.from(awsTar);
      corruptTar[0] = 0x58; // Change the filename without updating its checksum.
      malformedTars.set("/checksum.tar", corruptTar);

      // swiftshader.tar.br — brotli-compressed tar containing shader libs
      const swiftshaderDirectory = join(tmpdir(), "tar-test-swiftshader");
      mkdirSync(swiftshaderDirectory, { recursive: true });
      const swLibs = [
        "libEGL.so",
        "libGLESv2.so",
        "libvk_swiftshader.so",
        "libvulkan.so.1",
        "vk_swiftshader_icd.json",
      ];
      for (const lib of swLibs) {
        writeFileSync(join(swiftshaderDirectory, lib), `fake ${lib}`);
      }
      const swTar = execSync(
        `tar cf - -C "${swiftshaderDirectory}" ${swLibs.join(" ")}`,
      );
      writeFileSync(
        join(fixtureDirectory, "swiftshader.tar.br"),
        brotliCompressSync(swTar),
      );

      // Start server
      await new Promise<void>((resolve) => {
        tarServer = createServer((request, response) => {
          const malformed = malformedTars.get(request.url ?? "");
          if (malformed) {
            response.writeHead(200, { "Content-Type": "application/x-tar" });
            response.end(malformed);
          } else if (request.url === "/pack.tar") {
            response.writeHead(200, { "Content-Type": "application/x-tar" });
            packTar(fixtureDirectory).pipe(response);
          } else {
            response.writeHead(404);
            response.end();
          }
        });
        tarServer.listen(0, "127.0.0.1", () => {
          const addr = tarServer.address();
          if (addr && typeof addr !== "string") {
            tarServerUrl = `http://127.0.0.1:${String(addr.port)}`;
          }
          resolve();
        });
      });
    });

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          tarServer.close(() => {
            resolve();
          });
          for (const directory of [
            "tar-test-fixtures",
            "tar-test-aws",
            "tar-test-swiftshader",
          ]) {
            rmSync(join(tmpdir(), directory), { force: true, recursive: true });
          }
        }),
    );

    it.each(["junk", "truncated", "checksum"])(
      "should reject %s tar archives from HTTP and Brotli files",
      async (kind) => {
        await expect(
          downloadAndExtract(`${tarServerUrl}/${kind}.tar`),
        ).rejects.toThrow();
        expect(existsSync(extractDirectory)).toBe(false);

        const archive = malformedTars.get(`/${kind}.tar`);
        if (!archive) throw new Error(`Missing ${kind} fixture`);
        const name = `invalid-${randomUUID()}`;
        const input = join(tmpdir(), `${name}.tar.br`);
        const output = join(tmpdir(), name);
        writeFileSync(input, brotliCompressSync(archive));
        try {
          await expect(inflate(input)).rejects.toThrow();
        } finally {
          rmSync(input, { force: true });
          rmSync(output, { force: true, recursive: true });
        }
      },
    );

    it("should download and extract files successfully", async () => {
      await downloadAndExtract(`${tarServerUrl}/pack.tar`);

      // Check that expected files exist
      for (const file of expectedFiles) {
        const filePath = join(extractDirectory, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it("should extract a .tar file using lambdafs inflate and verify contents", async () => {
      for (const file of expectedFiles) {
        const filePath = join(extractDirectory, file);

        await inflate(filePath);

        // Check that the file was extracted successfully
        if (filePath.includes("swiftshader")) {
          // eslint-disable-next-line vitest/no-conditional-expect -- We need to check for multiple files in the swiftshader tar, so we have to conditionally check for each file based on the filePath
          expect(existsSync(join(tmpdir(), "libGLESv2.so"))).toBe(true);
        } else if (filePath.includes("aws")) {
          // eslint-disable-next-line vitest/no-conditional-expect -- We need to check for multiple files in the aws tar, so we have to conditionally check for each file based on the filePath
          expect(existsSync(join(tmpdir(), "aws", "fonts.conf"))).toBe(true);
        } else if (filePath.includes("chromium")) {
          // eslint-disable-next-line vitest/no-conditional-expect -- We need to check for the chromium binary, so we have to conditionally check for it based on the filePath
          expect(existsSync(join(tmpdir(), "chromium"))).toBe(true);
        }
      }
    });
  });
});

describe("Paths", () => {
  it("should return the correct bin path for modules", () => {
    // This test isn't doing any testing
    const binPath = getBinPath();
    console.log("Bin Path", binPath);
    expect(getBinPath()).toBe(binPath);
  });
});

describe("Integration", () => {
  let browser: Browser;

  /**
   * Setup FONTCONFIG_PATH for non-lambda environments
   * This is needed for the fontconfig library to find the fonts
   */
  beforeAll(() => {
    process.env["FONTCONFIG_PATH"] = join(tmpdir(), "fonts");
  });

  it("should open a Chromium window", async ({ onTestFinished }) => {
    const binaryDirectory = mkdtempSync(join(tmpdir(), "chromium-test-"));
    onTestFinished(() => {
      rmSync(binaryDirectory, { force: true, recursive: true });
    });
    const bin = getBinPath();
    symlinkSync(
      join(bin, "fonts.tar.br"),
      join(binaryDirectory, "fonts.tar.br"),
    );
    for (const file of ["al2023.tar.br", "chromium.br", "swiftshader.tar.br"]) {
      symlinkSync(join(bin, process.arch, file), join(binaryDirectory, file));
    }

    const args = await puppeteer.defaultArgs({
      args: chromium.args,
      headless: "shell",
    });
    // Force the setup of Lambda environment
    setupLambdaEnvironment(join(tmpdir(), "al2023", "lib"));
    await inflate(join(binaryDirectory, "al2023.tar.br"));
    // Console log the contents of /tmp

    browser = await puppeteer.launch({
      args: args,
      defaultViewport: {
        deviceScaleFactor: 1,
        hasTouch: false,
        height: 1080,
        isLandscape: true,
        isMobile: false,
        width: 1920,
      },
      executablePath: await chromium.executablePath(binaryDirectory),
      headless: "shell",
    });
    try {
      const temporaryContents = execSync("/usr/bin/ls -la /tmp").toString();
      console.log("Contents of /tmp directory:");
      console.log(temporaryContents);
    } catch (error) {
      console.error("Error listing /tmp directory:", error);
    }
    console.log("Browser", browser.connected, process.env["LD_LIBRARY_PATH"]);
    const version = await browser.version();
    expect(browser.connected).toBe(true);
    expect(version).toContain("HeadlessChrome");
  });

  it("should open a new page", async () => {
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const title = await page.title();
    expect(title).toBe("Example Domain");
  });

  it("should take a screenshot", async () => {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle0" });
    const screenshot = Buffer.from(await page.screenshot());
    const base64Screenshot = `data:image/png;base64,${screenshot.toString(
      "base64",
    )}`;
    const hash = createHash("sha256").update(base64Screenshot).digest("hex");
    expect(hash).toBe(
      "246e191eb53d8b4a828fc82bdad178e4dbca623c115119ad27c698e332d54f6e",
    );
  });

  it("should take a screenshot of get.webgl.org without the logo", async () => {
    const page = await browser.newPage();
    await page.goto("https://get.webgl.org", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const element = globalThis.document.querySelector("#logo-container");
      if (element) element.remove();
    });
    const screenshot = Buffer.from(await page.screenshot());
    const base64Screenshot = `data:image/png;base64,${screenshot.toString(
      "base64",
    )}`;
    const hash = createHash("sha256").update(base64Screenshot).digest("hex");
    expect(hash).toBe(
      "f34c8190ce46b2b3721483408cef01f9e746e30b84a67b46ed691dcf56176782",
    );
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- We need to check if browser is defined before trying to close it, because if the test fails before the browser is assigned, we don't want to throw an error in the afterAll hook
    if (browser) {
      console.log("Closing browser");
      await browser.close();
    }

    // Clean up the tmpdir
    for (const file of [
      "al2023",
      "chromium",
      "fonts",
      "libEGL.so",
      "libGLESv2.so",
      "libvk_swiftshader.so",
      "libvulkan.so.1",
      "vk_swiftshader_icd.json",
    ]) {
      rmSync(join(tmpdir(), file), { force: true, recursive: true });
    }
  });
});
