const VERSION = "1.5.0-pages-crypto-fix";
const DEFAULT_CACHE_TTL_SECONDS = 15 * 60;
const STALE_CACHE_SECONDS = 7 * 24 * 60 * 60;
const TROY_OUNCE_GRAMS = 31.1034768;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ASSETS = 120;
const MAX_LIABILITIES = 120;

const SUPPORTED_DEFAULT_CURRENCIES = ["CNY", "USD", "HKD", "SGD", "EUR", "JPY", "USDT"];

const COMMON_CRYPTO_ID_MAP = {
  BTC: "bitcoin", XBT: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin",
  BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", TRX: "tron", TON: "the-open-network",
  AVAX: "avalanche-2", DOT: "polkadot", LTC: "litecoin", BCH: "bitcoin-cash", XLM: "stellar",
  SUI: "sui", HYPE: "hyperliquid", SHIB: "shiba-inu", PEPE: "pepe", LINK: "chainlink",
  UNI: "uniswap", MATIC: "matic-network", POL: "polygon-ecosystem-token",
};

const LOCAL_MARKET_OPTIONS = [
  { assetType: "stock", name: "Apple Inc.", symbol: "AAPL", displayCode: "AAPL", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Microsoft Corporation", symbol: "MSFT", displayCode: "MSFT", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "NVIDIA Corporation", symbol: "NVDA", displayCode: "NVDA", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Tesla Inc.", symbol: "TSLA", displayCode: "TSLA", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Amazon.com Inc.", symbol: "AMZN", displayCode: "AMZN", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Alphabet Inc. Class A", symbol: "GOOGL", displayCode: "GOOGL", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Alphabet Inc. Class C", symbol: "GOOG", displayCode: "GOOG", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Meta Platforms Inc.", symbol: "META", displayCode: "META", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Interactive Brokers Group", symbol: "IBKR", displayCode: "IBKR", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "SanDisk Corporation", symbol: "SNDK", displayCode: "SNDK", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Micron Technology", symbol: "MU", displayCode: "MU", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "stock", name: "Western Digital", symbol: "WDC", displayCode: "WDC", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "etf", name: "Invesco QQQ Trust", symbol: "QQQ", displayCode: "QQQ", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "etf", name: "Invesco NASDAQ 100 ETF", symbol: "QQQM", displayCode: "QQQM", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "etf", name: "NEOS Nasdaq-100 High Income ETF", symbol: "QQQI", displayCode: "QQQI", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "etf", name: "SPDR S&P 500 ETF Trust", symbol: "SPY", displayCode: "SPY", quoteCurrency: "USD", exchange: "NYSE" },
  { assetType: "etf", name: "SPDR Portfolio S&P 500 ETF", symbol: "SPLG", displayCode: "SPLG", quoteCurrency: "USD", exchange: "NYSE" },
  { assetType: "etf", name: "SPDR Portfolio S&P 1500 Composite Stock Market ETF", symbol: "SPTM", displayCode: "SPTM", quoteCurrency: "USD", exchange: "NYSE" },
  { assetType: "etf", name: "SPYM", symbol: "SPYM", displayCode: "SPYM", quoteCurrency: "USD", exchange: "US" },
  { assetType: "etf", name: "NEOS S&P 500 High Income ETF", symbol: "SPYI", displayCode: "SPYI", quoteCurrency: "USD", exchange: "BATS" },
  { assetType: "etf", name: "Vanguard Total International Stock ETF", symbol: "VXUS", displayCode: "VXUS", quoteCurrency: "USD", exchange: "NASDAQ" },
  { assetType: "etf", name: "Schwab U.S. Dividend Equity ETF", symbol: "SCHD", displayCode: "SCHD", quoteCurrency: "USD", exchange: "NYSE" },
  { assetType: "etf", name: "iShares 0-3 Month Treasury Bond ETF", symbol: "SGOV", displayCode: "SGOV", quoteCurrency: "USD", exchange: "NASDAQ" },
].map((item) => ({ ...item, provider: "local", unit: "", subtitle: [item.exchange, item.quoteCurrency].filter(Boolean).join(" · ") }));

