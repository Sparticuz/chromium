import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { extract } from "tar-fs";
import { createBrotliDecompress, createUnzip } from "node:zlib";

/**
 * Decompresses a (tarballed) Brotli or Gzip compressed file and returns the path to the decompressed file/folder.
 *
 * @param filePath Path of the file to decompress.
 */
export const inflate = (filePath: string): Promise<string> => {
  // Determine the output path based on the file type
  const output = filePath.includes("swiftshader")
    ? tmpdir()
    : join(
        tmpdir(),
        basename(filePath).replace(
          /[.](?:t(?:ar(?:[.](?:br|gz))?|br|gz)|br|gz)$/i,
          ""
        )
      );

  return new Promise((resolve, reject) => {
    // Quick return if the file is already decompressed
    if (filePath.includes("swiftshader")) {
      if (existsSync(`${output}/libGLESv2.so`)) {
        return resolve(output);
      }
    } else if (existsSync(output)) {
      return resolve(output);
    }

    // Optimize chunk size based on file type - use smaller chunks for better memory usage
    // Brotli files tend to decompress to much larger sizes
    const isBrotli = /br$/i.test(filePath);
    const isGzip = /gz$/i.test(filePath);
    const isTar = /[.]t(?:ar(?:[.](?:br|gz))?|br|gz)$/i.test(filePath);

    // Use a smaller highWaterMark for better memory efficiency
    // For most serverless environments, 4MB (2**22) is more memory-efficient than 8MB
    const highWaterMark = 2 ** 22;

    const source = createReadStream(filePath, { highWaterMark });
    let target;

    // Setup error handlers first for both streams
    const handleError = (error: Error) => {
      reject(error);
    };

    source.once("error", handleError);

    // Setup the appropriate target stream based on file type
    if (isTar) {
      target = extract(output);
      target.once("finish", () => resolve(output));
    } else {
      target = createWriteStream(output, { mode: 0o700 });
      target.once("close", () => resolve(output));
    }

    target.once("error", handleError);

    // Pipe through the appropriate decompressor if needed
    if (isBrotli || isGzip) {
      // Use optimized chunk size for decompression
      // 2MB (2**21) is sufficient for most brotli/gzip files
      const decompressor = isBrotli
        ? createBrotliDecompress({ chunkSize: 2 ** 21 })
        : createUnzip({ chunkSize: 2 ** 21 });

      // Handle decompressor errors
      decompressor.once("error", handleError);

      // Chain the streams
      source.pipe(decompressor).pipe(target);
    } else {
      source.pipe(target);
    }
  });
};
