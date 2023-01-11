import { unlink } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { extract } from 'tar-fs';

export const isValidUrl = (input: string) => {
    try {
        return !!new URL(input);
    } catch (err) {
        return false;
    }
}

export const downloadAndExtract = async (url: string) =>
    new Promise<string>((resolve, reject) => {
        const destDir = `${tmpdir()}/chromium-pack`
        const extractObj = extract(destDir)
        get(url, (response) => {
            response.pipe(extractObj);
            extractObj.on('finish', () => {
                extractObj.end(() => {
                    resolve(destDir);
                });
            });
        }).on('error', (err) => {
            unlink(destDir, (_) => {
                reject(err)
            });
        });
    })
