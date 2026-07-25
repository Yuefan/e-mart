# AI Marketing Dashboard

按 [`ai-marketing-dashboard-spec.md`](./ai-marketing-dashboard-spec.md) 实现。当前完成 **P0 的第一块**：Google 授权 + Search Console 数据面板。

## 已实现

**P0 — GSC 数据管道**

| 能力 | 位置 |
|---|---|
| Google OAuth 2.0 + PKCE 授权（登录即连接） | `src/app/api/connections/google/{start,callback}` |
| 凭证 AES-256-GCM 加密落库、access token 到期前 5 分钟自动刷新 | `src/lib/crypto.ts`、`src/lib/integrations/google/oauth.ts` |
| 账号总览：登录身份、会话有效期、各第三方账号的授权范围/令牌状态/绑定站点，可测试、重新授权、断开 | `/account` |
| 列出账号下所有 GSC 资源，勾选绑定为 Site | `/connections` |
| GSC 数据同步（5 个维度、分页、429/5xx 指数退避、窗口幂等重写） | `src/lib/jobs/gsc-sync.ts` |
| KPI 卡 + 时序曲线 + Top Queries/Pages/国家/设备 | `/sites/[siteId]/overview` |
| 衍生洞察：机会关键词 / 临界页面 / 下滑预警 | `src/lib/gsc-queries.ts` |
| 常驻 worker + 定时任务（每日同步 / token 刷新 / 连接探活 / 每周诊断） | `src/worker/`、`src/lib/jobs/schedule.ts` |

**P1 — AI SEO 诊断**

| 能力 | 位置 |
|---|---|
| 现场抓取最多 50 个页面（限速退避、解析 title/meta/H1/canonical/OG/JSON-LD/alt/内链/hreflang） | `src/lib/seo/crawl.ts` |
| 规则引擎：20+ 确定性检查，按真实曝光量加权严重度 | `src/lib/seo/rules.ts` |
| AI 层：优先级排序、跨信号关联、可直接粘贴的标题/描述改写 | `src/lib/ai/`、`src/lib/jobs/seo-audit.ts` |
| 评分环 + 摘要 + 按严重度分组、可按类别筛选的 Findings 列表 | `/sites/[siteId]/seo` |

> Cloudflare / GitHub / Shopify 三路证据源还空着（需要对应凭证）。诊断目前跑在 GSC + 现场抓取上。

**P2 — 内容生产**

| 能力 | 位置 |
|---|---|
| brandVoice 配置（tone/audience/关键词/禁用词/字数区间） | `/sites/[siteId]/settings` |
| 选题：从你自己「有曝光但排名差」的查询里挑，按预期价值排序 | `src/lib/ai/prompts/content.v1.ts` |
| 大纲 → 正文 → 自检全链路，分步进度 | `src/lib/jobs/content.ts` |
| 机械检查：关键词密度、meta 长度、标题层级、内链数、禁用词、近重复标题 | `src/lib/content/checks.ts` |
| 草稿列表 + Markdown 编辑器（实时预览 + SEO 检查条） | `/sites/[siteId]/content` |
| 月度 AI 花费看板与预算上限 | `/sites/[siteId]/settings` |

> 配图那步需要图像生成 API，目前正文里留 `{{IMAGE_1}}` 占位符不填充。发布目标（Shopify / GitHub）等对应连接接上才开放。

## 快速开始

```bash
npm install
npm run setup:env          # 生成 ENCRYPTION_KEY / SESSION_SECRET
npm run db:migrate         # 建库（SQLite，落在 prisma/dev.db）
```

