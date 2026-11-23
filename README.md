# Ledger Quote API - Cloudflare Pages Functions 版

这是给个人记账 App 用的行情聚合 API。App 本地保存资产、账单和借款；Cloudflare 只负责查行情、查汇率、换算估值。

当前版本：`1.9.1-efficient-quotes`

## 1.9.1 报价与客户端兼容

- 股票/ETF 每个冷缓存标的只调用一次 Twelve Data `/quote`，同时取得价格、币种、交易所，不再串行请求 `/price` 和 `/quote`。价格使用当前 `close`，不会把 `previous_close` 冒充当前价格。单次上游报价超时 8 秒，不自动重试；汇率超时 6 秒，不自动重试。
- 原 `/api/stock` 路径及 `price`、`sourcePrice`、`sourceCurrency`、`raw`、`cached`、`stale` 字段保留；交易所在 `raw.exchange`，另提供 `raw.mic_code`。客户端应读取这些字段，不能只查 `identity.exchange`。
- 保留 15 分钟缓存。相同标的/汇率的并发冷请求在同一 isolate 合并；Cloudflare 缓存和合并不是跨节点全局额度控制，多个设备/区域可能各自回源。
- 上游 HTTP 429 或 HTTP 200 内的 Twelve Data `code: 429`，在没有可用旧缓存时统一返回 HTTP 429、`code: RATE_LIMITED` 和 `Retry-After: 60`。客户端应停止本轮继续请求；每天额度耗尽时，60 秒后也可能继续限流。
- 无效或报错的股票/汇率数据不会写入缓存。失败时若有可用旧缓存，继续返回 `ok: true, stale: true`；钱踪拒绝用这种报价覆盖现有估值。异步路由异常统一返回 JSON 错误，不再漏出平台错误页。
- `/api/stock` 只接受一个代码；批量组合仍使用 `/api/portfolio/valuate`。`/api/health` 不访问行情上游；`/api/debug/self-test` 会主动检查多种数据源，不应拿它做每次启动检查。

四只股票 + 同一 USD/CNY 汇率：冷缓存为 **4 次 Twelve Data + 1 次 Frankfurter**，缓存命中不消耗新的 Twelve Data 报价积分。免费版每分钟 8 积分、每天 800 积分，建议前台 30 分钟刷新；按单设备全天 48 轮估算约 192 股票积分，15 分钟约 384，另留启动、手动刷新、搜索及其他客户端的余量。这是估算，不是全局额度保证。

验证：Node.js 22+ 执行 `npm test`，无需安装依赖，也不调用真实行情服务。测试覆盖四标的请求数、热缓存、并发合并、429、失效缓存、非法报价、超时、FX、认证与兼容字段。

