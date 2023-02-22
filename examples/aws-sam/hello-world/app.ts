import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const pageTitle = await page.title();
    await browser.close();
    let response: APIGatewayProxyResult;

    try {
        response = {
            statusCode: 200,
            body: JSON.stringify({
                message: pageTitle,
            }),
        };
    } catch (err: unknown) {
        console.error(err);
        response = {
            statusCode: 500,
            body: JSON.stringify({
                message: err instanceof Error ? err.message : 'some error happened',
            }),
        };
    }

    return response;
};