const LOCAL_METALS = [
  { assetType: "metal", name: "黄金", englishName: "Gold", symbol: "XAU", displayCode: "XAU", quoteCurrency: "USD", unit: "gram", provider: "local" },
  { assetType: "metal", name: "白银", englishName: "Silver", symbol: "XAG", displayCode: "XAG", quoteCurrency: "USD", unit: "gram", provider: "local" },
  { assetType: "metal", name: "铂金", englishName: "Platinum", symbol: "XPT", displayCode: "XPT", quoteCurrency: "USD", unit: "gram", provider: "local" },
  { assetType: "metal", name: "钯金", englishName: "Palladium", symbol: "XPD", displayCode: "XPD", quoteCurrency: "USD", unit: "gram", provider: "local" },
];

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const ctx = context;

  try {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/" || url.pathname === "/docs") {
      return htmlResponse(renderDocs(url.origin));
    }

    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse({ ok: false, error: "Not found" }, 404);
    }

    const auth = checkAuth(request, url, env);
    if (!auth.ok) {
      return jsonResponse({ ok: false, error: auth.error, code: "UNAUTHORIZED" }, 401);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true, version: VERSION, time: new Date().toISOString() });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({
        ok: true,
        version: VERSION,
        cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
        staleCacheSeconds: STALE_CACHE_SECONDS,
        supportedDefaultCurrencies: SUPPORTED_DEFAULT_CURRENCIES,
        assetTypes: ["cash", "manual", "crypto", "metal", "stock", "etf"],
        metalSymbols: ["XAU", "XAG", "XPT", "XPD"],
        searchEndpoint: "/api/search?type=stock&q=apple",
      });
    }

    if (url.pathname === "/api/debug/env") {
      return jsonResponse({
        ok: true,
        version: VERSION,
        hasAppApiToken: Boolean((env.APP_API_TOKEN || "").trim()),
        hasTwelveDataApiKey: Boolean((env.TWELVE_DATA_API_KEY || "").trim()),
        runtime: "cloudflare-pages-functions",
        note: "Only booleans are returned. Secret values are never exposed.",
      });
    }

    if (url.pathname === "/api/debug/self-test") {
      return handleSelfTest(url, env, ctx);
    }

    if (url.pathname === "/api/debug/crypto") {
      return handleCrypto(url, env, ctx);
    }

    if (url.pathname === "/api/fx") return handleFx(url, env, ctx);
    if (url.pathname === "/api/convert") return handleConvert(url, env, ctx);
    if (url.pathname === "/api/crypto") return handleCrypto(url, env, ctx);
    if (url.pathname === "/api/metal") return handleMetal(url, env, ctx);
    if (url.pathname === "/api/stock") return handleStock(url, env, ctx);
    if (url.pathname === "/api/search") return handleSearch(url, env, ctx);

    if (url.pathname === "/api/portfolio/valuate") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "Use POST with JSON body for /api/portfolio/valuate", code: "METHOD_NOT_ALLOWED" }, 405);
      }
      return handlePortfolioValuation(request, env, ctx);
    }

    return jsonResponse({ ok: false, error: "Unknown API endpoint", code: "UNKNOWN_ENDPOINT" }, 404);
  } catch (error) {
    return jsonResponse(toErrorPayload(error), error?.status || 500);
  }
}

function checkAuth(request, url, env) {
  const requiredToken = (env.APP_API_TOKEN || "").trim();
  if (!requiredToken) return { ok: true };

  const headerToken = request.headers.get("x-api-token") || "";
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const queryToken = url.searchParams.get("token") || "";

  if (safeEqual(headerToken, requiredToken) || safeEqual(bearerToken, requiredToken) || safeEqual(queryToken, requiredToken)) {
    return { ok: true };
  }

  return { ok: false, error: "Unauthorized. Missing or invalid x-api-token." };
}

async function handleSelfTest(url, env, ctx) {
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const tests = [];

  async function run(name, fn) {
    const started = Date.now();
    try {
      const result = await fn();
      tests.push({ name, ok: true, ms: Date.now() - started, sample: result });
    } catch (error) {
      tests.push({ name, ok: false, ms: Date.now() - started, error: cleanErrorMessage(error) });
    }
  }

  await run("fx_USD_to_quote", async () => {
    const fx = await getFxRate("USD", quote, ctx);
    return { rate: fx.rate, provider: fx.provider, cached: fx.cached, stale: fx.stale || false };
  });
  await run("crypto_SOL", async () => {
    const data = await getCryptoPrices(["solana"], quote, ctx);
    return { price: data.items[0]?.price, provider: "CoinGecko", cached: data.cached, stale: data.stale || false };
  });
  await run("metal_XAU", async () => {
    const data = await getMetalPrice("XAU", "gram", quote, ctx);
    return { price: data.price, provider: data.provider, cached: data.cached, stale: data.stale || false };
  });
  await run("stock_AAPL", async () => {
    const data = await getStockPrice("AAPL", quote, env, ctx);
    return { price: data.price, provider: data.provider, cached: data.cached, stale: data.stale || false };
  });

  return jsonResponse({ ok: tests.every((t) => t.ok), version: VERSION, quote, tests, time: new Date().toISOString() });
}

async function handleFx(url, env, ctx) {
  const base = upper(url.searchParams.get("base") || "USD");
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const amount = toNumber(url.searchParams.get("amount") || "1", 1);
  const fx = await getFxRate(base, quote, ctx);

  return jsonResponse({
    ok: true,
    base,
    quote,
    amount,
    rate: fx.rate,
    convertedAmount: round(amount * fx.rate),
    provider: fx.provider,
    cached: fx.cached,
    stale: fx.stale || false,
    updatedAt: fx.updatedAt,
  });
}

async function handleConvert(url, env, ctx) {
  const from = upper(url.searchParams.get("from") || "USD");
  const to = upper(url.searchParams.get("to") || "CNY");
  const amount = toNumber(url.searchParams.get("amount") || "1", 1);
  const fx = await getFxRate(from, to, ctx);

  return jsonResponse({
    ok: true,
    from,
    to,
    amount,
    rate: fx.rate,
    result: round(amount * fx.rate),
    provider: fx.provider,
    cached: fx.cached,
    stale: fx.stale || false,
    updatedAt: fx.updatedAt,
  });
}

async function handleCrypto(url, env, ctx) {
  const idsInput = url.searchParams.get("ids") || url.searchParams.get("symbols") || "bitcoin";
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const ids = idsInput.split(",").map((v) => normalizeCryptoId(v.trim())).filter(Boolean).slice(0, 80);
  if (!ids.length) return jsonResponse({ ok: false, error: "ids is required, e.g. /api/crypto?ids=solana,bitcoin&quote=CNY", code: "BAD_REQUEST" }, 400);

  try {
    const result = await getCryptoPrices(ids, quote, ctx);
    return jsonResponse({ ok: true, quote, provider: result.provider || "CoinGecko", items: result.items, cached: result.cached, stale: result.stale || false, updatedAt: result.updatedAt });
  } catch (error) {
    // 兜底：虚拟币上游偶尔会返回 HTML / 403 / 429 / 超时。这里必须返回 JSON，避免 Cloudflare 1101 影响 App。
    const fallback = await buildCryptoFallbackItems(ids, quote, ctx, error);
    return jsonResponse({
      ok: fallback.items.some((item) => typeof item.price === "number"),
      quote,
      provider: fallback.provider,
      items: fallback.items,
      cached: fallback.cached,
      stale: true,
      warning: cleanErrorMessage(error),
      updatedAt: fallback.updatedAt,
    }, 200);
  }
}

