# AI Marketing Dashboard — 设计规格说明书

> 版本: v0.1 (Draft)
> 目标: 一个 Web 端 AI 驱动的 SEO / 内容营销控制台，打通 Google Search Console、Cloudflare、GitHub、Shopify，实现「数据采集 → AI 诊断 → 内容生成 → 自动发布」闭环。

---

## 1. 概述

### 1.1 产品定位

面向自运营多站点（品牌官网 + Shopify 独立站）的单人/小团队 SEO 与内容营销自动化工作台。核心价值是把原本分散在 4 个后台的操作收敛到一个面板，并用 AI 承担诊断与内容生产。

### 1.2 核心概念

| 概念 | 说明 |
|---|---|
| **Workspace** | 用户空间，一个登录账号一个 Workspace（多租户预留） |
| **Site（站点）** | 核心实体。一个域名 = 一个 Site。所有集成（GSC property / Cloudflare zone / GitHub repo / Shopify shop）都挂载到 Site 上 |
| **Connection（连接）** | 一个第三方平台的授权凭证，Workspace 级别。一个 Connection 可以被多个 Site 引用 |
| **Binding（绑定）** | Site ↔ Connection 的具体映射，例如 `songolab.com` → GSC property `sc-domain:songolab.com` |

> 设计要点：**Connection 是账号级的，Binding 是站点级的**。一次 Google 授权可以覆盖名下所有 GSC 资源，避免重复授权。

### 1.3 非目标（本期不做）

- 可视化网页编辑器（模块 6，仅预留入口与数据结构）
- 多用户协作 / 权限分级
- 关键词排名第三方抓取（Ahrefs/Semrush 类）
- 付费广告投放（Google Ads / Meta Ads）

---

## 2. 技术架构

### 2.1 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js 15 App Router + TypeScript + Tailwind CSS | 与现有 roarland.net / songolab.com 栈一致 |
| UI 组件 | shadcn/ui + Radix | 无运行时样式依赖，便于定制 |
| 图表 | Recharts | GSC 时序曲线足够用，体积可控 |
| 后端 | Next.js Route Handlers（同仓）| 单体部署，减少运维面 |
| 数据库 | PostgreSQL 16 + Prisma | 需要关系型建模 + JSONB 存原始 API 响应 |
| 缓存/队列 | Redis + BullMQ | 定时任务、AI 长任务、API 限流 |
| 对象存储 | Cloudflare R2 | 存 AI 配图，与现有 Cloudflare 体系一致，出站免费 |
| 部署 | Docker Compose，自建 VPS（经 frp 暴露）| 定时任务需要常驻进程，Vercel Cron 有 10s/60s 限制不适用 |

### 2.2 部署拓扑

```
┌─────────────────────────────────────────────┐
│ VPS (public)                                │
│  ├─ nginx / caddy  (TLS 终止)               │
│  ├─ web        : Next.js (SSR + API Routes) │
│  ├─ worker     : BullMQ consumer (常驻)     │
│  ├─ scheduler  : BullMQ repeatable jobs     │
│  ├─ postgres                                │
│  └─ redis                                   │
└─────────────────────────────────────────────┘
        │            │            │           │
     Google       Cloudflare    GitHub    Shopify
      OAuth        API Token    App       Admin API
                                   │
                              AI Gateway
                        (New API / LiteLLM relay)
```

**关键决策**：`web` 与 `worker` 分进程。AI 生成一篇 blog + 配图可能耗时 60–180s，绝不能放在 HTTP 请求生命周期内。

### 2.3 目录结构

