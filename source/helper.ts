import fr from "follow-redirects";
import { access, createWriteStream, rm, symlink } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "tar-fs";

interface FollowRedirOptions extends URL {
  maxBodyLength: number;
}

/**
 * Creates a symlink to a file
 */
export const createSymlink = (
  source: string,
  target: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    access(source, (error) => {
      if (error) {
        reject(error);
        return;
      }
      symlink(source, target, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
};

/**
 * Downloads a file from a URL
 */
export const downloadFile = (
  url: string,
  outputPath: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath);
    stream.once("error", reject);

    fr.https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          stream.close();
          reject(
            new Error(
              `Unexpected status code: ${
                response.statusCode?.toFixed(0) ?? "UNK"
              }.`
            )
          );
          return;
        }

        // Pipe directly to file rather than manually writing chunks
        // This is more efficient and uses less memory
        response.pipe(stream);

        // Listen for completion
        stream.once("finish", () => {
          stream.close();
          resolve();
        });

        // Handle response errors
        response.once("error", (error) => {
          stream.close();
          reject(error);
        });
      })
      .on("error", (error) => {
        stream.close();
        reject(error);
      });
  });
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
    return Boolean(new URL(input));
  } catch {
    return false;
  }
};

/**
 * Determines if the running instance is inside an AWS Lambda container,
 * and the nodejs version is less than v20. This is to target AL2 instances
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * VERCEL for Vercel Functions (Node 18 enables an AL2-compatible environment)
 * @returns boolean indicating if the running instance is inside a Lambda container
 */
export const isRunningInAwsLambda = (nodeMajorVersion: number) => {
  // Check AWS Lambda environment variables
  const isAwsExecutionEnv = Boolean(
    process.env["AWS_EXECUTION_ENV"] &&
      process.env["AWS_EXECUTION_ENV"].includes("AWS_Lambda_nodejs") &&
      !process.env["AWS_EXECUTION_ENV"].includes("20.x") &&
      !process.env["AWS_EXECUTION_ENV"].includes("22.x")
  );

  const isAwsLambdaJsRuntime = Boolean(
    process.env["AWS_LAMBDA_JS_RUNTIME"] &&
      process.env["AWS_LAMBDA_JS_RUNTIME"].includes("nodejs") &&
      !process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x") &&
      !process.env["AWS_LAMBDA_JS_RUNTIME"].includes("22.x")
  );

  const isVercelNode18 = Boolean(
    process.env["VERCEL"] && nodeMajorVersion === 18
  );

  return isAwsExecutionEnv || isAwsLambdaJsRuntime || isVercelNode18;
};

/**
 * Determines if the running instance is inside an AWS Lambda container,
 * and the nodejs version is 20. This is to target AL2023 instances
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * CODEBUILD_BUILD_IMAGE is for CodeBuild instances
 * VERCEL is for Vercel Functions (Node 20 or later enables an AL2023-compatible environment).
 * @returns boolean indicating if the running instance is inside a Lambda container with nodejs20
 */
export const isRunningInAwsLambdaNode20 = (nodeMajorVersion: number) => {
  // Consolidated check for node20/node22 environments using bitwise OR for performance
  return Boolean(
    (process.env["AWS_EXECUTION_ENV"] &&
      (process.env["AWS_EXECUTION_ENV"].includes("20.x") ||
        process.env["AWS_EXECUTION_ENV"].includes("22.x"))) ??
      (process.env["AWS_LAMBDA_JS_RUNTIME"] &&
        (process.env["AWS_LAMBDA_JS_RUNTIME"].includes("20.x") ||
          process.env["AWS_LAMBDA_JS_RUNTIME"].includes("22.x"))) ??
      (process.env["CODEBUILD_BUILD_IMAGE"] &&
        (process.env["CODEBUILD_BUILD_IMAGE"].includes("nodejs20") ||
          process.env["CODEBUILD_BUILD_IMAGE"].includes("nodejs22"))) ??
      (process.env["VERCEL"] && nodeMajorVersion >= 20)
  );
};

export const downloadAndExtract = async (url: string) => {
  const getOptions = new URL(url) as FollowRedirOptions;
  // Increase the max body length to 60MB for larger files
  getOptions.maxBodyLength = 60 * 1024 * 1024;
  const destDir = join(tmpdir(), "chromium-pack");

  return new Promise<string>((resolve, reject) => {
    const extractObj = extract(destDir);

    // Setup error handlers for better cleanup
    const cleanupOnError = (err: Error) => {
      rm(destDir, { force: true, recursive: true }, () => {
        reject(err);
      });
    };

    // Attach error handler to extract stream
    extractObj.once("error", cleanupOnError);

    // Handle extraction completion
    extractObj.once("finish", () => {
      resolve(destDir);
    });

    const req = fr.https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Unexpected status code: ${
              response.statusCode?.toFixed(0) ?? "UNK"
            }.`
          )
        );
        return;
      }

      // Pipe the response directly to the extraction stream
      response.pipe(extractObj);

      // Handle response errors
      response.once("error", cleanupOnError);
    });

    // Handle request errors
    req.once("error", cleanupOnError);

    // Set a timeout to avoid hanging requests
    req.setTimeout(60 * 1000, () => {
      req.destroy();
      cleanupOnError(new Error("Request timeout"));
    });
  });
};
