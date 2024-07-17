import { https } from "follow-redirects";
import { unlink } from "node:fs";
import { tmpdir } from "node:os";
import { extract } from "tar-fs";

interface FollowRedirOptions extends URL {
  maxBodyLength: number;
}

export const isValidUrl = (input: string) => {
  try {
    return !!new URL(input);
  } catch {
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
    const getOptions = new URL(url) as FollowRedirOptions;
    getOptions.maxBodyLength = 60 * 1024 * 1024; // 60mb
    const destinationDirectory = `${tmpdir()}/chromium-pack`;
    const extractObject = extract(destinationDirectory);
    https
      .get(url, (response) => {
        response.pipe(extractObject);
        extractObject.on("finish", () => {
          resolve(destinationDirectory);
        });
      })
      .on("error", (error) => {
        unlink(destinationDirectory, () => {
          reject(error);
        });
      });
  });