async function handleMetal(url, env, ctx) {
  const symbol = upper(url.searchParams.get("symbol") || "XAU");
  const unit = (url.searchParams.get("unit") || "gram").toLowerCase();
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const amount = toNumber(url.searchParams.get("amount") || "1", 1);
  const metal = await getMetalPrice(symbol, unit, quote, ctx);

  return jsonResponse({
    ok: true,
    symbol,
    unit: metal.unit,
    quote,
    amount,
    price: metal.price,
    value: round(amount * metal.price),
    sourcePricePerTroyOunceUsd: metal.sourcePricePerTroyOunceUsd,
    provider: metal.provider,
    cached: metal.cached,
    stale: metal.stale || false,
    updatedAt: metal.updatedAt,
  });
}

async function handleStock(url, env, ctx) {
  const symbol = upper(url.searchParams.get("symbol") || "AAPL");
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const amount = toNumber(url.searchParams.get("amount") || "1", 1);
  const stock = await getStockPrice(symbol, quote, env, ctx);

  return jsonResponse({
    ok: true,
    symbol,
    quote,
    amount,
    price: stock.price,
    value: round(amount * stock.price),
    sourceCurrency: stock.sourceCurrency,
    sourcePrice: stock.sourcePrice,
    provider: stock.provider,
    cached: stock.cached,
    stale: stock.stale || false,
    updatedAt: stock.updatedAt,
    raw: stock.rawSummary,
  });
}

async function handleSearch(url, env, ctx) {
  const type = String(url.searchParams.get("type") || "stock").toLowerCase();
  const q = String(url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
  const limit = clampInt(url.searchParams.get("limit"), 1, 30, 10);

  if (["stock", "etf"].includes(type)) {
    const items = await searchTwelveDataSymbols({ type, query: q, limit, env, ctx });
    return jsonResponse({ ok: true, type, query: q, provider: items.some((i) => i.provider === "Twelve Data") ? "Twelve Data + local" : "local", items });
  }

  if (type === "crypto") {
    const items = await searchCoinGeckoCoins({ query: q, limit, ctx });
    return jsonResponse({ ok: true, type, query: q, provider: items.provider || (q ? "CoinGecko Search" : "CoinGecko Markets"), items: items.items || items });
  }

  if (type === "metal") {
    const lowerQ = q.toLowerCase();
    const metals = LOCAL_METALS.filter((m) => !q || [m.name, m.englishName, m.symbol, m.displayCode].some((v) => String(v).toLowerCase().includes(lowerQ))).slice(0, limit);
    return jsonResponse({ ok: true, type, query: q, provider: "local", items: metals });
  }

  return jsonResponse({ ok: false, error: "Unsupported search type. Use stock/etf/crypto/metal.", code: "BAD_REQUEST" }, 400);
}

async function searchTwelveDataSymbols({ type, query, limit, env, ctx }) {
  const q = query.trim();
  const local = filterLocalMarketOptions(type, q, limit);
  if (!q) return local;

  const apiKey = (env.TWELVE_DATA_API_KEY || "").trim();
  if (!apiKey) return local;

  try {
    const tdUrl = new URL("https://api.twelvedata.com/symbol_search");
    tdUrl.searchParams.set("symbol", q);
    tdUrl.searchParams.set("apikey", apiKey);
    const data = await cachedJson(`search:td:${type}:${q.toLowerCase()}`, 24 * 60 * 60, () => fetchJson(tdUrl.toString(), { service: "Twelve Data Search" }), ctx);
    if (isProviderError(data.json)) throw new Error(data.json?.message || `Twelve Data search error for ${q}`);

    const rows = Array.isArray(data.json?.data) ? data.json.data : [];
    const remote = rows.map((row) => normalizeTwelveSearchRow(row, type)).filter(Boolean).filter((item) => type === "etf" ? item.assetType === "etf" : item.assetType === "stock");
    return mergeSearchItems(remote, local).slice(0, limit);
  } catch (_) {
    return local;
  }
}

function filterLocalMarketOptions(type, query, limit) {
  const q = String(query || "").trim().toLowerCase();
  return LOCAL_MARKET_OPTIONS.filter((item) => item.assetType === type).filter((item) => {
    if (!q) return true;
    return [item.name, item.symbol, item.displayCode, item.exchange].some((v) => String(v || "").toLowerCase().includes(q));
  }).slice(0, limit);
}

function mergeSearchItems(remote, local) {
  const seen = new Set();
  const merged = [];
  for (const item of [...remote, ...local]) {
    const key = `${item.assetType}:${item.symbol}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function normalizeTwelveSearchRow(row, requestedType) {
  const symbol = upper(row?.symbol || row?.ticker || "");
  if (!symbol) return null;
  const instrumentType = String(row?.instrument_type || row?.type || "").toLowerCase();
  const name = String(row?.instrument_name || row?.name || symbol).trim();
  const exchange = String(row?.exchange || row?.mic_code || "").trim();
  const currency = upper(row?.currency || "USD");
  const isEtf = instrumentType.includes("etf") || name.toLowerCase().includes(" etf") || requestedType === "etf";
  return { assetType: isEtf ? "etf" : "stock", name, symbol, displayCode: symbol, quoteCurrency: currency || "USD", unit: "", exchange, provider: "Twelve Data", subtitle: [exchange, currency, row?.country].filter(Boolean).join(" · ") };
}

async function searchCoinGeckoCoins({ query, limit, ctx }) {
  const q = query.trim();
  try {
    if (!q) {
      const marketUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
      marketUrl.searchParams.set("vs_currency", "usd");
      marketUrl.searchParams.set("order", "market_cap_desc");
      marketUrl.searchParams.set("per_page", String(Math.max(limit, 20)));
      marketUrl.searchParams.set("page", "1");
      marketUrl.searchParams.set("sparkline", "false");
      const data = await cachedJson("search:cg:top", 60 * 60, () => fetchJson(marketUrl.toString(), { service: "CoinGecko Markets" }), ctx);
      const rows = Array.isArray(data.json) ? data.json : [];
      return rows.slice(0, limit).map((row) => ({ assetType: "crypto", name: row.name || row.id, symbol: row.id, displayCode: upper(row.symbol || row.id), quoteCurrency: "USD", unit: "", provider: "CoinGecko Markets", subtitle: row.market_cap_rank ? `Rank #${row.market_cap_rank}` : "" }));
    }
    const searchUrl = new URL("https://api.coingecko.com/api/v3/search");
    searchUrl.searchParams.set("query", q);
    const data = await cachedJson(`search:cg:${q.toLowerCase()}`, 60 * 60, () => fetchJson(searchUrl.toString(), { service: "CoinGecko Search" }), ctx);
    const rows = Array.isArray(data.json?.coins) ? data.json.coins : [];
    return rows.slice(0, limit).map((row) => ({ assetType: "crypto", name: row.name || row.id, symbol: row.id, displayCode: upper(row.symbol || row.id), quoteCurrency: "USD", unit: "", provider: "CoinGecko Search", subtitle: row.market_cap_rank ? `Rank #${row.market_cap_rank}` : "" }));
  } catch (_) {
    const fallback = Object.entries(COMMON_CRYPTO_ID_MAP).map(([code, id]) => ({ assetType: "crypto", name: id, symbol: id, displayCode: code, quoteCurrency: "USD", unit: "", provider: "local", subtitle: "local fallback" }));
    const lowerQ = q.toLowerCase();
    return fallback.filter((x) => !q || x.displayCode.toLowerCase().includes(lowerQ) || x.symbol.toLowerCase().includes(lowerQ) || x.name.toLowerCase().includes(lowerQ)).slice(0, limit);
  }
}