```
/app
  /(auth)/login
  /(dash)
    /layout.tsx                 # 左侧栏 + 顶部 Site 切换器
    /page.tsx                   # Overview
    /sites/[siteId]
      /overview                 # GSC 曲线
      /seo                      # SEO 诊断
      /content                  # 内容生产
      /deploy                   # Cloudflare / GitHub 发布
    /connections                # 四个集成的授权管理
    /settings
  /api
    /auth/[...]
    /connections/google/{start,callback}
    /connections/github/{start,callback}
    /connections/shopify/{start,callback}
    /connections/cloudflare      # token 校验（非 OAuth）
    /sites/[siteId]/gsc/timeseries
    /sites/[siteId]/seo/audit
    /sites/[siteId]/content/generate
    /jobs/[jobId]
    /webhooks/shopify
/lib
  /integrations/{google,cloudflare,github,shopify}
  /ai/{client,prompts,schemas}
  /crypto            # 凭证加解密
  /queue             # BullMQ 定义
/worker
  index.ts
  /jobs/{gscSync,seoAudit,contentGenerate,publish}.ts
/prisma/schema.prisma
```

---

## 3. 数据模型

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  sites         Site[]
  connections   Connection[]
}

model Site {
  id            String   @id @default(cuid())
  userId        String
  name          String            // "Songo Lab"
  domain        String            // "songolab.com"
  // 内容调性配置，喂给 AI 的长期上下文
  brandVoice    Json?             // { tone, audience, keywords[], forbidden[], sampleUrls[] }
  bindings      Binding[]
  gscDaily      GscDaily[]
  audits        SeoAudit[]
  articles      Article[]
  @@unique([userId, domain])
}

enum Provider { GOOGLE CLOUDFLARE GITHUB SHOPIFY }

model Connection {
  id             String   @id @default(cuid())
  userId         String
  provider       Provider
  accountLabel   String            // "yuffy@gmail.com" / "roarland.myshopify.com"
  encAccessToken  Bytes            // AES-256-GCM 密文
  encRefreshToken Bytes?
  expiresAt      DateTime?
  scopes         String[]
  meta           Json?             // installationId / shop / accountId
  status         String            // active | expired | revoked
  bindings       Binding[]
  @@unique([userId, provider, accountLabel])
}

model Binding {
  id             String   @id @default(cuid())
  siteId         String
  connectionId   String
  // 各 provider 的资源标识
  resourceId     String            // sc-domain:songolab.com | zoneId | owner/repo | shop domain
  config         Json?             // { branch, contentPath, blogId, ... }
  @@unique([siteId, connectionId, resourceId])
}

// ---- GSC 数据 ----
model GscDaily {
  siteId       String
  date         DateTime
  dimension    String     // "total" | "query" | "page" | "country" | "device"
  dimValue     String     // dimension=total 时为 ""
  clicks       Int
  impressions  Int
  ctr          Float
  position     Float
  @@id([siteId, date, dimension, dimValue])
  @@index([siteId, dimension, date])
}

// ---- SEO 诊断 ----
model SeoAudit {
  id           String   @id @default(cuid())
  siteId       String
  triggeredBy  String            // cron | manual
  status       String            // queued | running | done | failed
  score        Int?              // 0-100
  summary      String?
  findings     Finding[]
  rawInput     Json?             // 送给 AI 的证据包（便于复现）
  createdAt    DateTime @default(now())
}

model Finding {
  id          String  @id @default(cuid())
  auditId     String
  severity    String  // critical | high | medium | low
  category    String  // technical | content | onpage | performance | indexing
  url         String?
  title       String
  detail      String
  suggestion  String
  autoFixable Boolean @default(false)
  fixPayload  Json?   // 可直接执行的修复动作
  status      String  @default("open") // open | fixing | fixed | ignored
}

// ---- 内容 ----
model Article {
  id           String   @id @default(cuid())
  siteId       String
  title        String
  slug         String
  excerpt      String?
  bodyMd       String   @db.Text
  metaTitle    String?
  metaDesc     String?
  targetKeyword String?
  coverImageUrl String?
  images       Json?    // [{ url, alt, prompt, placeholder }]
  status       String   // draft | review | scheduled | published | failed
  scheduledAt  DateTime?
  publishedAt  DateTime?
  targets      PublishTarget[]
  aiMeta       Json?    // { model, promptVersion, tokens, cost }
  createdAt    DateTime @default(now())
}

