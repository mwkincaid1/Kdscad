const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const staticRoot = process.env.STATIC_ROOT ? path.resolve(process.env.STATIC_ROOT) : root;
const report = { base: '', passed: [], failed: [], skipped: [], consoleErrors: [], requestFailures: [] };
const output = process.env.TEST_OUTPUT || path.join(root, 'test-results');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.vcf': 'text/vcard' };
let legacy = false;
let server;
async function startServer() {
  const config = JSON.parse(await fs.readFile(path.join(root, 'vercel.json')));
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/michael') { res.writeHead(308, { Location: '/michael/' }); res.end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = path.resolve(staticRoot, '.' + pathname);
      if (!filename.startsWith(staticRoot + path.sep) || pathname.includes('/.')) { res.writeHead(404); res.end(); return; }
      let body;
      if (legacy && pathname === '/michael/service-worker.js') {
        body = execFileSync('git', ['show', 'bc446af289afdbfe93f30bbdc369c7d40a8a02b8:michael/service-worker.js'], { cwd: root });
      } else { body = await fs.readFile(filename); }
      res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
      for (const rule of config.headers) {
        if (rule.source === '/(.*)' || rule.source === url.pathname) {
          for (const header of rule.headers) res.setHeader(header.key, header.value);
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function check(name, fn) {
  try { await fn(); report.passed.push(name); console.log('PASS ' + name); }
  catch (error) { report.failed.push({ name, error: error.message }); console.error('FAIL ' + name + ': ' + error.message); throw error; }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, downloadsPath: path.join(output, 'downloads') });
  report.base = process.env.BASE_URL || await startServer();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('requestfailed', request => {
      // Navigating away may cancel an in-flight responsive image; it is not a broken resource.
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
    });

    await check('all six public pages load with substantive content and no broken internal resources', async () => {
      const seen = new Set();
      for (const route of ['/', '/contact.html', '/services.html', '/projects.html', '/technology.html', '/about.html']) {
        const response = await page.goto(report.base + route);
        assert.equal(response.status(), 200, route);
        assert.ok((await page.locator('main').innerText()).length > 200, route);
        assert.equal(await page.locator('h1').count(), 1);
        for (const href of await page.locator('a[href],link[href],script[src],img[src]').evaluateAll(elements => elements.map(el => el.href || el.src))) {
          const url = new URL(href);
          if (url.origin !== new URL(report.base).origin || seen.has(url.href)) continue;
          seen.add(url.href);
          const asset = await context.request.get(url.href);
          assert.ok(asset.ok(), `${url.href}: ${asset.status()}`);
        }
      }
    });
    await check('desktop consultation reaches usable email and phone links', async () => {
      await page.goto(report.base + '/');
      await page.getByRole('link', { name: 'Request Consultation', exact: true }).click();
      await page.waitForURL('**/contact.html');
      assert.equal(await page.getByRole('link', { name: 'Email mwk@kdscad.com', exact: true }).getAttribute('href'), 'mailto:mwk@kdscad.com?subject=Project%20consultation');
      assert.equal(await page.getByRole('link', { name: 'Call (352) 758-2718', exact: true }).getAttribute('href'), 'tel:+13527582718');
    });
    await page.screenshot({ path: path.join(output, 'contact-desktop.png'), fullPage: true });
    await check('navigation works at 320, 390, 820, 1024, and 1440 pixels', async () => {
      for (const width of [320, 390, 820, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(report.base + '/');
        for (const link of await page.locator('nav a').all()) assert.equal(await link.isVisible(), true);
        await page.getByRole('navigation').getByRole('link', { name: 'Services', exact: true }).click();
        await page.waitForURL('**/services.html');
        assert.equal(await page.locator('nav a[aria-current="page"]').innerText(), 'Services');
        const overflow = await page.locator('.site-header').evaluate(el => [...el.querySelectorAll('a')].some(a => a.getBoundingClientRect().right > innerWidth + 1));
        assert.equal(overflow, false, `header overflow at ${width}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(report.base + '/');
      await page.screenshot({ path: path.join(output, 'home-mobile.png'), fullPage: true });
    });
    await check('responsive hero uses a compressed WebP and renders successfully', async () => {
      await page.goto(report.base + '/');
      const image = page.locator('.hero-media img');
      await image.evaluate(el => el.decode());
      const src = await image.evaluate(el => el.currentSrc);
      assert.match(src, /site-(480|960|1672)\.webp$/);
      assert.ok((await (await context.request.get(src)).body()).length < 250000);
    });
    await check('security headers restrict scripts and framing', async () => {
      const response = await context.request.get(report.base + '/');
      assert.equal(response.headers()['x-content-type-options'], 'nosniff');
      const policy = response.headers()['content-security-policy'];
      assert.ok(policy?.includes("script-src 'self'"));
      assert.ok(policy.includes("frame-ancestors 'none'"));
      assert.ok(!policy.includes('unsafe-inline'));
    });
    await check('business card installs and QR dialog opens and closes', async () => {
      await page.goto(report.base + '/michael/');
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      });
      await page.getByRole('button', { name: /Show QR Code/ }).click();
      assert.equal(await page.locator('#qrDialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Close QR code' }).click();
      assert.equal(await page.locator('#qrDialog').evaluate(el => el.open), false);
      const vcard = await context.request.get(report.base + '/michael/assets/michael-kincaid.vcf');
      assert.match(await vcard.text(), /BEGIN:VCARD/);
    });
    if (process.env.SKIP_NATIVE_DOWNLOAD === '1') {
      report.skipped.push('Native vCard saving: Chromium cancels downloads in this test environment; HTTP payload and offline vCard are tested separately.');
    } else await check('vCard saves through the native browser download', async () => {
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Save Contact' }).click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), 'michael-kincaid.vcf');
      await download.saveAs(path.join(output, 'downloads', 'michael-kincaid.vcf'));
      assert.equal(await download.failure(), null);
    });
    await page.screenshot({ path: path.join(output, 'card-mobile.png'), fullPage: true });
    await check('share fallback copies the canonical card URL', async () => {
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copiedCard = value; } }, configurable: true });
      });
      await page.getByRole('button', { name: 'Share Card', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Card link copied' }).waitFor();
      assert.equal(await page.evaluate(() => window.copiedCard), 'https://kdscad.com/michael/');
    });
    await check('offline card, QR image, script, and vCard remain available', async () => {
      await context.setOffline(true);
      await page.reload();
      assert.match(await page.locator('h1').innerText(), /MICHAEL KINCAID/);
      await page.getByRole('button', { name: /Show QR Code/ }).click();
      await page.locator('#qrDialog img').evaluate(el => el.decode());
      const offline = await page.evaluate(async () => {
        const response = await fetch('assets/michael-kincaid.vcf');
        return { status: response.status, body: await response.text() };
      });
      assert.equal(offline.status, 200);
      assert.match(offline.body, /BEGIN:VCARD/);
      await context.setOffline(false);
    });
    await check('browser produced no JavaScript or CSP errors', async () => {
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.requestFailures, []);
    });
    await context.close();

    if (server) await check('existing v1 installation migrates to v2 without deleting another app cache', async () => {
      legacy = true;
      const existing = await browser.newContext();
      const oldPage = await existing.newPage();
      await oldPage.goto(report.base + '/michael/');
      await oldPage.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        const other = await caches.open('other-app-cache');
        await other.put('/unrelated-resource', new Response('keep me'));
      });
      legacy = false;
      await oldPage.evaluate(async () => {
        const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        const registration = await navigator.serviceWorker.getRegistration();
        await registration.update();
        await changed;
      });
      await oldPage.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
      const keys = await oldPage.evaluate(() => caches.keys());
      assert.ok(keys.includes('other-app-cache'));
      assert.ok(keys.includes('kds-michael-v2'));
      assert.ok(!keys.includes('kds-michael-v1'));
      await oldPage.reload();
      assert.equal((await oldPage.locator('.secondary-actions a').first().innerText()).replace(/\s+/g, ' '), 'Project Planning →');
      await existing.setOffline(true);
      await oldPage.reload();
      assert.match(await oldPage.locator('h1').innerText(), /MICHAEL KINCAID/);
      await existing.close();
    });
  } finally {
    await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(`${report.passed.length} browser checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
