import { unlink } from "node:fs";
import { https } from "follow-redirects";
import { tmpdir } from "node:os";
import { extract } from "tar-fs";

interface FollowRedirOptions extends URL {
  maxBodyLength: number;
}

/**
 * Adds the proper folders to the environment
 * @param baseLibPath the path to this packages lib folder
 */
export const setupLambdaEnvironment = (baseLibPath: string) => {
  // If the FONTCONFIG_PATH is not set, set it to /tmp/fonts
  process.env["FONTCONFIG_PATH"] ??= "/tmp/fonts";

  // If LD_LIBRARY_PATH is undefined, set it to baseLibPath, otherwise, add it
  if (process.env["LD_LIBRARY_PATH"] === undefined) {
    process.env["LD_LIBRARY_PATH"] = baseLibPath;
  } else if (process.env["LD_LIBRARY_PATH"].startsWith(baseLibPath) !== true) {
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
    return !!new URL(input);
  } catch {
    return false;
  }
};

/**
 * Determines if the running instance is inside an AWS Lambda container,
 * and the nodejs version is less than v20. This is to target AL2 instances
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * @returns boolean indicating if the running instance is inside a Lambda container
 */
export const isRunningInAwsLambda = () => {
  if (
    process.env["AWS_EXECUTION_ENV"] &&
    process.env["AWS_EXECUTION_ENV"].includes("AWS_Lambda_nodejs") &&
    !process.env["AWS_EXECUTION_ENV"].includes("20.x") &&
    !process.env["AWS_EXECUTION_ENV"].includes("22.x")
  ) {
    return true;
  } else if (
    process.env["AWS_LAMBDA_JS_RUNTIME"] &&
    process.env["AWS_LAMBDA_JS_RUNTIME"].includes("nodejs") &&
    !process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x") &&
    !process.env["AWS_LAMBDA_JS_RUNTIME"].includes("22.x")
  ) {
    return true;
  }
  return false;
};

/**
 * Determines if the running instance is inside an AWS Lambda container,
 * and the nodejs version is 20. This is to target AL2023 instances
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * CODEBUILD_BUILD_IMAGE is for CodeBuild instances
 * @returns boolean indicating if the running instance is inside a Lambda container with nodejs20
 */
export const isRunningInAwsLambdaNode20 = () => {
  if (
    (process.env["AWS_EXECUTION_ENV"] &&
      process.env["AWS_EXECUTION_ENV"].includes("20.x")) ||
    (process.env["AWS_EXECUTION_ENV"] &&
      process.env["AWS_EXECUTION_ENV"].includes("22.x")) ||
    (process.env["AWS_LAMBDA_JS_RUNTIME"] &&
      process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x")) ||
    (process.env["AWS_LAMBDA_JS_RUNTIME"] &&
      process.env["AWS_LAMBDA_JS_RUNTIME"].includes("22.x")) ||
    (process.env["CODEBUILD_BUILD_IMAGE"] &&
      process.env["CODEBUILD_BUILD_IMAGE"].includes("nodejs20")) ||
    (process.env["CODEBUILD_BUILD_IMAGE"] &&
      process.env["CODEBUILD_BUILD_IMAGE"].includes("nodejs22"))
  ) {
    return true;
  }
  return false;
};

export const downloadAndExtract = async (url: string) =>
  new Promise<string>((resolve, reject) => {
    const getOptions = new URL(url) as FollowRedirOptions;
    getOptions.maxBodyLength = 60 * 1024 * 1024; // 60mb
    const destDir = `${tmpdir()}/chromium-pack`;
    const extractObj = extract(destDir);
    https
      .get(url, (response) => {
        response.pipe(extractObj);
        extractObj.on("finish", () => {
          resolve(destDir);
        });
      })
      .on("error", (err) => {
        unlink(destDir, (_) => {
          reject(err);
        });
      });
  });
