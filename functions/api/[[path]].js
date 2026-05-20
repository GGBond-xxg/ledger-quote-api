const VERSION = "1.3.0-pages-stock-fix";
const DEFAULT_CACHE_TTL_SECONDS = 15 * 60;
const TROY_OUNCE_GRAMS = 31.1034768;

const SUPPORTED_DEFAULT_CURRENCIES = ["CNY", "USD", "HKD", "SGD", "EUR", "JPY", "USDT"];

const COMMON_CRYPTO_ID_MAP = {
  BTC: "bitcoin",
  XBT: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  TRX: "tron",
  TON: "the-open-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  SUI: "sui",
  HYPE: "hyperliquid",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  LINK: "chainlink",
  UNI: "uniswap",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
};

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
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
        return jsonResponse({ ok: false, error: auth.error }, 401);
      }

      if (url.pathname === "/api/health") {
        return jsonResponse({ ok: true, version: VERSION, time: new Date().toISOString() });
      }

      if (url.pathname === "/api/config") {
        return jsonResponse({
          ok: true,
          version: VERSION,
          cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
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


      if (url.pathname === "/api/fx") {
        return handleFx(url, env, ctx);
      }

      if (url.pathname === "/api/convert") {
        return handleConvert(url, env, ctx);
      }

      if (url.pathname === "/api/crypto") {
        return handleCrypto(url, env, ctx);
      }

      if (url.pathname === "/api/metal") {
        return handleMetal(url, env, ctx);
      }

      if (url.pathname === "/api/stock") {
        return handleStock(url, env, ctx);
      }

      if (url.pathname === "/api/search") {
        return handleSearch(url, env, ctx);
      }

      if (url.pathname === "/api/portfolio/valuate" && request.method === "POST") {
        return handlePortfolioValuation(request, env, ctx);
      }

      return jsonResponse({ ok: false, error: "Unknown API endpoint" }, 404);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}

function checkAuth(request, url, env) {
  const requiredToken = (env.APP_API_TOKEN || "").trim();
  if (!requiredToken) return { ok: true };

  const headerToken = request.headers.get("x-api-token") || "";
  const queryToken = url.searchParams.get("token") || "";

  if (headerToken === requiredToken || queryToken === requiredToken) {
    return { ok: true };
  }

  return { ok: false, error: "Unauthorized. Missing or invalid x-api-token." };
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
    updatedAt: fx.updatedAt,
  });
}

async function handleCrypto(url, env, ctx) {
  const idsInput = url.searchParams.get("ids") || url.searchParams.get("symbols") || "bitcoin";
  const quote = upper(url.searchParams.get("quote") || "CNY");
  const ids = idsInput
    .split(",")
    .map((v) => normalizeCryptoId(v.trim()))
    .filter(Boolean);

  if (!ids.length) throw new Error("ids is required, e.g. /api/crypto?ids=solana,bitcoin&quote=CNY");

  const result = await getCryptoPrices(ids, quote, ctx);
  return jsonResponse({
    ok: true,
    quote,
    provider: "CoinGecko",
    items: result.items,
    cached: result.cached,
    updatedAt: result.updatedAt,
  });
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
    updatedAt: stock.updatedAt,
    raw: stock.rawSummary,
  });
}


