declare class LambdaFS {
    /**
     * Decompresses a (tarballed) Brotli or Gzip compressed file and returns the path to the decompressed file/folder.
     *
     * @param filePath Path of the file to decompress.
     */
    static inflate(filePath: string): Promise<string>;
}
export = LambdaFS;