官方依据：[Quote 每标的 1 积分](https://twelvedata.com/docs/market-data/quote)、[免费版额度与重置时间](https://support.twelvedata.com/en/articles/5615854-credits)。

## 重要部署说明

Cloudflare Pages 控制台里的 **Direct Upload / 拖 zip 上传** 只能上传静态资源，不能编译 `/functions` 目录里的 Pages Functions。

- 只拖 zip 到 Pages：只能看到首页教程，`/api/*` 不会生效。
- 要让 API 生效：使用 **Wrangler CLI 部署**，或者把本目录推到 GitHub 后让 Pages 从 Git 构建。

## 环境变量 / Secret

在 Cloudflare Pages 项目里进入：

`Settings -> Environment variables -> Add variable`

| 变量名 | 类型 | 是否必须 | 说明 |
|---|---|---:|---|
| `TWELVE_DATA_API_KEY` | Secret / Encrypt | 必须 | Twelve Data Key。美股、美股 ETF、股票搜索需要它。 |
| `APP_API_TOKEN` | Secret / Encrypt | 推荐 | 你自己的接口密码。设置后所有 `/api/*` 请求都要带 `x-api-token`。 |
| `COINGECKO_DEMO_API_KEY` | Secret / Encrypt | 可选 | CoinGecko 偶尔 403/429 时可加，提升虚拟币接口稳定性。 |

不需要 Key 的数据源：

- Frankfurter：汇率
- Gold API：黄金 / 白银 / 铂金 / 钯金
- 东方财富 / 腾讯行情：A股、A股场内 ETF 行情兜底（非官方公开接口，仅适合个人低频记账估值）

## 本地运行

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

打开：

```text
http://127.0.0.1:8788
```

## 部署到 Cloudflare Pages

第一次部署：

```bash
npm install
npx wrangler pages project create ledger-quote-api
npm run deploy
```

已有项目直接：

```bash
npm run deploy
```

部署后去 Pages 项目的 `Settings -> Environment variables` 添加变量，然后重新部署一次。

## App 设置页填写

```text
API 地址：https://你的 Pages 域名
API Token：你的 APP_API_TOKEN
默认估值货币：CNY / USD / HKD / SGD / EUR / JPY / USDT
```

不要在 Flutter 里写 Twelve Data Key，Twelve Data Key 只放在 Cloudflare Pages 的 Secret 里。

## 接口总览

```text
GET  /api/health
GET  /api/config
GET  /api/debug/env
GET  /api/debug/self-test?quote=CNY
GET  /api/debug/crypto?ids=bitcoin,solana&quote=CNY

GET  /api/fx?base=USD&quote=CNY&amount=700
GET  /api/convert?from=HKD&to=CNY&amount=1000

GET  /api/crypto?ids=solana,bitcoin,tether&quote=CNY
GET  /api/metal?symbol=XAU&unit=gram&quote=CNY
GET  /api/stock?symbol=AAPL&quote=CNY
GET  /api/stock?symbol=SGOV&quote=CNY

GET  /api/cn-stock?symbol=600519&quote=CNY
GET  /api/cn-stock?symbol=510050&quote=CNY
GET  /api/ashare?symbol=159915&quote=CNY

GET  /api/search?type=stock&q=apple
GET  /api/search?type=etf&q=sgov
GET  /api/search?type=crypto&q=sol
GET  /api/search?type=metal&q=gold
GET  /api/search?type=cn_stock&q=茅台
GET  /api/search?type=cn_etf&q=上证50
GET  /api/search?type=a_stock&q=601658
GET  /api/search?type=a_etf&q=510050

POST /api/portfolio/valuate
```

## A股 / A股 ETF

### 查询 A 股价格

```text
/api/cn-stock?symbol=600519&quote=CNY
/api/cn-stock?symbol=SH600519&quote=CNY
/api/cn-stock?symbol=600519.SH&quote=CNY
/api/cn-stock?symbol=000001.SZ&quote=CNY
```

### 查询 A股 ETF / 场内基金价格

```text
/api/cn-stock?symbol=510050&quote=CNY
/api/cn-stock?symbol=SH510050&quote=CNY
/api/cn-stock?symbol=159915.SZ&quote=CNY
/api/ashare?symbol=159740&quote=HKD
```

`/api/stock` 现在也兼容 A 股代码，例如：

```text
/api/stock?symbol=601658&quote=CNY
/api/stock?symbol=510050&quote=CNY
```

## Flutter 主要调用：组合估值

```http
POST /api/portfolio/valuate
content-type: application/json
x-api-token: 你的 APP_API_TOKEN
```

```json
{
  "defaultCurrency": "CNY",
  "assets": [
    {"id":"cash-1","type":"cash","name":"招商银行卡","quantity":1000,"currency":"CNY"},
    {"id":"btc-1","type":"crypto","name":"BTC","symbol":"bitcoin","quantity":0.01},
    {"id":"aapl-1","type":"stock","name":"Apple","symbol":"AAPL","quantity":1},
    {"id":"sgov-1","type":"etf","name":"SGOV","symbol":"SGOV","quantity":21},
    {"id":"cn-stock-1","type":"cn_stock","name":"邮储银行","symbol":"601658","quantity":1400},
    {"id":"cn-etf-1","type":"cn_etf","name":"上证50ETF","symbol":"510050","quantity":1000},
    {"id":"gold-1","type":"metal","name":"黄金","symbol":"XAU","quantity":50,"unit":"gram"}
  ],
  "liabilities": [
    {"id":"loan-1","name":"我欠朋友","direction":"payable","amount":500,"currency":"CNY"},
    {"id":"receive-1","name":"朋友欠我","direction":"receivable","amount":100,"currency":"USD"}
  ]
}
```

## 本版改动

- 主域名 `/` 和 `/docs` 的文档页补齐所有接口，特别是 A股 / A股 ETF。
- 文档页新增在线测试、curl 复制、搜索示例、组合估值示例。
- `/api/config` 返回更完整的 endpoints / searchTypes / aliases。
- `/api/debug/self-test` 增加 A股和 A股 ETF 自检。
- `/api/stock` 兼容 A股 / A股 ETF 代码。
- 修正 `/api/search?type=cn_stock` 会混入 A股 ETF 的问题。