model PublishTarget {
  id           String  @id @default(cuid())
  articleId    String
  provider     Provider   // SHOPIFY | GITHUB | CLOUDFLARE
  externalId   String?    // Shopify article gid / commit sha / deployment id
  externalUrl  String?
  status       String     // pending | success | failed
  error        String?
}

model JobRun {
  id          String   @id @default(cuid())
  type        String   // gsc_sync | seo_audit | content_generate | publish
  siteId      String?
  status      String
  progress    Int      @default(0)
  logs        Json?
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
}
```

---

## 4. 集成设计

### 4.1 Google Search Console

| 项 | 值 |
|---|---|
| 授权方式 | OAuth 2.0 Authorization Code + PKCE，`access_type=offline&prompt=consent` |
| Scope | `https://www.googleapis.com/auth/webmasters.readonly` |
| 核心 API | `POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query`、`GET /webmasters/v3/sites`（列资源）|
| 令牌 | refresh_token 长期有效，access_token 1h，调用前检查剩余 <5min 则刷新 |

**授权流程**

1. 用户点左侧栏「Google」→ `GET /api/connections/google/start`
2. 服务端生成 `state`（含 userId + nonce，存 Redis TTL 10min）+ PKCE `code_verifier`，302 到 Google
3. 回调 `GET /api/connections/google/callback` → 校验 state → 换 token → 加密落库为 Connection
4. 立即调 `GET /sites` 拉取该账号下所有 GSC 资源，返回列表让用户勾选并绑定到 Site（生成 Binding）

**数据同步（`gscSync` job）**

- 频率：每日 UTC 04:00，外加 Site 创建后立即回补 90 天
- **GSC 数据有 2–3 天延迟**，因此每次同步都重新拉取 **T-1 到 T-5** 的窗口做 upsert，覆盖延迟到达的数据
- 每次同步拉 5 类查询：
  - `dimensions: [date]` → 总量曲线
  - `dimensions: [date, query]`，rowLimit 5000 → Top 关键词
  - `dimensions: [date, page]`，rowLimit 5000 → 页面表现
  - `dimensions: [date, country]`
  - `dimensions: [date, device]`
- 限流：GSC 配额 1200 QPM / 30000 QPD，worker 侧串行 + 指数退避（429/503 重试 5 次）
- 写入用 `upsert`，主键 `(siteId, date, dimension, dimValue)` 天然幂等

### 4.2 Cloudflare

| 项 | 值 |
|---|---|
| 授权方式 | **用户粘贴 Scoped API Token**（不走 OAuth，Cloudflare 未开放第三方 OAuth）|
| 校验 | `GET /client/v4/user/tokens/verify` |
| 所需权限 | Zone:Read、DNS:Read、Zone Settings:Read、Cache Purge:Purge、Workers Scripts:Edit、Workers R2 Storage:Edit |

**功能**

1. **Zone 状态面板**：`GET /zones` 列出所有 zone → 展示 status(active/pending)、plan、name_servers、SSL 模式、Always Use HTTPS、Brotli、开发模式是否开启
2. **DNS 概览**：`GET /zones/{id}/dns_records`，标记出解析到当前 Site 的记录
3. **Analytics（可选）**：GraphQL Analytics API 拉 7 日请求量/带宽/威胁数，与 GSC 曲线并列展示
4. **缓存清除**：发布内容后 `POST /zones/{id}/purge_cache`（按 URL 精确清除）
5. **Worker 推送静态页**：见 §5.5

> UI 上要明确告知用户创建 Token 的最小权限清单，并提供一键跳转 `dash.cloudflare.com/profile/api-tokens` 的链接。

### 4.3 GitHub

| 项 | 值 |
|---|---|
| 授权方式 | **GitHub App**（非 OAuth App）|
| 理由 | 细粒度到仓库级、token 自动轮换、无需用户账号全局权限 |
| 权限 | Repository: Contents(read/write)、Pull requests(write)、Metadata(read) |
| 令牌 | App JWT (RS256, 10min) → `POST /app/installations/{id}/access_tokens` 换 installation token (1h)，不落库，Redis 缓存 55min |