async function handleSearch(url, env, ctx) {
  const type = String(url.searchParams.get("type") || "stock").toLowerCase();
  const q = String(url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
  const limit = Math.min(Math.max(toNumber(url.searchParams.get("limit") || "10", 10), 1), 30);

  if (["stock", "etf"].includes(type)) {
    const items = await searchTwelveDataSymbols({ type, query: q, limit, env, ctx });
    return jsonResponse({ ok: true, type, query: q, provider: "Twelve Data", items });
  }

  if (type === "crypto") {
    const items = await searchCoinGeckoCoins({ query: q, limit, ctx });
    return jsonResponse({ ok: true, type, query: q, provider: q ? "CoinGecko Search" : "CoinGecko Markets", items });
  }

  if (type === "metal") {
    const metals = [
      { assetType: "metal", name: "黄金", symbol: "XAU", displayCode: "XAU", quoteCurrency: "USD", unit: "gram", provider: "local" },
      { assetType: "metal", name: "白银", symbol: "XAG", displayCode: "XAG", quoteCurrency: "USD", unit: "gram", provider: "local" },
      { assetType: "metal", name: "铂金", symbol: "XPT", displayCode: "XPT", quoteCurrency: "USD", unit: "gram", provider: "local" },
      { assetType: "metal", name: "钯金", symbol: "XPD", displayCode: "XPD", quoteCurrency: "USD", unit: "gram", provider: "local" },
    ].filter((m) => !q || [m.name, m.symbol, m.displayCode].some((v) => v.toLowerCase().includes(q.toLowerCase()))).slice(0, limit);
    return jsonResponse({ ok: true, type, query: q, provider: "local", items: metals });
  }

  return jsonResponse({ ok: false, error: "Unsupported search type. Use stock/etf/crypto/metal." }, 400);
}

async function searchTwelveDataSymbols({ type, query, limit, env, ctx }) {
  if (!env.TWELVE_DATA_API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY is not configured");
  }

  const q = query.trim();
  if (!q) return [];

  const tdUrl = new URL("https://api.twelvedata.com/symbol_search");
  tdUrl.searchParams.set("symbol", q);
  tdUrl.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);

  const cacheKey = `search:td:${type}:${q.toLowerCase()}`;
  const data = await cachedJson(cacheKey, 24 * 60 * 60, () => fetchJson(tdUrl.toString()), ctx);

  if (data.json?.status === "error" || data.json?.code) {
    throw new Error(data.json?.message || `Twelve Data search error for ${q}`);
  }

  const rows = Array.isArray(data.json?.data) ? data.json.data : [];
  return rows
    .map((row) => normalizeTwelveSearchRow(row, type))
    .filter(Boolean)
    .filter((item) => {
      if (type === "etf") return item.assetType === "etf";
      if (type === "stock") return item.assetType === "stock";
      return true;
    })
    .slice(0, limit);
}

function normalizeTwelveSearchRow(row, requestedType) {
  const symbol = upper(row?.symbol || row?.ticker || "");
  if (!symbol) return null;

  const instrumentType = String(row?.instrument_type || row?.type || "").toLowerCase();
  const name = String(row?.instrument_name || row?.name || symbol).trim();
  const exchange = String(row?.exchange || row?.mic_code || "").trim();
  const currency = upper(row?.currency || "USD");
  const isEtf = instrumentType.includes("etf") || name.toLowerCase().includes(" etf") || requestedType === "etf";

  return {
    assetType: isEtf ? "etf" : "stock",
    name,
    symbol,
    displayCode: symbol,
    quoteCurrency: currency || "USD",
    unit: "",
    exchange,
    provider: "Twelve Data",
    subtitle: [exchange, currency, row?.country].filter(Boolean).join(" · "),
  };
}

async function searchCoinGeckoCoins({ query, limit, ctx }) {
  const q = query.trim();

  if (!q) {
    const marketUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
    marketUrl.searchParams.set("vs_currency", "usd");
    marketUrl.searchParams.set("order", "market_cap_desc");
    marketUrl.searchParams.set("per_page", String(Math.max(limit, 20)));
    marketUrl.searchParams.set("page", "1");
    marketUrl.searchParams.set("sparkline", "false");
    const data = await cachedJson("search:cg:top", 60 * 60, () => fetchJson(marketUrl.toString()), ctx);
    const rows = Array.isArray(data.json) ? data.json : [];
    return rows.slice(0, limit).map((row) => ({
      assetType: "crypto",
      name: row.name || row.id,
      symbol: row.id,
      displayCode: upper(row.symbol || row.id),
      quoteCurrency: "USD",
      unit: "",
      provider: "CoinGecko Markets",
      subtitle: row.market_cap_rank ? `Rank #${row.market_cap_rank}` : "",
    }));
  }

  const searchUrl = new URL("https://api.coingecko.com/api/v3/search");
  searchUrl.searchParams.set("query", q);
  const data = await cachedJson(`search:cg:${q.toLowerCase()}`, 60 * 60, () => fetchJson(searchUrl.toString()), ctx);
  const rows = Array.isArray(data.json?.coins) ? data.json.coins : [];
  return rows.slice(0, limit).map((row) => ({
    assetType: "crypto",
    name: row.name || row.id,
    symbol: row.id,
    displayCode: upper(row.symbol || row.id),
    quoteCurrency: "USD",
    unit: "",
    provider: "CoinGecko Search",
    subtitle: row.market_cap_rank ? `Rank #${row.market_cap_rank}` : "",
  }));
}

