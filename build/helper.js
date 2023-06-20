"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadAndExtract = exports.isRunningInAwsLambda = exports.isValidUrl = void 0;
const node_fs_1 = require("node:fs");
const follow_redirects_1 = require("follow-redirects");
const node_os_1 = require("node:os");
const tar_fs_1 = require("tar-fs");
const node_url_1 = require("node:url");
const isValidUrl = (input) => {
    try {
        return !!new URL(input);
    }
    catch (err) {
        return false;
    }
};
exports.isValidUrl = isValidUrl;
/**
 * Determines if the running instance is inside an AWS Lambda container.
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * @returns boolean indicating if the running instance is inside a Lambda container
 */
const isRunningInAwsLambda = () => {
    if (process.env["AWS_EXECUTION_ENV"] &&
        /^AWS_Lambda_nodejs/.test(process.env["AWS_EXECUTION_ENV"]) === true) {
        return true;
    }
    else if (process.env["AWS_LAMBDA_JS_RUNTIME"] &&
        /^nodejs/.test(process.env["AWS_LAMBDA_JS_RUNTIME"]) === true) {
        return true;
    }
    return false;
};
exports.isRunningInAwsLambda = isRunningInAwsLambda;
const downloadAndExtract = async (url) => new Promise((resolve, reject) => {
    const getOptions = (0, node_url_1.parse)(url);
    getOptions.maxBodyLength = 60 * 1024 * 1024; // 60mb
    const destDir = `${(0, node_os_1.tmpdir)()}/chromium-pack`;
    const extractObj = (0, tar_fs_1.extract)(destDir);
    follow_redirects_1.https
        .get(url, (response) => {
        response.pipe(extractObj);
        extractObj.on("finish", () => {
            resolve(destDir);
        });
    })
        .on("error", (err) => {
        (0, node_fs_1.unlink)(destDir, (_) => {
            reject(err);
        });
    });
});
exports.downloadAndExtract = downloadAndExtract;