**功能**

1. 安装后回调携带 `installation_id`，写入 Connection.meta
2. 列出可访问仓库 → 用户选一个绑定到 Site，配置 `branch`（默认 main）与 `contentPath`（如 `content/blog`）
3. **读代码用于 SEO 分析**：抓取 `next.config.*`、`app/**/layout.tsx`、`app/**/page.tsx` 的 metadata 导出、`sitemap.ts`、`robots.ts`、`public/robots.txt`。用 Git Trees API 一次拿全树，再选择性取 blob，避免 N 次请求
4. **自动修复以 PR 形式交付**（关键设计）：AI 生成的改动不直接 push 到 main，而是
   `create branch (seo-fix/{auditId})` → `create blobs/tree/commit` → `open PR`，PR 描述里列出每条 Finding 与对应改动。用户在 GitHub 上 review 后合并。

### 4.4 Shopify

| 项 | 值 |
|---|---|
| 授权方式 | OAuth 2.0（Custom App / Public App），offline access token |
| Scope | `read_content, write_content, read_products, write_products, read_themes, write_themes, read_online_store_pages, write_online_store_pages` |
| API | Admin GraphQL API（版本固定 `2025-07`，季度评估升级）|
| 限流 | GraphQL 按 cost 计费，桶 1000 点、50/s 恢复。客户端解析 `extensions.cost.throttleStatus` 做自适应节流 |

**功能**

| 能力 | GraphQL 操作 |
|---|---|
| 列出 blog | `blogs(first:50)` |
| 发布文章 | `articleCreate` / `articleUpdate`（含 `metafields` 写 SEO）|
| 上传图片 | `stagedUploadsCreate` → PUT 到 staged target → `fileCreate` |
| 读写页面 SEO | `pages`, `pageUpdate`（`seo.title` / `seo.description`）|
| 产品 SEO | `products`, `productUpdate`（`seo`, `handle`, `descriptionHtml`）|
| 主题文件 | `themeFiles`（读 `layout/theme.liquid` 检查 canonical、hreflang、结构化数据）|

- 安装流程走标准 `/admin/oauth/authorize` → HMAC 校验 callback → `POST /admin/oauth/access_token`
- 注册强制 webhook：`app/uninstalled`、`shop/redact`、`customers/redact`、`customers/data_request`（Shopify 合规要求）

---

## 5. 功能模块

### 5.1 模块 1：GSC 数据面板

**路由** `/sites/[siteId]/overview`

**布局**

```
┌──────────────────────────────────────────────────────┐
│ [Site 切换 ▾]        [7D | 28D | 3M | 6M | 12M | 自定义] │
├──────────────────────────────────────────────────────┤
│ ┌────────┐┌────────┐┌────────┐┌────────┐             │
│ │ 点击   ││ 曝光   ││  CTR   ││ 平均排名│  ← KPI 卡    │
│ │ 1,284  ││ 45,392 ││ 2.83%  ││  18.4  │             │
│ │ ▲12.4% ││ ▲8.1%  ││ ▲0.3pt ││ ▼2.1   │  ← 环比     │
│ └────────┘└────────┘└────────┘└────────┘             │
├──────────────────────────────────────────────────────┤
│  双 Y 轴时序曲线（左:点击 右:曝光）                    │
│  可切换叠加 CTR / 平均排名；虚线为上一周期对比          │
├──────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐              │
│ │ Top Queries     │ │ Top Pages       │              │
│ │ 表格+迷你趋势   │ │ 表格+迷你趋势   │              │
│ └─────────────────┘ └─────────────────┘              │
│ ┌─────────────────┐ ┌─────────────────┐              │
│ │ 国家分布        │ │ 设备分布        │              │
│ └─────────────────┘ └─────────────────┘              │
└──────────────────────────────────────────────────────┘
```

**接口**