async function handlePortfolioValuation(request, env, ctx) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const defaultCurrency = upper(body.defaultCurrency || body.currency || "CNY");
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const liabilities = Array.isArray(body.liabilities) ? body.liabilities : [];

  const valuedAssets = [];
  const failedAssets = [];

  for (const asset of assets) {
    try {
      valuedAssets.push(await valuateAsset(asset, defaultCurrency, env, ctx));
    } catch (error) {
      failedAssets.push({
        id: asset?.id || null,
        name: asset?.name || null,
        symbol: asset?.symbol || null,
        type: asset?.type || null,
        error: error?.message || String(error),
      });
    }
  }

  const valuedLiabilities = [];
  const failedLiabilities = [];

  for (const item of liabilities) {
    try {
      valuedLiabilities.push(await valuateLiability(item, defaultCurrency, ctx));
    } catch (error) {
      failedLiabilities.push({
        id: item?.id || null,
        name: item?.name || null,
        error: error?.message || String(error),
      });
    }
  }

  const assetTotal = sum(valuedAssets.map((a) => a.value));
  const receivableTotal = sum(valuedLiabilities.filter((i) => i.direction === "receivable").map((i) => i.value));
  const payableTotal = sum(valuedLiabilities.filter((i) => i.direction === "payable").map((i) => i.value));
  const netWorth = round(assetTotal + receivableTotal - payableTotal);

  return jsonResponse({
    ok: true,
    defaultCurrency,
    totals: {
      assetTotal: round(assetTotal),
      receivableTotal: round(receivableTotal),
      payableTotal: round(payableTotal),
      netWorth,
    },
    assets: valuedAssets,
    liabilities: valuedLiabilities,
    failedAssets,
    failedLiabilities,
    updatedAt: new Date().toISOString(),
  });
}

async function valuateAsset(asset, defaultCurrency, env, ctx) {
  const type = String(asset?.type || "manual").toLowerCase();
  const quantity = toNumber(asset?.quantity ?? asset?.amount ?? 0, 0);
  const id = asset?.id || null;
  const name = asset?.name || asset?.displayName || asset?.symbol || "Unnamed Asset";

  if (quantity === 0) {
    return baseAssetResult(asset, { id, name, type, quantity, price: 0, sourceCurrency: defaultCurrency, value: 0, provider: "none" });
  }

  if (type === "cash") {
    const sourceCurrency = upper(asset?.currency || asset?.quoteCurrency || defaultCurrency);
    const fx = await getFxRate(sourceCurrency, defaultCurrency, ctx);
    return baseAssetResult(asset, {
      id,
      name,
      type,
      quantity,
      price: round(fx.rate),
      sourceCurrency,
      value: round(quantity * fx.rate),
      provider: fx.provider,
      updatedAt: fx.updatedAt,
    });
  }

  if (type === "manual") {
    const sourceCurrency = upper(asset?.currency || asset?.quoteCurrency || defaultCurrency);
    const manualPrice = toNumber(asset?.manualPrice ?? asset?.unitPrice ?? asset?.price ?? 0, 0);
    const fx = await getFxRate(sourceCurrency, defaultCurrency, ctx);
    return baseAssetResult(asset, {
      id,
      name,
      type,
      quantity,
      price: round(manualPrice * fx.rate),
      sourcePrice: manualPrice,
      sourceCurrency,
      value: round(quantity * manualPrice * fx.rate),
      provider: "manual + " + fx.provider,
      updatedAt: fx.updatedAt,
    });
  }

  if (type === "crypto") {
    const cryptoId = normalizeCryptoId(asset?.coinId || asset?.symbol || asset?.code || name);
    const prices = await getCryptoPrices([cryptoId], defaultCurrency, ctx);
    const item = prices.items[0];
    if (!item || typeof item.price !== "number") throw new Error(`Crypto price not found: ${cryptoId}`);
    return baseAssetResult(asset, {
      id,
      name,
      type,
      symbol: cryptoId,
      quantity,
      price: item.price,
      sourceCurrency: defaultCurrency,
      value: round(quantity * item.price),
      provider: "CoinGecko",
      updatedAt: item.updatedAt || prices.updatedAt,
    });
  }

  if (type === "metal") {
    const symbol = upper(asset?.symbol || asset?.code || "XAU");
    const unit = String(asset?.unit || "gram").toLowerCase();
    const metal = await getMetalPrice(symbol, unit, defaultCurrency, ctx);
    return baseAssetResult(asset, {
      id,
      name,
      type,
      symbol,
      unit: metal.unit,
      quantity,
      price: metal.price,
      sourceCurrency: defaultCurrency,
      value: round(quantity * metal.price),
      provider: metal.provider,
      updatedAt: metal.updatedAt,
    });
  }

  if (type === "stock" || type === "etf") {
    const symbol = upper(asset?.symbol || asset?.code || "");
    if (!symbol) throw new Error("Stock symbol is required");
    const stock = await getStockPrice(symbol, defaultCurrency, env, ctx);
    return baseAssetResult(asset, {
      id,
      name,
      type,
      symbol,
      quantity,
      price: stock.price,
      sourcePrice: stock.sourcePrice,
      sourceCurrency: stock.sourceCurrency,
      value: round(quantity * stock.price),
      provider: stock.provider,
      updatedAt: stock.updatedAt,
    });
  }

  throw new Error(`Unsupported asset type: ${type}`);
}

