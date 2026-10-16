const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const origin = 'https://kdscad.com';
const source = fs.readFileSync(process.env.SW_FILE || path.join(__dirname, '../michael/service-worker.js'), 'utf8');
const absolute = key => new URL(typeof key === 'string' ? key : key.url, origin).href;
function basic(body, status = 200) {
  const response = new Response(body, { status });
  Object.defineProperty(response, 'type', { value: 'basic' });
  response.clone = () => basic(body, status);
  return response;
}
function worker(options = {}) {
  const handlers = {};
  const stores = new Map();
  const calls = [];
  let claimed = false, skipped = false;
  const getCache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      async match(key) { return data.get(absolute(key))?.clone(); },
      async put(key, response) {
        if (options.writeError) throw new Error('Quota exceeded');
        await options.writeGate;
        data.set(absolute(key), response.clone());
      },
      async addAll(requests) {
        if (options.installError) throw new Error('Precache resource unavailable');
        for (const request of requests) data.set(absolute(request), basic('precache: ' + absolute(request)));
      }
    };
  };
  const caches = {
    open: async name => getCache(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async key => {
      for (const name of stores.keys()) {
        const match = await getCache(name).match(key);
        if (match) return match;
      }
    }
  };
  vm.runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } }
    },
    caches, URL, Response,
    Request: class extends Request { constructor(url, init) { super(absolute(url), init); } },
    console: { warn() {} },
    fetch: async (request, init) => {
      calls.push({ request, init });
      if (options.offline) throw new TypeError('Offline');
      return basic(options.body || 'fresh', options.status || 200);
    }
  });
  return {
    stores, calls, caches,
    get claimed() { return claimed; }, get skipped() { return skipped; },
    seed(name, key, body) { getCache(name); stores.get(name).set(absolute(key), basic(body)); },
    async lifecycle(name) {
      const promises = [];
      handlers[name]({ waitUntil: p => promises.push(p) });
      await Promise.all(promises);
    },
    request(url, { mode = 'cors', method = 'GET' } = {}) {
      let promise;
      handlers.fetch({ request: { url: absolute(url), mode, method }, respondWith: p => { promise = p; } });
      return promise;
    }
  };
}

test('installation precaches the finite card resources before activation', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.equal(w.skipped, true);
  assert.equal(w.stores.get('kds-michael-v2').size, 9);
});
test('failed precache installation never skips the waiting worker', async () => {
  const w = worker({ installError: true });
  await assert.rejects(w.lifecycle('install'));
  assert.equal(w.skipped, false);
});
test('activation deletes only older card caches and preserves other apps', async () => {
  const w = worker();
  for (const name of ['kds-michael-v1', 'kds-michael-v2', 'other-app']) w.seed(name, '/x', name);
  await w.lifecycle('activate');
  assert.deepEqual([...w.stores.keys()].sort(), ['kds-michael-v2', 'other-app']);
  assert.equal(w.claimed, true);
});
test('online assets refresh old cached content', async () => {
  const w = worker(); w.seed('kds-michael-v2', '/michael/script.js', 'old');
  assert.equal(await (await w.request('/michael/script.js')).text(), 'fresh');
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].init.cache, 'no-store');
  assert.equal(await (await (await w.caches.open('kds-michael-v2')).match('/michael/script.js')).text(), 'fresh');
});
test('404 and 500 responses do not replace successful cached assets', async () => {
  for (const status of [404, 500]) {
    const w = worker({ status }); w.seed('kds-michael-v2', '/michael/script.js', 'good');
    assert.equal((await w.request('/michael/script.js')).status, status);
    assert.equal(await (await (await w.caches.open('kds-michael-v2')).match('/michael/script.js')).text(), 'good');
  }
});
test('query parameters do not grow the static asset or navigation cache', async () => {
  const w = worker();
  for (let i = 0; i < 30; i++) {
    await w.request('/michael/script.js?utm_source=' + i);
    await w.request('/michael/?utm_source=' + i, { mode: 'navigate' });
  }
  assert.equal(w.stores.get('kds-michael-v2').size, 2);
});
test('unknown resources, cross-origin requests, and POST bypass interception', () => {
  const w = worker();
  assert.equal(w.request('/michael/missing.js'), undefined);
  assert.equal(w.request('/api/private'), undefined);
  assert.equal(w.request('https://example.com/script.js'), undefined);
  assert.equal(w.request('/michael/script.js', { method: 'POST' }), undefined);
});
test('offline aliases and query strings use the same cached document', async () => {
  const w = worker({ offline: true }); w.seed('kds-michael-v2', '/michael/', 'card');
  for (const url of ['/michael', '/michael/', '/michael/index.html?utm_source=qr']) {
    assert.equal(await (await w.request(url, { mode: 'navigate' })).text(), 'card');
  }
});
test('offline assets return their own cached content, including vCard', async () => {
  const w = worker({ offline: true });
  w.seed('kds-michael-v2', '/michael/assets/michael-kincaid.vcf', 'BEGIN:VCARD');
  assert.equal(await (await w.request('/michael/assets/michael-kincaid.vcf')).text(), 'BEGIN:VCARD');
});
test('uncached offline asset never receives an HTML document', async () => {
  const w = worker({ offline: true }); w.seed('kds-michael-v2', '/michael/', '<html>card</html>');
  assert.equal((await w.request('/michael/script.js')).type, 'error');
});
test('uncached offline navigation returns an explicit 503 document', async () => {
  const w = worker({ offline: true });
  const response = await w.request('/michael/', { mode: 'navigate' });
  assert.equal(response.status, 503);
  assert.match(response.headers.get('Content-Type'), /text\/html/);
});
test('quota failure does not break an online request', async () => {
  const w = worker({ writeError: true });
  assert.equal(await (await w.request('/michael/script.js')).text(), 'fresh');
});
test('response lifetime includes cache persistence', async () => {
  let release;
  const writeGate = new Promise(resolve => { release = resolve; });
  const w = worker({ writeGate });
  let settled = false;
  const response = w.request('/michael/script.js').then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release();
  assert.equal((await response).status, 200);
});
