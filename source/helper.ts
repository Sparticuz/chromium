import { unlink } from "node:fs";
import { https } from "follow-redirects";
import { tmpdir } from "node:os";
import { extract } from "tar-fs";
import { parse } from "node:url";
import type { UrlWithStringQuery } from "node:url";

interface FollowRedirOptions extends UrlWithStringQuery {
  maxBodyLength: number;
}

export const isValidUrl = (input: string) => {
  try {
    return !!new URL(input);
  } catch (err) {
    return false;
  }
};

/**
 * Determines if the running instance is inside an AWS Lambda container.
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * @returns boolean indicating if the running instance is inside a Lambda container
 */
export const isRunningInAwsLambda = () => {
  if (
    process.env["AWS_EXECUTION_ENV"] &&
    process.env["AWS_EXECUTION_ENV"].includes("AWS_Lambda_nodejs") &&
    !process.env["AWS_EXECUTION_ENV"].includes("20.x")
  ) {
    return true;
  } else if (
    process.env["AWS_LAMBDA_JS_RUNTIME"] &&
    process.env["AWS_LAMBDA_JS_RUNTIME"].includes("nodejs") &&
    !process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x")
  ) {
    return true;
  }
  return false;
};

export const isRunningInAwsLambdaNode20 = () => {
  if (
    process.env["AWS_EXECUTION_ENV"] &&
    process.env["AWS_EXECUTION_ENV"].includes("20.x")
  ) {
    return true;
  } else if (
    process.env["AWS_LAMBDA_JS_RUNTIME"] &&
    process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x")
  ) {
    return true;
  }
  return false;
};

export const downloadAndExtract = async (url: string) =>
  new Promise<string>((resolve, reject) => {
    const getOptions = parse(url) as FollowRedirOptions;
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