function baseAssetResult(input, result) {
  return {
    id: result.id,
    name: result.name,
    type: result.type,
    symbol: result.symbol || input?.symbol || input?.code || null,
    unit: result.unit || input?.unit || null,
    quantity: result.quantity,
    price: round(result.price),
    sourcePrice: result.sourcePrice !== undefined ? round(result.sourcePrice) : undefined,
    sourceCurrency: result.sourceCurrency,
    value: round(result.value),
    provider: result.provider,
    updatedAt: result.updatedAt || new Date().toISOString(),
  };
}

async function valuateLiability(item, defaultCurrency, ctx) {
  const amount = toNumber(item?.amount ?? 0, 0);
  const currency = upper(item?.currency || defaultCurrency);
  const directionRaw = String(item?.direction || item?.type || "payable").toLowerCase();
  const direction = ["receivable", "asset", "lend", "owed_to_me", "别人欠我"].includes(directionRaw)
    ? "receivable"
    : "payable";
  const fx = await getFxRate(currency, defaultCurrency, ctx);

  return {
    id: item?.id || null,
    name: item?.name || (direction === "payable" ? "我欠别人" : "别人欠我"),
    direction,
    amount,
    currency,
    value: round(amount * fx.rate),
    provider: fx.provider,
    updatedAt: fx.updatedAt,
  };
}

async function getStockPrice(symbol, targetCurrency, env, ctx) {
  const apiKey = (env.TWELVE_DATA_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured in Cloudflare environment variables.");
  }

  // Twelve Data 的 /price 接口更轻量，适合 App 估值；/quote 作为补充信息兜底。
  // 这样即使 quote 端点临时返回缺少 close 字段，也能拿到 price。
  const priceUrl = new URL("https://api.twelvedata.com/price");
  priceUrl.searchParams.set("symbol", symbol);
  priceUrl.searchParams.set("apikey", apiKey);

  const quoteUrl = new URL("https://api.twelvedata.com/quote");
  quoteUrl.searchParams.set("symbol", symbol);
  quoteUrl.searchParams.set("apikey", apiKey);

  const priceData = await cachedJson(`stock-price:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(priceUrl.toString()), ctx);

  if (priceData.json?.status === "error" || priceData.json?.code) {
    throw new Error(priceData.json?.message || `Twelve Data price error for ${symbol}`);
  }

  let quoteJson = null;
  try {
    const quoteData = await cachedJson(`stock-quote:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(quoteUrl.toString()), ctx);
    if (!(quoteData.json?.status === "error" || quoteData.json?.code)) {
      quoteJson = quoteData.json;
    }
  } catch (_) {
    // quote 只是补充信息，不能因为 quote 失败影响主价格返回。
    quoteJson = null;
  }

  const sourcePrice = firstNumber(
    priceData.json?.price,
    quoteJson?.close,
    quoteJson?.price,
    quoteJson?.previous_close,
  );

  if (!Number.isFinite(sourcePrice)) {
    throw new Error(`Stock price not found: ${symbol}`);
  }

  const sourceCurrency = upper(quoteJson?.currency || "USD");
  const fx = await getFxRate(sourceCurrency, targetCurrency, ctx);

  return {
    price: round(sourcePrice * fx.rate),
    sourcePrice: round(sourcePrice),
    sourceCurrency,
    provider: "Twelve Data/price + " + fx.provider,
    cached: priceData.cached,
    updatedAt: quoteJson?.datetime || quoteJson?.timestamp || priceData.updatedAt,
    rawSummary: {
      name: quoteJson?.name || priceData.json?.symbol || symbol,
      exchange: quoteJson?.exchange,
      currency: quoteJson?.currency || sourceCurrency,
      close: quoteJson?.close,
      previousClose: quoteJson?.previous_close,
      percentChange: quoteJson?.percent_change,
    },
  };
}