async function handlePortfolioValuation(request, env, ctx) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ ok: false, error: "Invalid JSON body", code: "BAD_JSON" }, 400);

  const defaultCurrency = upper(body.defaultCurrency || body.currency || "CNY");
  const assets = Array.isArray(body.assets) ? body.assets.slice(0, MAX_ASSETS) : [];
  const liabilities = Array.isArray(body.liabilities) ? body.liabilities.slice(0, MAX_LIABILITIES) : [];

  const assetResults = await allSettledMapLimit(assets, 8, (asset) => valuateAsset(asset, defaultCurrency, env, ctx));
  const valuedAssets = [];
  const failedAssets = [];
  assetResults.forEach((result, index) => {
    if (result.status === "fulfilled") valuedAssets.push(result.value);
    else failedAssets.push(failedItem(assets[index], result.reason));
  });

  const liabilityResults = await allSettledMapLimit(liabilities, 8, (item) => valuateLiability(item, defaultCurrency, ctx));
  const valuedLiabilities = [];
  const failedLiabilities = [];
  liabilityResults.forEach((result, index) => {
    if (result.status === "fulfilled") valuedLiabilities.push(result.value);
    else failedLiabilities.push(failedItem(liabilities[index], result.reason));
  });

  const assetTotal = sum(valuedAssets.map((a) => a.value));
  const receivableTotal = sum(valuedLiabilities.filter((i) => i.direction === "receivable").map((i) => i.value));
  const payableTotal = sum(valuedLiabilities.filter((i) => i.direction === "payable").map((i) => i.value));
  const netWorth = round(assetTotal + receivableTotal - payableTotal);

  return jsonResponse({
    ok: true,
    defaultCurrency,
    totals: { assetTotal: round(assetTotal), receivableTotal: round(receivableTotal), payableTotal: round(payableTotal), netWorth },
    assets: valuedAssets,
    liabilities: valuedLiabilities,
    failedAssets,
    failedLiabilities,
    truncated: { assets: Array.isArray(body.assets) && body.assets.length > MAX_ASSETS, liabilities: Array.isArray(body.liabilities) && body.liabilities.length > MAX_LIABILITIES },
    updatedAt: new Date().toISOString(),
  });
}

