export declare const isValidUrl: (input: string) => boolean;
/**
 * Determines if the running instance is inside an AWS Lambda container.
 * AWS_EXECUTION_ENV is for native Lambda instances
 * AWS_LAMBDA_JS_RUNTIME is for netlify instances
 * @returns boolean indicating if the running instance is inside a Lambda container
 */
export declare const isRunningInAwsLambda: () => boolean;
export declare const downloadAndExtract: (url: string) => Promise<string>;