async function getMetalPrice(symbol, unit, targetCurrency, ctx) {
  const allowed = ["XAU", "XAG", "XPT", "XPD"];
  if (!allowed.includes(symbol)) {
    throw new Error(`Unsupported metal symbol: ${symbol}. Use XAU/XAG/XPT/XPD.`);
  }

  const apiUrl = `https://api.gold-api.com/price/${encodeURIComponent(symbol)}`;
  const data = await cachedJson(`metal:${symbol}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(apiUrl), ctx);
  const raw = data.json || {};

  // Gold API 通常返回 USD / troy ounce 的 price；这里做容错，兼容不同字段名。
  let pricePerTroyOunceUsd = firstNumber(
    raw.price,
    raw.price_oz,
    raw.priceTroyOz,
    raw.price_troy_oz,
    raw.usd,
  );

  const normalizedUnit = normalizeMetalUnit(unit);
  let sourceUnitPriceUsd;

  if (normalizedUnit === "gram") {
    const directGramPrice = firstNumber(raw.priceGram, raw.price_gram, raw.price_per_gram, raw.price_gram_24k);
    sourceUnitPriceUsd = Number.isFinite(directGramPrice)
      ? directGramPrice
      : pricePerTroyOunceUsd / TROY_OUNCE_GRAMS;
  } else {
    sourceUnitPriceUsd = pricePerTroyOunceUsd;
  }

  if (!Number.isFinite(sourceUnitPriceUsd)) {
    throw new Error(`Metal price not found: ${symbol}`);
  }

  const fx = await getFxRate("USD", targetCurrency, ctx);

  return {
    unit: normalizedUnit,
    price: round(sourceUnitPriceUsd * fx.rate),
    sourcePricePerTroyOunceUsd: Number.isFinite(pricePerTroyOunceUsd) ? round(pricePerTroyOunceUsd) : undefined,
    provider: "Gold API + " + fx.provider,
    cached: data.cached,
    updatedAt: raw.updatedAt || raw.updated_at || raw.timestamp || data.updatedAt,
  };
}

async function getCryptoPrices(ids, targetCurrency, ctx) {
  const uniqueIds = [...new Set(ids.map(normalizeCryptoId).filter(Boolean))];
  const vs = normalizeCoinGeckoVsCurrency(targetCurrency);

  const cgUrl = new URL("https://api.coingecko.com/api/v3/simple/price");
  cgUrl.searchParams.set("ids", uniqueIds.join(","));
  cgUrl.searchParams.set("vs_currencies", vs);
  cgUrl.searchParams.set("include_last_updated_at", "true");

  const data = await cachedJson(`crypto:${uniqueIds.join(",")}:${vs}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(cgUrl.toString()), ctx);

  const items = uniqueIds.map((id) => {
    const row = data.json?.[id] || {};
    const priceInVs = firstNumber(row[vs]);
    const lastUpdated = row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : data.updatedAt;

    return {
      id,
      quote: targetCurrency,
      price: round(priceInVs),
      updatedAt: lastUpdated,
    };
  });

  // 如果用户目标币是 USDT，CoinGecko 查 USD，基本等同 USDT；这里返回 quote 仍然写 USDT。
  return {
    items,
    cached: data.cached,
    updatedAt: data.updatedAt,
  };
}

