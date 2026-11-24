import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate, setupLambdaEnvironment } from '../build/index.js';

const out = 'ab-results';
await mkdir(out, { recursive: true });
process.env.FONTCONFIG_PATH = join(tmpdir(), 'fonts');
setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
await inflate(join('bin', 'al2023.tar.br'));
const executablePath = await chromium.executablePath('./bin/');
console.log('Executable SHA-256:', createHash('sha256').update(await readFile(executablePath)).digest('hex'));
const pages = [['example', 'https://example.com'], ['webgl', 'https://get.webgl.org']];
const fixtures = new Map();
const rows = [];
let referenceArgs;
for (const type of ['live', 'fixed']) {
  for (const variant of ['on1', 'off1', 'off2', 'on2']) {
    const single = variant.startsWith('on');
    const headless = 'shell';
    const browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: [...chromium.args, ...(single ? ['--single-process'] : [])], headless }),
      defaultViewport: { deviceScaleFactor: 1, hasTouch: false, height: 1080, isLandscape: true, isMobile: false, width: 1920 },
      executablePath, headless,
    });
    try {
      const argv = (await readFile(`/proc/${browser.process().pid}/cmdline`, 'utf8')).split('\0').filter(Boolean);
      if (argv.filter(x => x === '--single-process').length !== Number(single)) throw Error('Unexpected --single-process argv');
      const comparable = JSON.stringify(argv.filter(x => x !== '--single-process').map(x => x.replace(/^--user-data-dir=.*$/, '--user-data-dir=<fresh profile>')));
      referenceArgs ??= comparable;
      if (referenceArgs !== comparable) throw Error('Another browser argument changed');
      for (const [name, url] of pages) {
        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        const errors = [];
        const requested = new Set();
        if (type === 'fixed') {
          await page.setBypassServiceWorker(true);
          await page.setRequestInterception(true);
          page.on('request', async request => {
            try {
              const u = request.url();
              if (!/^https?:/.test(u)) return await request.continue();
              const key = `${request.method()} ${u}`;
              requested.add(key);
              if (!fixtures.has(key)) {
                if (variant !== 'on1' || request.method() !== 'GET') throw Error(`Unrecorded ${key}`);
                fixtures.set(key, (async () => {
                  const response = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'user-agent': request.headers()['user-agent'] ?? await browser.userAgent() } });
                  const headers = Object.fromEntries(response.headers);
                  for (const field of ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie', 'connection']) delete headers[field];
                  return { status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) };
                })());
              }
              await request.respond(await fixtures.get(key));
            } catch (error) {
              errors.push(String(error));
              if (!request.isInterceptResolutionHandled()) await request.abort();
            }
          });
        }
        const response = await page.goto(url, { waitUntil: 'networkidle0' });
        if (!response?.ok()) throw Error(`${url}: HTTP ${response?.status()}`);
        if (name === 'webgl') await page.evaluate(() => document.querySelector('#logo-container')?.remove());
        const png = Buffer.from(await page.screenshot());
        if (errors.length) throw Error(errors.join('; '));
        const file = `${type}-${name}-${variant}.png`;
        await writeFile(join(out, file), png);
        const row = { type, name, variant, file, finalUrl: page.url(), title: await page.title(), hash: createHash('sha256').update(`data:image/png;base64,${png.toString('base64')}`).digest('hex'), requested: [...requested].sort() };
        rows.push(row);
        console.log(JSON.stringify(row));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  await writeFile(join(out, 'captures.json'), JSON.stringify(rows, null, 2));
}