```
GET /api/sites/{siteId}/gsc/timeseries?from=&to=&compare=previous
→ { series: [{date, clicks, impressions, ctr, position}], 
    totals: {...}, previousTotals: {...} }

GET /api/sites/{siteId}/gsc/breakdown?dimension=query&from=&to=&limit=50&sort=clicks
→ { rows: [{ value, clicks, impressions, ctr, position, deltaClicks }] }
```

**衍生洞察卡片**（前端从已有数据计算，不额外调 AI）

- **机会关键词**：曝光 > 500 且 CTR < 1% 且排名 5–20 —— 标题/描述优化即可提升
- **临界页面**：平均排名 11–15 —— 距首页一步之遥
- **下滑预警**：近 7 日点击环比降幅 > 30% 的页面

> 这三类洞察同时作为 §5.2 SEO 诊断和 §5.3 内容生成的输入种子。

### 5.2 模块 2：AI SEO 诊断

**路由** `/sites/[siteId]/seo`

**触发**：每周一 06:00 定时 + 手动「立即诊断」按钮

**Pipeline（`seoAudit` job）**

```
1. 采集证据（并行）
   ├─ GSC: 近 28 天 totals / top 100 queries / top 100 pages / 机会关键词
   ├─ Cloudflare: zone settings、SSL、HTTPS 重定向、缓存策略
   ├─ GitHub: sitemap.ts / robots.ts / metadata 导出 / next.config
   ├─ Shopify: 页面与产品的 seo.title/seo.description 缺失或超长统计
   └─ 现场抓取: 站点最多 50 个 URL（取自 GSC top pages）
      → HTML 解析: title 长度、meta description、H1 数量、canonical、
        og/twitter tags、JSON-LD 结构化数据、img alt 缺失率、
        内链数、字数、hreflang
      → 与 Lighthouse CLI 集成取 CWV（可选，worker 内跑 headless chrome）
2. 规则引擎预处理（确定性检查，不消耗 token）
   → 生成结构化 issue 列表，例如 "12 个页面缺少 meta description"
3. AI 分析（唯一的 LLM 调用）
   输入: 规则引擎输出 + GSC 数据摘要 + 品牌上下文
   输出: 严格 JSON（见下）
4. 落库 SeoAudit + Finding，标记 autoFixable
5. 通知（邮件 / 飞书 webhook）
```

**关键设计：规则引擎在前，AI 在后。** 能用代码判定的（标题超 60 字符、缺 canonical、图片无 alt）绝不交给 AI，AI 只负责「优先级排序」「跨信号关联」「具体改写建议」。这样 token 成本可控且结果稳定。

**AI 输出 Schema**（用 tool_use / JSON mode 强制约束）

```json
{
  "score": 72,
  "summary": "站点技术基础良好，主要瓶颈在内容深度与内链结构。",
  "findings": [
    {
      "severity": "high",
      "category": "onpage",
      "url": "https://songolab.com/products/smart-cushion",
      "title": "核心产品页 meta description 缺失",
      "detail": "该页 28 天曝光 3,240 但 CTR 仅 0.9%，SERP 摘要由 Google 自动截取，未突出卖点。",
      "suggestion": "改写为：'Songo Smart Cushion — posture-sensing seat cushion with real-time app feedback. Ships worldwide.' (147 字符)",
      "autoFixable": true,
      "fixPayload": {
        "action": "shopify.pageUpdate",
        "resourceId": "gid://shopify/Page/123",
        "fields": { "seo.description": "..." }
      }
    }
  ],
  "priorityActions": ["...", "...", "..."]
}
```

**UI**

- 顶部：分数环形图 + 历次分数趋势折线
- Findings 列表：按 severity 分组，支持按 category 过滤
- 每条 Finding 右侧动作：`采纳并修复`（autoFixable 时）/ `生成内容解决`（跳 §5.3 并预填 keyword）/ `忽略`
- `采纳并修复` 的落点：Shopify 类直接调 API 写入；代码类聚合成一个 PR