async function getFxRate(base, quote, ctx) {
  base = upper(base);
  quote = upper(quote);

  if (base === quote) {
    return { rate: 1, provider: "identity", cached: true, updatedAt: new Date().toISOString() };
  }

  // USDT 特殊处理：个人记账场景下，大部分时候可以近似当 USD；这里用 CoinGecko 的 tether 价格提高准确性。
  if (base === "USDT") {
    if (quote === "USD") {
      const usdt = await getCryptoPrices(["tether"], "USD", ctx);
      return { rate: usdt.items[0].price, provider: "CoinGecko/tether", cached: usdt.cached, updatedAt: usdt.updatedAt };
    }
    const usdtInQuote = await getCryptoPrices(["tether"], quote, ctx);
    return { rate: usdtInQuote.items[0].price, provider: "CoinGecko/tether", cached: usdtInQuote.cached, updatedAt: usdtInQuote.updatedAt };
  }

  if (quote === "USDT") {
    const baseToUsd = await getFxRate(base, "USD", ctx);
    const usdtUsd = await getFxRate("USDT", "USD", ctx);
    return {
      rate: baseToUsd.rate / usdtUsd.rate,
      provider: `${baseToUsd.provider} + ${usdtUsd.provider}`,
      cached: baseToUsd.cached && usdtUsd.cached,
      updatedAt: new Date().toISOString(),
    };
  }

  const fxUrl = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
  const data = await cachedJson(`fx:${base}:${quote}`, DEFAULT_CACHE_TTL_SECONDS, () => fetchJson(fxUrl), ctx);
  const rate = firstNumber(data.json?.rate);

  if (!Number.isFinite(rate)) {
    throw new Error(`FX rate not found: ${base}/${quote}`);
  }

  return {
    rate,
    provider: "Frankfurter",
    cached: data.cached,
    updatedAt: data.json?.date || data.updatedAt,
  };
}

async function cachedJson(cacheKey, ttlSeconds, fetcher, ctx) {
  const cacheUrl = `https://asset-quote-cache.local/${encodeURIComponent(cacheKey)}`;
  const cacheRequest = new Request(cacheUrl, { method: "GET" });

  try {
    if (typeof caches !== "undefined" && caches.default) {
      const cached = await caches.default.match(cacheRequest);
      if (cached) {
        const payload = await cached.json();
        return { ...payload, cached: true };
      }
    }
  } catch (_) {
    // Cache 失败不能影响接口可用性，直接走上游请求。
  }

  const json = await fetcher();
  const payload = {
    json,
    updatedAt: new Date().toISOString(),
    cached: false,
  };

  try {
    if (typeof caches !== "undefined" && caches.default && ctx?.waitUntil) {
      const response = new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${ttlSeconds}`,
        },
      });
      ctx.waitUntil(caches.default.put(cacheRequest, response.clone()).catch(() => undefined));
    }
  } catch (_) {
    // ignore cache put errors
  }

  return payload;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Upstream returned non-JSON response: ${res.status} ${text.slice(0, 180)}`);
  }

  if (!res.ok) {
    const message = json?.message || json?.error || JSON.stringify(json).slice(0, 300);
    throw new Error(`Upstream error ${res.status}: ${message}`);
  }

  return json;
}

function normalizeCryptoId(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const upperRaw = raw.toUpperCase();
  return COMMON_CRYPTO_ID_MAP[upperRaw] || raw.toLowerCase();
}

function normalizeCoinGeckoVsCurrency(currency) {
  const c = String(currency || "USD").toLowerCase();
  if (c === "usdt") return "usd";
  return c;
}

