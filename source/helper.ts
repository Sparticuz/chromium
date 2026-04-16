import { createWriteStream, rm } from "node:fs";
import { access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar-fs";

/**
 * Creates a symlink to a file
 */
export const createSymlink = async (
  source: string,
  target: string,
): Promise<void> => {
  await access(source);
  await symlink(source, target);
};

/**
 * Downloads a file from a URL
 */
export const downloadFile = async (
  url: string,
  outputPath: string,
): Promise<void> => {
  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Unexpected status code: ${String(response.status)}.`);
  }

  if (!response.body) {
    throw new Error("Response body is empty.");
  }

  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(outputPath),
  );
};

/**
 * Adds the proper folders to the environment
 * @param baseLibPath the path to this packages lib folder
 */
export const setupLambdaEnvironment = (baseLibPath: string) => {
  // If the FONTCONFIG_PATH is not set, set it to /tmp/fonts
  process.env["FONTCONFIG_PATH"] ??= join(tmpdir(), "fonts");
  // Set up Home folder if not already set
  process.env["HOME"] ??= tmpdir();

  // If LD_LIBRARY_PATH is undefined, set it to baseLibPath, otherwise, add it
  if (process.env["LD_LIBRARY_PATH"] === undefined) {
    process.env["LD_LIBRARY_PATH"] = baseLibPath;
  } else if (!process.env["LD_LIBRARY_PATH"].startsWith(baseLibPath)) {
    process.env["LD_LIBRARY_PATH"] = [
      baseLibPath,
      ...new Set(process.env["LD_LIBRARY_PATH"].split(":")),
    ].join(":");
  }
};

/**
 * Determines if the input is a valid URL
 * @param input the input to check
 * @returns boolean indicating if the input is a valid URL
 */
export const isValidUrl = (input: string) => {
  try {
    const url = new URL(input);
    if (url.protocol === "https:") return true;
    // Allow http:// only for localhost/127.0.0.1 (development/testing)
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Determines if the running instance is inside an Amazon Linux 2023 container,
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * CODEBUILD_BUILD_IMAGE is for CodeBuild instances
 * VERCEL is for Vercel Functions (Node 20 or later enables an AL2023-compatible environment).
 * @returns boolean indicating if the running instance is inside a Lambda container with nodejs20
 */
export const isRunningInAmazonLinux2023 = (nodeMajorVersion: number) => {
  const awsExecEnv = process.env["AWS_EXECUTION_ENV"] ?? "";
  const awsLambdaJsRuntime = process.env["AWS_LAMBDA_JS_RUNTIME"] ?? "";
  const codebuildImage = process.env["CODEBUILD_BUILD_IMAGE"] ?? "";

  // Check for explicit version substrings, returns on first match
  if (
    awsExecEnv.includes("20.x") ||
    awsExecEnv.includes("22.x") ||
    awsExecEnv.includes("24.x") ||
    awsLambdaJsRuntime.includes("20.x") ||
    awsLambdaJsRuntime.includes("22.x") ||
    awsLambdaJsRuntime.includes("24.x") ||
    codebuildImage.includes("nodejs20") ||
    codebuildImage.includes("nodejs22") ||
    codebuildImage.includes("nodejs24")
  ) {
    return true;
  }

  // Vercel: Node 20+ is AL2023 compatible
  if (process.env["VERCEL"] && nodeMajorVersion >= 20) {
    return true;
  }

  return false;
};

export const downloadAndExtract = async (url: string): Promise<string> => {
  const destDir = join(tmpdir(), "chromium-pack");

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Unexpected status code: ${String(response.status)}.`);
  }

  if (!response.body) {
    throw new Error("Response body is empty.");
  }

  try {
    await pipeline(
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ),
      extract(destDir),
    );
  } catch (error) {
    // Clean up partial extraction on failure
    await new Promise<void>((resolve) => {
      rm(destDir, { force: true, recursive: true }, () => {
        resolve();
      });
    });
    throw error;
  }

  return destDir;
};
