import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
let cache, calls, upstream;
const env = { APP_API_TOKEN: 'fixture-token', TWELVE_DATA_API_KEY: 'fixture-key' };
const quote = (symbol = 'VXUS') => ({ symbol, close: '78.24', previous_close: '77.50', currency: 'USD', name: symbol, exchange: 'NASDAQ', mic_code: 'XNAS', datetime: '2026-11-23' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  cache = new Map(); calls = [];
  globalThis.caches = { default: {
    match: async (request) => cache.has(request.url) ? json(cache.get(request.url)) : undefined,
    put: async (request, response) => { cache.set(request.url, await response.json()); },
  }};
  upstream = async (url) => {
    if (url.hostname === 'api.twelvedata.com') {
      assert.equal(url.pathname, '/quote', 'one quote endpoint, no price/search/profile calls');
      return json(quote(url.searchParams.get('symbol')));
    }
    assert.equal(url.hostname, 'api.frankfurter.dev');
    return json({ rate: 6.6683, date: '2026-11-23' });
  };
  globalThis.fetch = async (input, options) => {
    const url = new URL(input); calls.push(url);
    return upstream(url, options);
  };
});
afterEach(() => { globalThis.fetch = realFetch; globalThis.caches = realCaches; });

async function request(path, options = {}) {
  const pending = [];
  const response = await onRequest({ request: new Request('https://fixture.example/api/' + path,
    { headers: { 'x-api-token': 'fixture-token' }, ...options }), env, waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  return { response, body: await response.json() };
}
const stock = (symbol = 'VXUS', currency = 'USD') => request(`stock?symbol=${symbol}&quote=${currency}`);

test('four holdings cost four upstream quotes plus one shared FX; warm refresh costs zero', async () => {
  for (const symbol of ['VXUS', 'SGOV', 'SCHD', 'QQQI']) {
    const { response, body } = await stock(symbol, 'CNY');
    assert.equal(response.status, 200);
    assert.equal(body.sourcePrice, 78.24);
    assert.equal(body.price, 521.727792);
    assert.equal(body.raw.exchange, 'NASDAQ');
    assert.equal(body.raw.mic_code, 'XNAS');
    assert.equal(body.stale, false);
    assert.equal(body.cached, false);
  }
  assert.equal(calls.length, 5);
  assert.equal(calls.filter(u => u.hostname === 'api.twelvedata.com').length, 4);
  for (const symbol of ['VXUS', 'SGOV', 'SCHD', 'QQQI']) assert.equal((await stock(symbol, 'CNY')).body.cached, true);
  assert.equal(calls.length, 5);
});

test('simultaneous same-symbol misses share one quote and one FX request', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => stock('VXUS', 'CNY')));
  assert.ok(results.every(r => r.body.price === 521.727792));
  assert.equal(calls.length, 2);
});

test('HTTP 200 provider quota error is HTTP 429, is not retried or cached, then recovers', async () => {
  upstream = async () => json({ status: 'error', code: 429, message: 'Credits exhausted' });
  const { response, body } = await stock();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(body.ok, false);
  assert.equal(cache.size, 0);
  assert.equal(calls.length, 1);
  upstream = async () => json(quote());
  assert.equal((await stock()).body.price, 78.24);
  assert.equal(calls.length, 2);
});

for (const body of [JSON.stringify({ message: 'Slow down' }), '<html>Too many requests</html>']) {
  test(`HTTP 429 (${body.startsWith('<') ? 'HTML' : 'JSON'}) keeps its status and never retries`, async () => {
    upstream = async () => new Response(body, { status: 429 });
    assert.equal((await stock()).response.status, 429);
    assert.equal(calls.length, 1);
    assert.equal(cache.size, 0);
  });
}

test('expired good quote survives provider failure, flagged stale without resetting expiry', async () => {
  await stock();
  const entry = [...cache.values()][0];
  entry.expiresAt = Date.now() - 1;
  const expiresAt = entry.expiresAt;
  upstream = async () => json({ status: 'error', code: 429, message: 'Credits exhausted' });
  const { body } = await stock();
  assert.equal(body.price, 78.24);
  assert.equal(body.stale, true);
  assert.equal(body.cached, true);
  assert.equal([...cache.values()][0].expiresAt, expiresAt);
});

test('legacy poisoned fresh cache is ignored and replaced by a valid quote', async () => {
  cache.set('https://asset-quote-cache.local/stock-quote-v2%3AVXUS', {
    json: { code: 429, status: 'error' }, expiresAt: Date.now() + 900000,
  });
  assert.equal((await stock()).body.price, 78.24);
  assert.equal(calls.length, 1);
});

for (const invalid of [{ previous_close: 75, currency: 'USD' }, { close: 0, currency: 'USD' }, { close: 78 }]) {
  test(`invalid quote ${JSON.stringify(invalid)} cannot become a current valuation`, async () => {
    upstream = async () => json(invalid);
    const { body, response } = await stock();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(cache.size, 0);
    assert.equal(calls.length, 1);
  });
}

test('stock timeouts return structured JSON after one bounded attempt', async () => {
  upstream = async (_url, options) => {
    assert.ok(options.signal);
    throw new DOMException('Aborted', 'AbortError');
  };
  const { response, body } = await stock();
  assert.equal(response.status, 504);
  assert.equal(body.code, 'UPSTREAM_TIMEOUT');
  assert.equal(calls.length, 1);
});

test('FX invalid response is not cached, later valid response recovers', async () => {
  upstream = async () => json({ rate: 0 });
  assert.equal((await request('fx?base=USD&quote=CNY')).response.status, 502);
  assert.equal(cache.size, 0);
  upstream = async () => json({ rate: 6.6683 });
  assert.equal((await request('fx?base=USD&quote=CNY')).body.rate, 6.6683);
});

test('single-stock route rejects batch symbols without spending credits', async () => {
  assert.equal((await stock('VXUS,SGOV')).response.status, 400);
  assert.equal(calls.length, 0);
});

test('health and authentication checks do not request any quotes', async () => {
  assert.equal((await request('health')).body.version, '1.9.1-efficient-quotes');
  assert.equal((await request('stock?symbol=VXUS', { headers: {} })).response.status, 401);
  assert.equal(calls.length, 0);
});

test('asynchronous failures use the JSON error envelope and redact API keys', async () => {
  upstream = async () => { throw new Error('Connection failed apikey=fixture-key&symbol=VXUS'); };
  const { response, body } = await stock();
  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.ok(!body.error.includes('fixture-key'));
  const malformed = await request('portfolio/valuate', { method: 'POST', body: '{' });
  assert.equal(malformed.body.ok, false);
});

test('cache outage still returns a fresh quote', async () => {
  globalThis.caches.default.match = async () => { throw new Error('Cache unavailable'); };
  globalThis.caches.default.put = async () => { throw new Error('Cache unavailable'); };
  assert.equal((await stock()).body.price, 78.24);
});