然后按 [`docs/google-oauth-setup.md`](./docs/google-oauth-setup.md) 拿到 Google OAuth 凭据，填进 `.env`：

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
```

```bash
npm run dev                # http://localhost:3000
npm run worker             # 另开一个终端：定时任务 + SEO 诊断
```

流程：`/login` → Continue with Google → `/connections` 勾一个 GSC 资源 → 自动回补 90 天 → 曲线页。

**worker 是独立进程**，负责定时任务和 SEO 诊断。不开的话曲线页照样能用（手动 Sync 是内联跑的），但数据不会自动更新，「Run audit」会一直排队——按钮会在 45 秒后告诉你 worker 没开。

AI 诊断要配网关，见 [`docs/ai-gateway-setup.md`](./docs/ai-gateway-setup.md)。**不配也能跑**，规则引擎的发现一条不少，只是没有优先级排序和改写文案。

### 国内网络：必须让 Node 走代理

浏览器能打开 Google **不代表服务端能**。授权页是浏览器访问的（走系统代理），但拿 code 换 token、以及后续所有 GSC API 调用都是 Node 发的，而 **Node 的 `fetch` 默认不读 `HTTP_PROXY`**，会直连超时。

`npm run dev` / `npm run start` 已经带上 `NODE_USE_ENV_PROXY=1`（需要 Node 24+），它让 Node 内建 fetch 使用 `HTTPS_PROXY` / `HTTP_PROXY`。所以：

- 在**设置了 `HTTPS_PROXY` 的 shell 里**启动，别用 IDE 的一键运行按钮，除非它继承了这些变量
- 这个开关必须在进程启动前生效，**写进 `.env` 是没用的**
- 改完 `package.json` 要**重启 dev server**，热重载不会重新读脚本

自检：

```bash
curl http://localhost:3000/api/diagnostics/google
```

期望 `"reachable": true` 且 `"nodeUsesEnvProxy": true`。如果 `reachable:false` 而 `nodeUsesEnvProxy:false`，就是上面这个问题。

部署到墙外 VPS 时不设 `HTTPS_PROXY` 即可，开关自动变成空操作。

### 不接 Google 先看界面

```bash
npm run db:seed:demo       # 造 180 天合成数据，站点名 "Demo (synthetic data)"
```

数据全部是脚本生成的，不是真实 GSC 数据。清掉：`npm run db:reset`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | 常驻 worker：定时任务 + 队列消费 |
| `npm run ai:check` | 验证 AI 网关连通、模型、单次成本 |
| `npm run typecheck` / `lint` | TS + ESLint |
| `npm test` | Node 自带 test runner，跑 `src/**/*.test.ts` |
| `npm run db:migrate` | 建/改表 |
| `npm run db:studio` | Prisma Studio 看数据 |
| `npm run db:seed:demo` | 合成演示数据 |
| `npm run db:reset` | 清库重建 |

## 部署

见 [`docs/deployment.md`](./docs/deployment.md)。VPS + Docker Compose：

```bash
docker compose --env-file .env.production up -d --build
```

**Cloudflare Workers 跑不了这个应用**——原生模块、常驻 worker 进程、6.5 分钟的抓取任务，三个都撞在 Workers 的模型上。文档里写了真要迁需要改什么。

## 与 spec 的差异

写在代码里的偏离，都是有理由的，不是漏做：

1. **SQLite 而非 Postgres**。本机没有 Docker/Postgres。schema 结构与 spec 一致，切换只需改 `prisma/schema.prisma` 的 `provider`，并把 `scopes`（现为空格分隔字符串）还原成 `String[]`、`meta`/`config`/`logs` 还原成 `Json`、`provider` 还原成 enum。`src/lib/db-url.ts` 对非 `file:` URL 是空操作。
2. **登录 = Google 授权**，没有独立的邮箱密码登录。单人单 Workspace 场景下多一套密码是纯负担；`User.passwordHash` 留到多租户时再加。
3. **队列用数据库，不是 BullMQ**。BullMQ 要 Redis，这台机器没有。`JobRun` 表加了 `status/runAfter/dedupeKey/attempts`，worker 轮询领取，用条件 `updateMany` 做锁、`dedupeKey` 唯一索引做定时幂等、`claimedAt` 超时回收僵尸任务。语义和 spec §8 一致，迁 VPS 时换 BullMQ 只需重写 `src/lib/jobs/queue.ts` —— 调用方只见 `enqueue`，worker 只见 `claimNext`。
   手动 Sync 仍然内联跑（十几秒，用户点了就想看到结果）；SEO 诊断走队列（要几分钟）。
4. **抓取很慢，这是故意的**。50 个页面并发 2、每次间隔 300ms、429/503 按 `Retry-After` 退避重试。在 geeujade.com（Shopify）上一次诊断约 6.5 分钟。第一版并发 4 无延迟，结果被站点限流，产出 14 条「页面无法访问」的**假阳性**——报告说页面坏了，其实是我把它请求崩了。现在 429 收敛成一条 low 级别的「本次抓取被限流，这些页没审到」，和真正的 404 分开。
5. **OAuth state 存签名 cookie 而非 Redis**。10 分钟 TTL、httpOnly、一次性消费，语义与 spec 一致，少一个依赖。
6. **不做双 Y 轴曲线**。spec §5.1 画的是「左点击右曝光」，但两条不同量纲的线共用一张图时，交叉点看起来有意义、实际是缩放造成的假象。改成每个指标一张小图（small multiples），共享 X 轴，虚线叠加上一周期。指标 chip 可切换 CTR / 平均排名。
7. **聚合在 JS 里做，不是 SQL**。每个维度每个同步窗口上限 25k 行，读取量很小；这样查询层不依赖 SQLite 的日期存储格式，迁 Postgres 时不用重写。
8. **AI 走官方 SDK，不走 OpenAI 兼容 shim**。spec §6.1 写的是 `/v1` 中转，这里用 `@anthropic-ai/sdk` + `baseURL` 指向中转的 Anthropic 端点（New API / LiteLLM 都提供）。这样结构化输出、adaptive thinking、refusal 处理都还在；用 OpenAI shim 会全丢。**代价是你的中转必须有 `/v1/messages`，不能只有 `/v1/chat/completions`** —— 只有后者的话告诉我，我改用 tool_use 兜底。
9. **模型默认 `claude-opus-5`**，不是 spec 写的 `claude-sonnet-4-6`（那个 ID 还有效，只是不是当前最强）。全部走环境变量，改一行就能降级；`docs/ai-gateway-setup.md` 里有成本对照。
10. **重复检测用 token 重合度，不是 embedding**。spec §5.3 写的是 embedding 余弦 > 0.85，那需要额外的 embedding API。现在用标题 token 的 Jaccard 重合度（带朴素复数归并）> 0.6 判定近重复。够用且零额外依赖，接了 embedding 再换。
11. **配图链路空着**。正文里生成 `{{IMAGE_1}}` 占位符但不填充——图像生成 API 未配置。占位符会在 SEO 检查条里显示为待填槽位。

## 下一步（按 spec 的交付计划）

- **P1 剩余**：Cloudflare scoped token（zone 状态 / DNS / 缓存清除）、GitHub App（读代码进诊断证据包、修复以 PR 交付）
- **P2**：brandVoice 配置、选题 → 大纲 → 正文 → 配图全链路
- **P3**：Shopify OAuth、blog 发布、页面 SEO 巡检
- 诊断的 `autoFixable` 发现目前只展示不执行——落点是 Shopify `pageUpdate` 和 GitHub PR，等那两个连接接上才能一键采纳
