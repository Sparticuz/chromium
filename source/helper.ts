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
}

export const downloadAndExtract = async (url: string) =>
    new Promise<string>((resolve, reject) => {
        const getOptions = parse(url) as FollowRedirOptions;
        getOptions.maxBodyLength = 60 * 1024 * 1024; // 60mb
        const destDir = `${tmpdir()}/chromium-pack`
        const extractObj = extract(destDir)
        https.get(url, (response) => {
            response.pipe(extractObj);
            extractObj.on('finish', () => {
                resolve(destDir);
            });
        }).on('error', (err) => {
            unlink(destDir, (_) => {
                reject(err)
            });
        });
    })