### 5.3 模块 3：AI 内容生成

**路由** `/sites/[siteId]/content`

**站点调性配置**（`Site.brandVoice`，首次使用时引导填写，也可让 AI 读取现有 3–5 篇文章自动总结）

```json
{
  "tone": "professional but approachable, engineer-to-engineer",
  "audience": "EU/US procurement managers and hardware engineers",
  "language": "en-US",
  "coreTopics": ["smart hardware", "IoT sensing", "ODM manufacturing"],
  "keywords": ["posture sensor", "garden robot", "RTK positioning"],
  "forbidden": ["cheap", "guaranteed results", "夸大宣传用语"],
  "wordCountRange": [1200, 1800],
  "referenceUrls": ["https://songolab.com/blog/..."],
  "imageStyle": "clean product photography, soft studio lighting, no text overlay"
}
```

**生成流程（`contentGenerate` job）**

```
Step 1  选题
  输入: GSC 机会关键词 + 未覆盖的搜索词 + 已有文章列表（去重）
  输出: 5 个候选选题 { title, targetKeyword, searchIntent, angle, estValue }
  → 用户勾选，或开启「自动模式」取 estValue 最高的一个

Step 2  大纲
  输出: H2/H3 结构 + 每节要点 + 关键词分布计划 + 内链锚点建议
  → 用户可编辑

Step 3  正文
  输出: Markdown 全文 + metaTitle(≤60) + metaDesc(≤155) + slug + excerpt
  约束: 关键词密度 1–2%、每 300 字一个小标题、含 FAQ 段（吃 PAA 流量）、
        自动插入 2–4 条站内链接（从已有文章/产品页中检索）

Step 4  配图
  a) 从正文中提取 1 个封面 + 2–3 个插图的图像 prompt（结合 brandVoice.imageStyle）
  b) 调图像生成 API → 得到图片
  c) 上传 R2 → 得到 CDN URL
  d) 生成 alt text（包含目标关键词的自然表述）
  e) 在 Markdown 中把占位符 {{IMAGE_1}} 替换为实际 URL

Step 5  自检
  用小模型跑一遍 checklist: 事实性声明是否有依据、是否触发 forbidden 词、
  meta 长度、slug 合规、是否与已有文章重复度过高（embedding 余弦 > 0.85 则打回）

Step 6  落库为 Article(status=draft)，通知用户 review
```

**定时策略**：可配置「每周 N 篇」，scheduler 在周一生成选题，用户 review 后排入发布队列。**默认不自动发布**，必须人工确认（`settings.autoPublish` 可开启）。

**编辑器 UI**：左侧 Markdown 编辑（CodeMirror）+ 右侧实时预览；顶部 SEO 检查条（关键词密度、可读性、meta 长度、图片 alt 覆盖率）；底部发布目标多选（Shopify blog / GitHub repo / Cloudflare Worker）。

### 5.4 模块 4：Shopify 发布与 SEO 维护

**发布 Blog**

```
1. Markdown → HTML（remark + rehype，保留语义标签）
2. 图片：已在 R2 的直接引用 CDN URL；或 stagedUploadsCreate 上传到 Shopify Files
3. articleCreate mutation:
   { blogId, title, handle(=slug), body(html), summary(=excerpt),
     image: { url, altText }, tags, publishedAt, author,
     metafields: [{ namespace:"global", key:"description_tag", value: metaDesc },
                  { namespace:"global", key:"title_tag", value: metaTitle }] }
4. 成功后写入 PublishTarget，并触发 Cloudflare purge + GSC URL 提交（可选）
```

**页面 SEO 巡检**（`shopifySeoScan`，每周随 SEO 诊断一起跑）

| 检查项 | 判定 |
|---|---|
| `seo.title` | 缺失 / >60 字符 / 与其他页重复 |
| `seo.description` | 缺失 / >155 字符 / 与其他页重复 |
| `handle` | 含无意义参数、过长、非语义 |
| 产品描述 | 字数 < 100、无 H2 结构 |
| 图片 alt | 缺失率 |
| theme.liquid | canonical 标签、hreflang、Organization/Product JSON-LD |

