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

const envIncludes = (key: string, values: Array<string>): boolean => {
  if (process.env[key] == null) return false;

  for (const value of values) {
    if (!process.env[key].includes(value)) return false;
  }

  return true;
};

/**
 * Determines if the running instance is inside an AWS Lambda container,
 * and the nodejs version.
 *
 * Less than 20 targets AL2 instances
 * Above and including 20 AL2023 instances
 *
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * CODEBUILD_BUILD_IMAGE is for CodeBuild instances
 */
export const getEnvironment = (): {
  awsLambda: boolean;
  instanceType: "al2" | "al2023";
  nodeVersion: 20 | 22 | 0;
} => {
  const awsLambda = (() => {
    if (envIncludes("AWS_EXECUTION_ENV", ["AWS_Lambda_nodejs"])) return true;
    if (envIncludes("AWS_LAMBDA_JS_RUNTIME", ["nodejs"])) return true;
    if (envIncludes("CODEBUILD_BUILD_IMAGE", ["nodejs"])) return true;

    return false;
  })();

  const nodeVersion = (() => {
    if (envIncludes("AWS_EXECUTION_ENV", ["20.x"])) return 20;
    if (envIncludes("AWS_LAMBDA_JS_RUNTIME", ["20.x"])) return 20;
    if (envIncludes("CODEBUILD_BUILD_IMAGE", ["nodejs20"])) return 20;

    if (envIncludes("AWS_EXECUTION_ENV", ["22.x"])) return 22;
    if (envIncludes("AWS_LAMBDA_JS_RUNTIME", ["22.x"])) return 22;
    if (envIncludes("CODEBUILD_BUILD_IMAGE", ["nodejs22"])) return 22;

    /** Assumes that its ok that all versions lower than 20 are seen as one */
    return 0;
  })();

  const instanceType = (() => {
    if (nodeVersion < 20) return "al2";

    return `al2023`;
  })();

  return { awsLambda, nodeVersion, instanceType };
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