async function valuateAsset(asset, defaultCurrency, env, ctx) {
  const type = String(asset?.type || "manual").toLowerCase();
  const quantity = toNumber(asset?.quantity ?? asset?.amount ?? 0, 0);
  const id = asset?.id || null;
  const name = asset?.name || asset?.displayName || asset?.symbol || "Unnamed Asset";

  if (quantity === 0) return baseAssetResult(asset, { id, name, type, quantity, price: 0, sourceCurrency: defaultCurrency, value: 0, provider: "none" });

  if (type === "cash") {
    const sourceCurrency = upper(asset?.currency || asset?.quoteCurrency || defaultCurrency);
    const fx = await getFxRate(sourceCurrency, defaultCurrency, ctx);
    return baseAssetResult(asset, { id, name, type, quantity, price: round(fx.rate), sourceCurrency, value: round(quantity * fx.rate), provider: fx.provider, stale: fx.stale || false, updatedAt: fx.updatedAt });
  }

  if (type === "manual") {
    const sourceCurrency = upper(asset?.currency || asset?.quoteCurrency || defaultCurrency);
    const manualPrice = toNumber(asset?.manualPrice ?? asset?.unitPrice ?? asset?.price ?? 0, 0);
    const fx = await getFxRate(sourceCurrency, defaultCurrency, ctx);
    return baseAssetResult(asset, { id, name, type, quantity, price: round(manualPrice * fx.rate), sourcePrice: manualPrice, sourceCurrency, value: round(quantity * manualPrice * fx.rate), provider: "manual + " + fx.provider, stale: fx.stale || false, updatedAt: fx.updatedAt });
  }

  if (type === "crypto") {
    const cryptoId = normalizeCryptoId(asset?.coinId || asset?.symbol || asset?.code || name);
    const prices = await getCryptoPrices([cryptoId], defaultCurrency, ctx);
    const item = prices.items[0];
    if (!item || typeof item.price !== "number") throw new Error(`Crypto price not found: ${cryptoId}`);
    return baseAssetResult(asset, { id, name, type, symbol: cryptoId, quantity, price: item.price, sourceCurrency: defaultCurrency, value: round(quantity * item.price), provider: "CoinGecko", stale: prices.stale || false, updatedAt: item.updatedAt || prices.updatedAt });
  }

  if (type === "metal") {
    const symbol = upper(asset?.symbol || asset?.code || "XAU");
    const unit = String(asset?.unit || "gram").toLowerCase();
    const metal = await getMetalPrice(symbol, unit, defaultCurrency, ctx);
    return baseAssetResult(asset, { id, name, type, symbol, unit: metal.unit, quantity, price: metal.price, sourceCurrency: defaultCurrency, value: round(quantity * metal.price), provider: metal.provider, stale: metal.stale || false, updatedAt: metal.updatedAt });
  }

  if (type === "stock" || type === "etf") {
    const symbol = upper(asset?.symbol || asset?.code || "");
    if (!symbol) throw new Error("Stock symbol is required");
    const stock = await getStockPrice(symbol, defaultCurrency, env, ctx);
    return baseAssetResult(asset, { id, name, type, symbol, quantity, price: stock.price, sourcePrice: stock.sourcePrice, sourceCurrency: stock.sourceCurrency, value: round(quantity * stock.price), provider: stock.provider, stale: stock.stale || false, updatedAt: stock.updatedAt });
  }

  throw new Error(`Unsupported asset type: ${type}`);
}

function baseAssetResult(input, result) {
  return { id: result.id, name: result.name, type: result.type, symbol: result.symbol || input?.symbol || input?.code || null, unit: result.unit || input?.unit || null, quantity: result.quantity, price: round(result.price), sourcePrice: result.sourcePrice !== undefined ? round(result.sourcePrice) : undefined, sourceCurrency: result.sourceCurrency, value: round(result.value), provider: result.provider, stale: result.stale || false, updatedAt: result.updatedAt || new Date().toISOString() };
}

async function valuateLiability(item, defaultCurrency, ctx) {
  const amount = toNumber(item?.amount ?? 0, 0);
  const currency = upper(item?.currency || defaultCurrency);
  const directionRaw = String(item?.direction || item?.type || "payable").toLowerCase();
  const direction = ["receivable", "asset", "lend", "owed_to_me", "别人欠我"].includes(directionRaw) ? "receivable" : "payable";
  const fx = await getFxRate(currency, defaultCurrency, ctx);
  return { id: item?.id || null, name: item?.name || (direction === "payable" ? "我欠别人" : "别人欠我"), direction, amount, currency, value: round(amount * fx.rate), provider: fx.provider, stale: fx.stale || false, updatedAt: fx.updatedAt };
}

async function getStockPrice(symbol, targetCurrency, env, ctx) {
  const apiKey = (env.TWELVE_DATA_API_KEY || "").trim();
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY is not configured in Cloudflare environment variables.");

  const priceUrl = new URL("https://api.twelvedata.com/price");
  priceUrl.searchParams.set("symbol", symbol);
  priceUrl.searchParams.set("apikey", apiKey);

  const quoteUrl = new URL("https://api.twelvedata.com/quote");
  quoteUrl.searchParams.set("symbol", symbol);
  quoteUrl.searchParams.set("apikey", apiKey);

  const priceData = await cachedJson(`stock-price:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(priceUrl.toString(), { service: "Twelve Data Price" }), ctx);
  if (isProviderError(priceData.json)) throw new Error(priceData.json?.message || `Twelve Data price error for ${symbol}`);

  let quoteJson = null;
  let quoteCached = false;
  let quoteStale = false;
  try {
    const quoteData = await cachedJson(`stock-quote:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(quoteUrl.toString(), { service: "Twelve Data Quote" }), ctx);
    if (!isProviderError(quoteData.json)) {
      quoteJson = quoteData.json;
      quoteCached = quoteData.cached;
      quoteStale = quoteData.stale || false;
    }
  } catch (_) {
    quoteJson = null;
  }

  const sourcePrice = firstNumber(priceData.json?.price, quoteJson?.close, quoteJson?.price, quoteJson?.previous_close);
  if (!Number.isFinite(sourcePrice)) throw new Error(`Stock price not found: ${symbol}`);

  const sourceCurrency = upper(quoteJson?.currency || inferStockCurrency(symbol) || "USD");
  const fx = await getFxRate(sourceCurrency, targetCurrency, ctx);
  return { price: round(sourcePrice * fx.rate), sourcePrice: round(sourcePrice), sourceCurrency, provider: "Twelve Data/price + " + fx.provider, cached: Boolean(priceData.cached || quoteCached), stale: Boolean(priceData.stale || quoteStale || fx.stale), updatedAt: quoteJson?.datetime || quoteJson?.timestamp || priceData.updatedAt, rawSummary: { name: quoteJson?.name || priceData.json?.symbol || symbol, exchange: quoteJson?.exchange, currency: quoteJson?.currency || sourceCurrency, close: quoteJson?.close, previousClose: quoteJson?.previous_close, percentChange: quoteJson?.percent_change } };
}

