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
    if (filePath.includes("swiftshader")) {
      if (existsSync(`${output}/libGLESv2.so`)) {
        return resolve(output);
      }
    } else {
      if (existsSync(output) === true) {
        return resolve(output);
      }
    }

    let source = createReadStream(filePath, { highWaterMark: 2 ** 23 });
    let target = null;

    if (/[.](?:t(?:ar(?:[.](?:br|gz))?|br|gz))$/i.test(filePath) === true) {
      target = extract(output);

      target.once("finish", () => {
        return resolve(output);
      });
    } else {
      target = createWriteStream(output, { mode: 0o700 });
    }

    source.once("error", (error: Error) => {
      return reject(error);
    });

    target.once("error", (error: Error) => {
      return reject(error);
    });

    target.once("close", () => {
      return resolve(output);
    });

    if (/(?:br|gz)$/i.test(filePath) === true) {
      source
        .pipe(
          /br$/i.test(filePath)
            ? createBrotliDecompress({ chunkSize: 2 ** 21 })
            : createUnzip({ chunkSize: 2 ** 21 })
        )
        .pipe(target);
    } else {
      source.pipe(target);
    }
  });
};