一键修复：批量选中 → AI 生成建议 → 用户确认 diff → 批量 `pageUpdate` / `productUpdate`。**所有写操作前先快照原值存入 JobRun.logs，支持回滚。**

### 5.5 模块 5：Cloudflare Worker 静态页推送

**适用场景**：落地页 / 活动页 / AI 生成的独立内容页，不走 Shopify 主题、不进 Next.js 仓库。

**实现方式**：Workers Static Assets

```
1. 内容渲染: Article → 静态 HTML（套 Site 配置的 layout 模板，含
   完整 meta / OG / JSON-LD Article schema）
2. 打包: index.html + assets（图片走 R2 CDN 外链，不打进 bundle）
3. 上传: PUT /accounts/{accountId}/workers/scripts/{scriptName}
   multipart，metadata 中声明 assets 配置与 compatibility_date
4. 路由: PUT /zones/{zoneId}/workers/routes  →  pattern: "example.com/lp/*"
5. 缓存: POST /zones/{zoneId}/purge_cache { files: [url] }
6. 记录 PublishTarget(provider=CLOUDFLARE, externalUrl)
```

**Worker 命名规范**：`{siteSlug}-{pageSlug}`，避免冲突。**每个 Site 一个 Worker、内部按 path 分发**比每页一个 Worker 更好（免费版 100 script 上限）。

**UI**：Deploy 页面列出该 Site 已部署的所有静态页，显示路由 pattern、最后部署时间、状态，支持「重新部署」「下线」。

### 5.6 模块 6：网页可视化编辑（本期不做）

预留：`Article.bodyMd` 已可承载结构化内容；未来引入块编辑器时改为 `bodyJson`（Tiptap/Lexical schema）并保留 `bodyMd` 作为导出格式。路由 `/sites/[siteId]/editor` 先做占位页。

---

## 6. AI 接入层

### 6.1 配置（硬编码于环境变量，不暴露给前端）

```env
AI_BASE_URL=https://your-relay.example.com/v1   # New API / LiteLLM 中转
AI_API_KEY=sk-xxxx
AI_MODEL_ANALYSIS=claude-sonnet-4-6             # SEO 诊断、正文生成
AI_MODEL_FAST=claude-haiku-4-5                  # 选题、自检、alt text
AI_MODEL_IMAGE=gpt-image-1                      # 配图
AI_MAX_MONTHLY_USD=50                           # 预算硬上限
```

### 6.2 客户端封装 `lib/ai/client.ts`

```ts
interface AiCallOptions {
  task: 'seo_audit' | 'topic_ideation' | 'outline' | 'article' | 'self_check' | 'alt_text';
  schema?: ZodSchema;        // 传入则强制 JSON 输出并校验
  maxTokens?: number;
  temperature?: number;
}
```

要求：
- **结构化输出**：所有需要 JSON 的调用用 tool_use / response_format 约束，服务端再用 Zod 二次校验；校验失败重试 1 次（附上错误信息），仍失败则 job 标记 failed 并保留原始响应
- **成本记账**：每次调用记录 model / input_tokens / output_tokens / 估算成本到 `JobRun.logs`，Settings 页展示月度用量；超 `AI_MAX_MONTHLY_USD` 则暂停所有定时任务并告警
- **Prompt 版本化**：`lib/ai/prompts/{task}.v{n}.ts`，Article.aiMeta 记录 promptVersion，便于 A/B 与回溯
- **重试**：429/5xx 指数退避 3 次；超时 180s

### 6.3 上下文构造原则

不要把原始 API 响应整包塞给模型。每类任务有专门的 **evidence packer**：把 GSC 数据聚合成 top-N 摘要、把 HTML 抽成结构化字段、把代码只取相关片段。目标单次输入 < 30k tokens。

---

## 7. 安全