function inferStockCurrency(symbol) {
  // Twelve Data /price 不返回 currency。没有 quote 信息时，常见美股/ETF按 USD 处理。
  if (/^[A-Z.]{1,8}$/.test(symbol)) return "USD";
  return "USD";
}

async function getMetalPrice(symbol, unit, targetCurrency, ctx) {
  const allowed = ["XAU", "XAG", "XPT", "XPD"];
  if (!allowed.includes(symbol)) throw new Error(`Unsupported metal symbol: ${symbol}. Use XAU/XAG/XPT/XPD.`);

  const apiUrl = `https://api.gold-api.com/price/${encodeURIComponent(symbol)}`;
  const data = await cachedJson(`metal:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(apiUrl, { service: "Gold API" }), ctx);
  const raw = data.json || {};
  const pricePerTroyOunceUsd = firstNumber(raw.price, raw.price_oz, raw.priceTroyOz, raw.price_troy_oz, raw.usd);
  const normalizedUnit = normalizeMetalUnit(unit);
  let sourceUnitPriceUsd;
  if (normalizedUnit === "gram") {
    const directGramPrice = firstNumber(raw.priceGram, raw.price_gram, raw.price_per_gram, raw.price_gram_24k);
    sourceUnitPriceUsd = Number.isFinite(directGramPrice) ? directGramPrice : pricePerTroyOunceUsd / TROY_OUNCE_GRAMS;
  } else {
    sourceUnitPriceUsd = pricePerTroyOunceUsd;
  }
  if (!Number.isFinite(sourceUnitPriceUsd)) throw new Error(`Metal price not found: ${symbol}`);
  const fx = await getFxRate("USD", targetCurrency, ctx);
  return { unit: normalizedUnit, price: round(sourceUnitPriceUsd * fx.rate), sourcePricePerTroyOunceUsd: Number.isFinite(pricePerTroyOunceUsd) ? round(pricePerTroyOunceUsd) : undefined, provider: "Gold API + " + fx.provider, cached: data.cached || fx.cached, stale: Boolean(data.stale || fx.stale), updatedAt: raw.updatedAt || raw.updated_at || raw.timestamp || data.updatedAt };
}

async function getCryptoPrices(ids, targetCurrency, ctx) {
  const uniqueIds = [...new Set(ids.map(normalizeCryptoId).filter(Boolean))];
  if (!uniqueIds.length) throw new Error("No crypto ids supplied");
  const vs = normalizeCoinGeckoVsCurrency(targetCurrency);
  const cgUrl = new URL("https://api.coingecko.com/api/v3/simple/price");
  cgUrl.searchParams.set("ids", uniqueIds.join(","));
  cgUrl.searchParams.set("vs_currencies", vs);
  cgUrl.searchParams.set("include_last_updated_at", "true");

  const data = await cachedJson(`crypto:${uniqueIds.join(",")}:${vs}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(cgUrl.toString(), { service: "CoinGecko Price", timeoutMs: 8000 }), ctx);
  if (!data.json || typeof data.json !== "object" || Array.isArray(data.json)) {
    throw new Error("CoinGecko returned invalid price payload");
  }

  const items = uniqueIds.map((id) => {
    const row = data.json?.[id] || {};
    let priceInVs = firstNumber(row[vs]);
    // USDT/USDC 等稳定币兜底，避免 CoinGecko 抽风时导致稳定币金额直接归零。
    if (!Number.isFinite(priceInVs)) priceInVs = stableCoinFallbackPrice(id, targetCurrency);
    const lastUpdated = row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : data.updatedAt;
    return { id, quote: targetCurrency, price: round(priceInVs), updatedAt: lastUpdated };
  });
  return { items, cached: data.cached, stale: data.stale || false, updatedAt: data.updatedAt, provider: data.stale ? "CoinGecko stale cache" : "CoinGecko" };
}

async function buildCryptoFallbackItems(ids, targetCurrency, ctx, cause) {
  const uniqueIds = [...new Set(ids.map(normalizeCryptoId).filter(Boolean))];
  const updatedAt = new Date().toISOString();
  const items = [];

  for (const id of uniqueIds) {
    let price = stableCoinFallbackPrice(id, targetCurrency);
    // 如果是 USDT/USDC → 非 USD/CNY 等，尽量用 Frankfurter 的 USD 汇率兜底。
    if (!Number.isFinite(price) && isStableCoinId(id)) {
      try {
        const fx = await getFxRate("USD", targetCurrency, ctx);
        price = fx.rate;
      } catch (_) {}
    }
    items.push({ id, quote: targetCurrency, price: round(price), updatedAt, warning: Number.isFinite(price) ? "stablecoin fallback" : cleanErrorMessage(cause) });
  }

  return { items, cached: false, provider: "crypto fallback", updatedAt };
}

function isStableCoinId(id) {
  return ["tether", "usd-coin", "usdt", "usdc"].includes(String(id || "").toLowerCase());
}

function stableCoinFallbackPrice(id, targetCurrency) {
  if (!isStableCoinId(id)) return NaN;
  const quote = upper(targetCurrency);
  if (quote === "USD" || quote === "USDT" || quote === "USDC") return 1;
  return NaN;
}