function normalizeMetalUnit(unit) {
  const u = String(unit || "gram").toLowerCase();
  if (["g", "gram", "grams", "克"].includes(u)) return "gram";
  if (["oz", "ounce", "troy_ounce", "troy-ounce", "盎司", "金衡盎司"].includes(u)) return "troy_ounce";
  throw new Error(`Unsupported metal unit: ${unit}. Use gram/g or troy_ounce/oz.`);
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function round(value, digits = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function sum(values) {
  return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function jsonResponse(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}

function htmlResponse(html, status = 200) {
  return withCors(
    new Response(html, {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }),
  );
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-api-token");
  headers.set("access-control-max-age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function renderDocs(origin) {
  const examplePortfolio = JSON.stringify(
    {
      defaultCurrency: "CNY",
      assets: [
        { id: "cash-1", type: "cash", name: "现金", quantity: 1000, currency: "CNY" },
        { id: "gold-1", type: "metal", name: "黄金", symbol: "XAU", quantity: 1, unit: "gram" },
        { id: "sol-1", type: "crypto", name: "SOL", symbol: "solana", quantity: 1 },
        { id: "aapl-1", type: "stock", name: "Apple", symbol: "AAPL", quantity: 1 },
      ],
      liabilities: [
        { id: "loan-1", name: "我欠朋友", direction: "payable", amount: 500, currency: "CNY" },
        { id: "receive-1", name: "朋友欠我", direction: "receivable", amount: 100, currency: "USD" },
      ],
    },
    null,
    2,
  );

  const flutterCode = `final res = await http.post(
  Uri.parse('${origin}/api/portfolio/valuate'),
  headers: {
    'content-type': 'application/json',
    // 'x-api-token': '你的 APP_API_TOKEN',
  },
  body: jsonEncode({
    'defaultCurrency': 'CNY',
    'assets': [
      {'type': 'crypto', 'name': 'SOL', 'symbol': 'solana', 'quantity': 1},
      {'type': 'metal', 'name': '黄金', 'symbol': 'XAU', 'quantity': 1, 'unit': 'gram'},
      {'type': 'stock', 'name': 'Apple', 'symbol': 'AAPL', 'quantity': 1},
    ],
    'liabilities': [
      {'name': '我欠朋友', 'direction': 'payable', 'amount': 500, 'currency': 'CNY'},
    ],
  }),
);`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Asset Quote API Worker</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --card:#111936; --line:#26345f; --text:#f4f7ff; --muted:#aab7d9; --accent:#7cc4ff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top, #152352, var(--bg)); color:var(--text); line-height:1.6; }
    main { max-width:1080px; margin:0 auto; padding:32px 16px 80px; }
    h1 { font-size:34px; margin:0 0 8px; }
    h2 { margin-top:34px; font-size:22px; border-bottom:1px solid var(--line); padding-bottom:8px; }
    h3 { margin-top:22px; }
    p, li { color:var(--muted); }
    .hero, .card { background:rgba(17,25,54,.88); border:1px solid var(--line); border-radius:18px; padding:22px; box-shadow:0 18px 60px rgba(0,0,0,.25); margin:16px 0; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { overflow:auto; padding:14px; border-radius:14px; background:#070b16; border:1px solid #1c294e; color:#e6eeff; }
    code { color:#d5ecff; }
    a { color:var(--accent); text-decoration:none; }
    .tag { display:inline-block; background:#1d2d5a; color:#d5ecff; border:1px solid #35518e; border-radius:999px; padding:4px 10px; font-size:13px; margin:4px 6px 4px 0; }
    table { width:100%; border-collapse: collapse; overflow:hidden; border-radius:12px; }
    th, td { border:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }
    th { background:#162450; color:#fff; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Asset Quote API Worker</h1>
      <p>你的个人资产记账 App 行情聚合 API。它不保存资产数据，只负责拉行情、做汇率换算、返回估值结果。</p>
      <div>
        <span class="tag">Cloudflare Worker</span>
        <span class="tag">Twelve Data</span>
        <span class="tag">CoinGecko</span>
        <span class="tag">Frankfurter</span>
        <span class="tag">Gold API</span>
      </div>
    </section>

    <section class="card">
      <h2>基础地址</h2>
      <pre>${origin}</pre>
      <p>如果你绑定了自己的域名，比如 <code>api.xxx.com</code>，那接口就是 <code>https://api.xxx.com/api/...</code>。</p>
    </section>

    <section class="card">
      <h2>接口列表</h2>
      <table>
        <tr><th>功能</th><th>方法</th><th>路径</th><th>说明</th></tr>
        <tr><td>健康检查</td><td>GET</td><td><code>/api/health</code></td><td>测试服务是否正常</td></tr>
        <tr><td>配置说明</td><td>GET</td><td><code>/api/config</code></td><td>返回支持的资产类型和币种</td></tr>
        <tr><td>汇率</td><td>GET</td><td><code>/api/fx?base=USD&amp;quote=CNY&amp;amount=700</code></td><td>查 USD/CNY，并返回换算后的金额</td></tr>
        <tr><td>换算</td><td>GET</td><td><code>/api/convert?from=USD&amp;to=CNY&amp;amount=700</code></td><td>金额换算</td></tr>
        <tr><td>虚拟币</td><td>GET</td><td><code>/api/crypto?ids=solana,bitcoin&amp;quote=CNY</code></td><td>查 CoinGecko ID 的价格</td></tr>
        <tr><td>黄金白银</td><td>GET</td><td><code>/api/metal?symbol=XAU&amp;unit=gram&amp;quote=CNY</code></td><td>XAU/XAG/XPT/XPD，支持克和金衡盎司</td></tr>
        <tr><td>股票 ETF</td><td>GET</td><td><code>/api/stock?symbol=AAPL&amp;quote=CNY</code></td><td>查 Twelve Data 股票价格并换算</td></tr>
        <tr><td>搜索股票/ETF/币种</td><td>GET</td><td><code>/api/search?type=stock&amp;q=apple</code></td><td>给 App 新增资产时做模糊提示</td></tr>
        <tr><td>资产组合估值</td><td>POST</td><td><code>/api/portfolio/valuate</code></td><td>Flutter 最推荐用这个，一个接口算总资产、负债、净资产</td></tr>
      </table>
    </section>

    <section class="card">
      <h2>直接测试</h2>
      <div class="grid">
        <div><h3>健康检查</h3><pre>curl "${origin}/api/health"</pre></div>
        <div><h3>汇率</h3><pre>curl "${origin}/api/fx?base=USD&quote=CNY&amount=700"</pre></div>
        <div><h3>虚拟币</h3><pre>curl "${origin}/api/crypto?ids=solana,bitcoin,tether&quote=CNY"</pre></div>
        <div><h3>黄金</h3><pre>curl "${origin}/api/metal?symbol=XAU&unit=gram&quote=CNY"</pre></div>
        <div><h3>股票</h3><pre>curl "${origin}/api/stock?symbol=AAPL&quote=CNY"</pre></div>
        <div><h3>搜索</h3><pre>curl "${origin}/api/search?type=stock&q=apple"</pre></div>
      </div>
    </section>

    <section class="card">
      <h2>资产组合估值 Body 示例</h2>
      <pre>${escapeHtml(examplePortfolio)}</pre>
      <h3>curl</h3>
      <pre>curl -X POST "${origin}/api/portfolio/valuate" \\
  -H "content-type: application/json" \\
  -d '${escapeHtml(examplePortfolio)}'</pre>
    </section>

    <section class="card">
      <h2>Flutter 调用示例</h2>
      <pre>${escapeHtml(flutterCode)}</pre>
    </section>

    <section class="card">
      <h2>资产类型格式</h2>
      <h3>现金</h3>
      <pre>{"type":"cash","name":"现金","quantity":1000,"currency":"CNY"}</pre>
      <h3>手动估值</h3>
      <pre>{"type":"manual","name":"房租押金","quantity":1,"manualPrice":3000,"currency":"CNY"}</pre>
      <h3>虚拟币</h3>
      <pre>{"type":"crypto","name":"SOL","symbol":"solana","quantity":1}</pre>
      <h3>黄金</h3>
      <pre>{"type":"metal","name":"黄金","symbol":"XAU","quantity":1,"unit":"gram"}</pre>
      <h3>股票 / ETF</h3>
      <pre>{"type":"stock","name":"Apple","symbol":"AAPL","quantity":1}</pre>
      <h3>借款 / 应收</h3>
      <pre>{"name":"我欠朋友","direction":"payable","amount":500,"currency":"CNY"}
{"name":"朋友欠我","direction":"receivable","amount":100,"currency":"USD"}</pre>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
