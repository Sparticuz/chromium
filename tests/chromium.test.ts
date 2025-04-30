import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSymlink,
  downloadAndExtract,
  downloadFile,
  isRunningInAmazonLinux2023,
  isValidUrl,
  setupLambdaEnvironment,
} from "../source/helper.js";
import { inflate } from "../source/lambdafs.js";

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

  describe("createSymlink", () => {
    it("should create a symlink when the source file exists", async () => {
      // Setup: create a temp file
      const tempDir = tmpdir();
      const sourceFile = join(tempDir, `source_${Date.now().toFixed(0)}.txt`);
      const targetLink = join(tempDir, `target_${Date.now().toFixed(0)}.txt`);
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
      const tempDir = tmpdir();
      const sourceFile = join(
        tempDir,
        `nonexistent_${Date.now().toFixed(0)}.txt`
      );
      const targetLink = join(tempDir, `target_${Date.now().toFixed(0)}.txt`);

      // Execute & Verify
      await expect(
        createSymlink(sourceFile, targetLink)
      ).rejects.toBeInstanceOf(Error);

      // Cleanup: ensure no symlink was created
      expect(existsSync(targetLink)).toBe(false);
    });
  });

  describe("downloadFile", () => {
    it("should download a file successfully", async () => {
      const url = "https://www.example.com/index.html";
      const tempDir = tmpdir();
      const destPath = join(
        tempDir,
        `download_test_${Date.now().toFixed(0)}.txt`
      );

      try {
        await downloadFile(url, destPath);
        expect(existsSync(destPath)).toBe(true);
        const content = readFileSync(destPath, "utf8");
        expect(content).toBeTruthy();
      } finally {
        try {
          unlinkSync(destPath);
        } catch (error) {
          // Ignore errors during cleanup
          console.error("Cleanup error:", error);
        }
      }
    });

    it("should reject when status code is not 200", async () => {
      // Execute & Verify
      await expect(
        // eslint-disable-next-line sonarjs/publicly-writable-directories
        downloadFile("https://example.com/file.zip", "/tmp/file.zip")
      ).rejects.toStrictEqual(new Error("Unexpected status code: 404."));
    });
  });

  describe("setupLambdaEnvironment", () => {
    it("should set FONTCONFIG_PATH if not defined", () => {
      delete process.env["FONTCONFIG_PATH"];
      setupLambdaEnvironment("/lib/path");
      // eslint-disable-next-line sonarjs/publicly-writable-directories
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
        "/lib/path:/usr/lib:/usr/local/lib"
      );
    });

    it("should not modify LD_LIBRARY_PATH if baseLibPath is already at the start", () => {
      process.env["LD_LIBRARY_PATH"] = "/lib/path:/usr/lib";
      setupLambdaEnvironment("/lib/path");
      expect(process.env["LD_LIBRARY_PATH"]).toBe("/lib/path:/usr/lib");
    });
  });

  describe("isValidUrl", () => {
    it("should return true for valid URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://localhost:3000")).toBe(true);
      expect(isValidUrl("ftp://ftp.example.com")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("http://")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isRunningInAwsLambdaNode20", () => {
    it("should return true for AWS Lambda Node.js 20 environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs20.x";
      expect(isRunningInAmazonLinux2023(20)).toBe(true);
    });

    it("should return true for AWS Lambda Node.js 22 environment", () => {
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs22.x";
      expect(isRunningInAmazonLinux2023(22)).toBe(true);
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
    const extractDir = join(tmpdir(), "chromium-pack"); // downloadAndExtract extracts to /tmp

    // Clean up known files before test (optional, for idempotency)
    const expectedFiles = ["aws.tar.br", "chromium.br", "swiftshader.tar.br"];

    const extractedFiles = [
      "aws",
      "chromium-pack",
      "chromium",
      "lebEGL.so",
      "libGLESv2.so",
      "libvk_swiftshader.so",
      "libvulkan.so.1",
      "vk_swiftshader_icd.json",
    ];

    for (const file of extractedFiles) {
      const filePath = join(extractDir, file);
      if (existsSync(filePath)) {
        try {
          rmSync(filePath, { force: true, recursive: true });
        } catch (error) {
          // Ignore errors during cleanup
          console.error("Cleanup error:", error);
        }
      }
    }

    it(
      "should download and extract files successfully",
      { timeout: 60 * 1000 },
      async () => {
        const url =
          "https://github.com/Sparticuz/chromium/releases/download/v109.0.6/chromium-v109.0.6-pack.tar";

        await downloadAndExtract(url);

        // Check that expected files exist
        for (const file of expectedFiles) {
          const filePath = join(extractDir, file);
          expect(existsSync(filePath)).toBe(true);
        }
      }
    );

    it("should extract a .tar file using lambdafs inflate and verify contents", async () => {
      for (const file of expectedFiles) {
        const filePath = join(extractDir, file);

        await inflate(filePath);

        // Check that the file was extracted successfully
        if (filePath.includes("swiftshader")) {
          expect(existsSync(join(tmpdir(), "libGLESv2.so"))).toBe(true);
        } else if (filePath.includes("aws")) {
          expect(existsSync(join(tmpdir(), "aws", "fonts.conf"))).toBe(true);
        } else if (filePath.includes("chromium")) {
          expect(existsSync(join(tmpdir(), "chromium"))).toBe(true);
        }
      }
    });
  });
});