| 项 | 措施 |
|---|---|
| 凭证存储 | AES-256-GCM 加密后存 Postgres，主密钥 `ENCRYPTION_KEY` 仅存于环境变量；每条记录独立 IV |
| OAuth state | 随机 32 字节存 Redis，TTL 10min，一次性消费；PKCE 全流程启用 |
| 回调校验 | Shopify 校验 HMAC；GitHub webhook 校验签名；所有 redirect_uri 白名单 |
| 令牌最小权限 | GSC 只读；GitHub App 限定仓库；Cloudflare 引导用户建 scoped token |
| 写操作确认 | 所有对外写入（Shopify 更新、GitHub PR、Worker 部署）默认需要用户显式确认，且保留原值快照 |
| 日志脱敏 | token / api key 在日志中一律 `sk-***` 掩码 |
| 前端 | 任何第三方 token 绝不下发到浏览器，所有第三方调用经服务端代理 |
| 会话 | httpOnly + Secure + SameSite=Lax cookie，JWT 24h |

---

## 8. 定时任务

| Job | 频率 | 说明 |
|---|---|---|
| `gscSync` | 每日 04:00 UTC | 滚动同步 T-1 ~ T-5，全部 Site |
| `tokenRefresh` | 每 30min | 扫描 expiresAt < now+1h 的 Connection 主动刷新 |
| `seoAudit` | 每周一 06:00 | 全站诊断 |
| `shopifySeoScan` | 每周一 06:30 | 随 audit 后跑 |
| `contentIdeation` | 每周一 09:00 | 生成选题候选，等待用户确认 |
| `publishScheduled` | 每 15min | 扫描 `status=scheduled && scheduledAt <= now` 的 Article |
| `healthCheck` | 每 6h | 各 Connection 探活，失效则置 status=expired 并通知 |

全部用 BullMQ repeatable job，`jobId` 幂等去重，失败进 DLQ 并告警。

---

## 9. 交付计划

| 阶段 | 范围 | 验收标准 |
|---|---|---|
| **P0（1–2 周）** | 项目骨架、登录、Site CRUD、Google OAuth、gscSync、Overview 曲线页 | 能看到 songolab.com 近 90 天的点击/曝光曲线与 Top Queries |
| **P1（1–2 周）** | Cloudflare token 接入、zone 状态页、GitHub App 接入与代码抓取、规则引擎 + AI SEO 诊断 | 手动触发一次诊断，产出带优先级的 Findings 列表 |
| **P2（2–3 周）** | brandVoice 配置、选题→大纲→正文→配图全链路、Markdown 编辑器 | 从一个 GSC 机会关键词生成一篇带图的完整 blog draft |
| **P3（1–2 周）** | Shopify OAuth、blog 发布、页面 SEO 巡检与批量修复 | 一键把 draft 发到 Shopify blog，SEO 字段完整 |
| **P4（1 周）** | Cloudflare Worker 静态页推送、缓存清除、GitHub 自动修复 PR | 落地页部署到 `/lp/*` 并可访问 |
| **P5** | 可视化编辑器、多用户、成本看板细化 | — |

**P0 优先级最高**：GSC 曲线是每天都会看的东西，先跑通数据管道，其余模块都依赖它作为输入。

---

## 10. 待确认事项

1. **Shopify 应用形态**：只服务自己的店 → Custom App（最简单，无需过审）；未来要给别人用 → Public App（需 Partner 账号 + 应用审核 + 合规 webhook）。默认按 Custom App 实现，代码结构预留 Public App 路径。
2. **图像生成供应商**：走中转还是直连？涉及国内访问与合规，需确认 relay 是否支持图像接口。
3. **是否需要 Lighthouse/CWV**：worker 内跑 headless chrome 会显著增加镜像体积（+300MB）与内存占用，可用 PageSpeed Insights API 替代（免费、25000 req/day）。**建议先用 PSI API。**
4. **多语言站点**：songolab.com 若有多语言版本，GSC 数据与内容生成需要按语言维度拆分，需在 Site 模型上加 `locales[]`。
