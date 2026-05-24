# Ledger Quote API - Cloudflare Pages Functions 版

这是给个人记账 App 用的行情聚合 API。它不保存你的资产和借款数据，只负责查行情、查汇率、换算成默认货币。

## 重要说明

Cloudflare Pages 控制台里的 **Direct Upload / 拖 zip 上传** 目前只能上传静态资源，不能编译 `/functions` 目录里的 Pages Functions。也就是说：

- 只拖 zip 到 Pages：只能看到首页教程，`/api/*` 不会生效。
- 要让 API 生效：需要用 **Wrangler CLI 部署**，或者把这个目录推到 GitHub 后让 Pages 从 Git 构建。

如果你只是想继续最简单使用，原来的 Worker 版更直接；如果你想把“教程主页 + API”放在一个 Pages 项目里，就用这一版。

## 需要添加的环境变量 / Secret

在 Cloudflare Pages 项目里进入：

`Settings -> Environment variables -> Add variable`

建议 Production 和 Preview 都添加一次。

| 变量名 | 类型 | 是否必须 | 说明 |
|---|---|---:|---|
| `TWELVE_DATA_API_KEY` | Secret / Encrypt | 必须 | Twelve Data Key。股票、ETF、股票搜索需要它。 |
| `APP_API_TOKEN` | Secret / Encrypt | 推荐 | 你自己的接口密码。设置后所有 `/api/*` 请求都要带 `x-api-token`。 |

不需要 Key 的数据源：

- Frankfurter：汇率
- CoinGecko：虚拟币
- Gold API：黄金 / 白银 / 铂金 / 钯金

## 本地运行

```bash
npm install
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```env
TWELVE_DATA_API_KEY="你的_TWELVE_DATA_API_KEY"
APP_API_TOKEN="你的_APP_API_TOKEN"
```

启动：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:8788
```

## 用 Wrangler 部署到 Cloudflare Pages

第一次部署：

```bash
npm install
npx wrangler pages project create ledger-quote-api
npm run deploy
```

如果项目已经存在，直接：

```bash
npm run deploy
```

部署后会得到类似：

```text
https://ledger-quote-api.pages.dev
```

然后去 Pages 项目的 `Settings -> Environment variables` 添加上面的变量。

## 用 GitHub 部署

1. 把本目录上传到一个 GitHub 仓库。
2. Cloudflare -> Workers & Pages -> Create application -> Pages -> Connect to Git。
3. 选择仓库。
4. 构建设置：

```text
Framework preset: None
Build command: 不填
Build output directory: public
Root directory: 仓库根目录
```

5. 部署完成后，去 `Settings -> Environment variables` 添加：

```text
TWELVE_DATA_API_KEY
APP_API_TOKEN
```

6. 重新部署一次。



## v1.3.0 股票接口修复说明

本版针对 `/api/stock` 做了容错：

- 股票价格优先使用 Twelve Data `/price` 端点，`/quote` 只作为补充信息。
- 缓存读写失败不会导致接口崩溃。
- 新增 `/api/debug/env`，只返回 `hasTwelveDataApiKey` / `hasAppApiToken` 布尔值，不泄露密钥内容。
- 移除了上游请求里的 `user-agent` 自定义 header，减少 Worker/Pages 运行时兼容问题。

部署后先测试：

```text
/api/debug/env?token=你的_APP_API_TOKEN
/api/health?token=你的_APP_API_TOKEN
/api/stock?symbol=AAPL&quote=CNY&token=你的_APP_API_TOKEN
```

如果 `/api/debug/env` 里 `hasTwelveDataApiKey` 是 `false`，说明 Cloudflare Pages 的 Production 环境变量里没有设置 `TWELVE_DATA_API_KEY`。


## 接口测试

如果设置了 `APP_API_TOKEN`，测试时要带 Header：

```bash
curl "https://你的域名/api/health" -H "x-api-token: 你的_APP_API_TOKEN"
```

浏览器临时测试可以用：

```text
https://你的域名/api/health?token=你的_APP_API_TOKEN
```

## 主要接口

```text
GET  /api/health
GET  /api/fx?base=USD&quote=CNY&amount=700
GET  /api/crypto?ids=solana,bitcoin,tether&quote=CNY
GET  /api/metal?symbol=XAU&unit=gram&quote=CNY
GET  /api/stock?symbol=AAPL&quote=CNY
GET  /api/search?type=stock&q=apple
GET  /api/search?type=etf&q=qqq
GET  /api/search?type=crypto&q=sol
POST /api/portfolio/valuate
```

## Flutter 里填什么

App 设置页：

```text
API 地址：https://你的 Pages 域名
API Token：你的 APP_API_TOKEN
默认估值货币：CNY
```

不要在 Flutter 里写 Twelve Data Key，Twelve Data Key 只放在 Cloudflare Pages 的 Secret 里。


## v1.5.0 稳定性增强说明

本版在 v1.3 股票接口修复基础上继续加固：

- 所有上游请求增加超时控制，避免接口长时间卡住。
- 缓存改成“可用期 + 过期兜底”模式：上游临时失败时，能返回上一轮缓存数据，并标记 `stale: true`。
- `/api/portfolio/valuate` 改为并发限流估值，某个资产失败不会影响其它资产。
- 股票 / ETF 搜索增加本地兜底列表，Twelve Data 搜索失败时仍能返回常见代码。
- 虚拟币搜索增加本地兜底，CoinGecko 搜索失败时仍可返回常见币种。
- CORS 增加 `authorization` header 支持。
- `/api/debug/self-test` 新增全链路自检，可检查 FX / Crypto / Metal / Stock 是否正常。
- 错误信息会自动隐藏 `apikey`，避免日志中泄露密钥。

部署后建议依次测试：

```text
/api/debug/env?token=你的_APP_API_TOKEN
/api/debug/self-test?token=你的_APP_API_TOKEN
/api/fx?base=USD&quote=CNY&amount=700&token=你的_APP_API_TOKEN
/api/stock?symbol=AAPL&quote=CNY&token=你的_APP_API_TOKEN
/api/portfolio/valuate
```


## v1.5 crypto fix

- 修复 `/api/crypto` 在 CoinGecko 返回 HTML、403/429、超时或异常时可能触发 Cloudflare 1101 的问题。
- `/api/crypto` 现在会尽量返回 JSON，不再直接让 Worker 崩溃。
- USDT/USDC 增加稳定币兜底：USD/USDT/USDC 按 1 处理；其它货币优先走 USD 汇率兜底。
- 新增 `/api/debug/crypto`，等价于 crypto 调试入口。