async function getFxRate(base, quote, ctx) {
  base = upper(base);
  quote = upper(quote);
  if (base === quote) return { rate: 1, provider: "identity", cached: true, stale: false, updatedAt: new Date().toISOString() };

  if (base === "USDT") {
    if (quote === "USD") return { rate: 1, provider: "USDT≈USD fallback", cached: true, stale: false, updatedAt: new Date().toISOString() };
    try {
      const usdtInQuote = await getCryptoPrices(["tether"], quote, ctx);
      const rate = firstNumber(usdtInQuote.items?.[0]?.price);
      if (Number.isFinite(rate)) return { rate, provider: "CoinGecko/tether", cached: usdtInQuote.cached, stale: usdtInQuote.stale || false, updatedAt: usdtInQuote.updatedAt };
    } catch (_) {}
    const usdFx = await getFxRate("USD", quote, ctx);
    return { rate: usdFx.rate, provider: "USDT≈USD + " + usdFx.provider, cached: usdFx.cached, stale: usdFx.stale || false, updatedAt: usdFx.updatedAt };
  }

  if (quote === "USDT") {
    const baseToUsd = await getFxRate(base, "USD", ctx);
    const usdtUsd = await getFxRate("USDT", "USD", ctx);
    return { rate: baseToUsd.rate / usdtUsd.rate, provider: `${baseToUsd.provider} + ${usdtUsd.provider}`, cached: baseToUsd.cached && usdtUsd.cached, stale: Boolean(baseToUsd.stale || usdtUsd.stale), updatedAt: new Date().toISOString() };
  }

  const fxUrl = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
  const data = await cachedJson(`fx:${base}:${quote}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(fxUrl, { service: "Frankfurter" }), ctx);
  const rate = firstNumber(data.json?.rate);
  if (!Number.isFinite(rate)) throw new Error(`FX rate not found: ${base}/${quote}`);
  return { rate, provider: "Frankfurter", cached: data.cached, stale: data.stale || false, updatedAt: data.json?.date || data.updatedAt };
}

async function cachedJson(cacheKey, ttlSeconds, fetcher, ctx) {
  const now = Date.now();
  const cacheUrl = `https://asset-quote-cache.local/${encodeURIComponent(cacheKey)}`;
  const cacheRequest = new Request(cacheUrl, { method: "GET" });
  let cachedPayload = null;

  try {
    if (typeof caches !== "undefined" && caches.default) {
      const cached = await caches.default.match(cacheRequest);
      if (cached) cachedPayload = await cached.json().catch(() => null);
      if (cachedPayload?.json && Number(cachedPayload.expiresAt || 0) > now) return { ...cachedPayload, cached: true, stale: false };
    }
  } catch (_) {}

  try {
    const json = await fetcher();
    const payload = { json, updatedAt: new Date().toISOString(), expiresAt: now + ttlSeconds * 1000, cached: false, stale: false };
    try {
      if (typeof caches !== "undefined" && caches.default && ctx?.waitUntil) {
        const response = new Response(JSON.stringify(payload), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${STALE_CACHE_SECONDS}` } });
        ctx.waitUntil(caches.default.put(cacheRequest, response.clone()).catch(() => undefined));
      }
    } catch (_) {}
    return payload;
  } catch (error) {
    if (cachedPayload?.json) return { ...cachedPayload, cached: true, stale: true, staleReason: cleanErrorMessage(error) };
    throw error;
  }
}

async function fetchJson(url, { service = "upstream", timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch (_) { throw new Error(`${service} returned non-JSON response: HTTP ${res.status}`); }
    if (!res.ok) {
      const message = json?.message || json?.error || json?.error_message || JSON.stringify(json).slice(0, 240);
      const err = new Error(`${service} HTTP ${res.status}: ${message}`);
      err.status = res.status >= 500 ? 502 : 400;
      throw err;
    }
    return json;
  } catch (error) {
    if (error?.name === "AbortError" || String(error?.message || error).includes("abort")) {
      const err = new Error(`${service} request timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isProviderError(json) {
  return Boolean(json?.status === "error" || json?.code || json?.message?.toLowerCase?.().includes("error"));
}

function normalizeCryptoId(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const upperRaw = raw.toUpperCase();
  return COMMON_CRYPTO_ID_MAP[upperRaw] || raw.toLowerCase();
}

function normalizeCoinGeckoVsCurrency(currency) {
  const c = String(currency || "USD").toLowerCase();
  return c === "usdt" ? "usd" : c;
}

function normalizeMetalUnit(unit) {
  const u = String(unit || "gram").toLowerCase();
  if (["g", "gram", "grams", "克"].includes(u)) return "gram";
  if (["oz", "ounce", "troy_ounce", "troy-ounce", "盎司", "金衡盎司"].includes(u)) return "troy_ounce";
  throw badRequest(`Unsupported metal unit: ${unit}. Use gram/g or troy_ounce/oz.`);
}

async function allSettledMapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try { results[index] = { status: "fulfilled", value: await mapper(items[index], index) }; }
      catch (error) { results[index] = { status: "rejected", reason: error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function failedItem(item, error) {
  return { id: item?.id || null, name: item?.name || null, symbol: item?.symbol || item?.code || null, type: item?.type || null, error: cleanErrorMessage(error) };
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}
function toNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clampInt(value, min, max, fallback) { const n = Math.floor(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function upper(value) { return String(value || "").trim().toUpperCase(); }
function round(value, digits = 8) { const n = Number(value); if (!Number.isFinite(n)) return null; const factor = 10 ** digits; return Math.round(n * factor) / factor; }
function sum(values) { return values.reduce((acc, value) => acc + (Number(value) || 0), 0); }
function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function cleanErrorMessage(error) { return String(error?.message || error || "Unknown error").replace(/apikey=[^&\s]+/gi, "apikey=***").slice(0, 500); }
function toErrorPayload(error) { return { ok: false, error: cleanErrorMessage(error), code: error?.status === 400 ? "BAD_REQUEST" : error?.status === 401 ? "UNAUTHORIZED" : error?.status === 504 ? "UPSTREAM_TIMEOUT" : "INTERNAL_ERROR", version: VERSION }; }
function safeEqual(a, b) { a = String(a || ""); b = String(b || ""); return a.length === b.length && a === b; }

function jsonResponse(data, status = 200) {
  const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
  let body;
  try {
    body = JSON.stringify(data, null, 2);
  } catch (error) {
    body = JSON.stringify({ ok: false, error: "Failed to serialize response", detail: cleanErrorMessage(error), version: VERSION });
  }
  return withCors(new Response(body, { status: safeStatus, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }));
}
function htmlResponse(html, status = 200) { return withCors(new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } })); }
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-api-token,authorization");
  headers.set("access-control-max-age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function renderDocs(origin) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ledger Quote API</title><style>:root{--bg:#f6f7fb;--card:#fff;--text:#101828;--muted:#667085;--line:#e6e9f2;--primary:#5367a7;--soft:#eef2ff;--danger:#c2410c}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8faff 0%,var(--bg) 45%,#fff 100%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",Arial,sans-serif;color:var(--text);line-height:1.65}main{max-width:1080px;margin:0 auto;padding:34px 18px 80px}.hero{padding:28px;border-radius:28px;background:radial-gradient(circle at 0 0,#eaf0ff,#fff 50%);border:1px solid var(--line);box-shadow:0 20px 60px rgba(28,45,89,.08)}h1{margin:0 0 8px;font-size:34px;letter-spacing:-.8px}h2{margin:34px 0 12px;font-size:22px}h3{margin:18px 0 8px}.muted,p,li{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 16px 45px rgba(28,45,89,.06);margin:14px 0}.tag{display:inline-block;background:var(--soft);color:var(--primary);font-weight:700;border-radius:999px;padding:5px 11px;margin:4px 4px 0 0;font-size:13px}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}pre{white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e5edff;border-radius:16px;padding:14px;overflow:auto}table{width:100%;border-collapse:collapse;border-radius:16px;overflow:hidden}th,td{border:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f1f4fb}input,button{font:inherit}input{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff}button{border:0;border-radius:14px;padding:12px 16px;background:var(--primary);color:#fff;font-weight:800;cursor:pointer}.danger{color:var(--danger)}.ok{color:#16794c}.result{min-height:96px}</style></head><body><main><section class="hero"><h1>Ledger Quote API</h1><p>个人记账 App 使用的行情聚合 API。资产和借款仍然保存在 App 本地，这个 API 只负责汇率、股票、ETF、黄金白银、虚拟币估值。</p><span class="tag">Cloudflare Pages Functions</span><span class="tag">v${VERSION}</span><span class="tag">Twelve Data</span><span class="tag">CoinGecko</span><span class="tag">Frankfurter</span><span class="tag">Gold API</span></section><section class="card"><h2>在线测试</h2><p>如果设置了 APP_API_TOKEN，输入 Token 后测试。</p><div class="grid"><div><label>API Token</label><input id="token" placeholder="填写你的 APP_API_TOKEN"/></div><div><label>测试接口</label><input id="path" value="/api/health"/></div></div><p><button onclick="testApi()">测试接口</button></p><pre id="result" class="result">等待测试...</pre></section><section class="card"><h2>接口列表</h2><table><tr><th>功能</th><th>方法</th><th>路径</th></tr><tr><td>健康检查</td><td>GET</td><td><code>/api/health</code></td></tr><tr><td>环境检查</td><td>GET</td><td><code>/api/debug/env</code></td></tr><tr><td>自检</td><td>GET</td><td><code>/api/debug/self-test</code></td></tr><tr><td>汇率</td><td>GET</td><td><code>/api/fx?base=USD&amp;quote=CNY&amp;amount=700</code></td></tr><tr><td>虚拟币</td><td>GET</td><td><code>/api/crypto?ids=solana,bitcoin,tether&amp;quote=CNY</code></td></tr><tr><td>黄金白银</td><td>GET</td><td><code>/api/metal?symbol=XAU&amp;unit=gram&amp;quote=CNY</code></td></tr><tr><td>股票 / ETF</td><td>GET</td><td><code>/api/stock?symbol=AAPL&amp;quote=CNY</code></td></tr><tr><td>搜索提示</td><td>GET</td><td><code>/api/search?type=stock&amp;q=apple</code></td></tr><tr><td>资产组合估值</td><td>POST</td><td><code>/api/portfolio/valuate</code></td></tr></table></section><section class="card"><h2>Flutter 主要调用</h2><pre>POST ${origin}/api/portfolio/valuate
Header: content-type: application/json, x-api-token: 你的 APP_API_TOKEN
Body: { "defaultCurrency":"CNY", "assets":[...], "liabilities":[...] }</pre></section></main><script>async function testApi(){const token=document.getElementById('token').value.trim();const path=document.getElementById('path').value.trim()||'/api/health';const result=document.getElementById('result');result.textContent='请求中...';try{const res=await fetch(path.startsWith('/')?path:'/'+path,{headers:token?{'x-api-token':token}:{}});const text=await res.text();try{result.textContent=JSON.stringify(JSON.parse(text),null,2)}catch(_){result.textContent=text}result.className=res.ok?'result ok':'result danger'}catch(e){result.textContent=String(e);result.className='result danger'}}</script></body></html>`;
}
