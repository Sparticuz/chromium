"use strict";
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const tar_fs_1 = require("tar-fs");
const node_zlib_1 = require("node:zlib");
class LambdaFS {
    /**
     * Decompresses a (tarballed) Brotli or Gzip compressed file and returns the path to the decompressed file/folder.
     *
     * @param filePath Path of the file to decompress.
     */
    static inflate(filePath) {
        const output = filePath.includes("swiftshader")
            ? (0, node_os_1.tmpdir)()
            : (0, node_path_1.join)((0, node_os_1.tmpdir)(), (0, node_path_1.basename)(filePath).replace(/[.](?:t(?:ar(?:[.](?:br|gz))?|br|gz)|br|gz)$/i, ""));
        return new Promise((resolve, reject) => {
            if (filePath.includes("swiftshader")) {
                if ((0, node_fs_1.existsSync)(`${output}/libGLESv2.so`)) {
                    return resolve(output);
                }
            }
            else {
                if ((0, node_fs_1.existsSync)(output) === true) {
                    return resolve(output);
                }
            }
            let source = (0, node_fs_1.createReadStream)(filePath, { highWaterMark: 2 ** 23 });
            let target = null;
            if (/[.](?:t(?:ar(?:[.](?:br|gz))?|br|gz))$/i.test(filePath) === true) {
                target = (0, tar_fs_1.extract)(output);
                target.once("finish", () => {
                    return resolve(output);
                });
            }
            else {
                target = (0, node_fs_1.createWriteStream)(output, { mode: 0o700 });
            }
            source.once("error", (error) => {
                return reject(error);
            });
            target.once("error", (error) => {
                return reject(error);
            });
            target.once("close", () => {
                return resolve(output);
            });
            if (/(?:br|gz)$/i.test(filePath) === true) {
                source
                    .pipe(/br$/i.test(filePath)
                    ? (0, node_zlib_1.createBrotliDecompress)({ chunkSize: 2 ** 21 })
                    : (0, node_zlib_1.createUnzip)({ chunkSize: 2 ** 21 }))
                    .pipe(target);
            }
            else {
                source.pipe(target);
            }
        });
    }
}
module.exports = LambdaFS;
