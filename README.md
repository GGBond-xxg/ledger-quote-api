# Ledger Quote API - Cloudflare Pages Functions 版

这是给个人记账 App 用的行情聚合 API。App 本地保存资产、账单和借款；Cloudflare 只负责查行情、查汇率、换算估值。

当前版本：`1.9.0-pages-docs-ashare`

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
