# 部署

数据库是 **PostgreSQL**。Prisma 一个 schema 只能有一个 provider，所以本地开发也用 Postgres——下面有不装 Docker 的办法。

## 先说 Cloudflare Worker：不行

| 阻塞 | 说明 |
|---|---|
| 常驻 worker 进程 | Workers 没有常驻进程。轮询循环要拆成 Cron Triggers + Queues / Workflows |
| 一次审计 6.5 分钟、50+ 子请求 | Paid 版单次调用 CPU 上限 5 分钟；Free 版子请求上限 50，光抓取就爆。要改写成 Workflow 分步执行 |
| Prisma + Postgres | Workers 连 Postgres 要走 Hyperdrive，多一层，且连接池语义不同 |

> 换成 Postgres 之后，原来"原生模块跑不了"这条不成立了（`pg` 是纯 JS）。但前两条还在，而且是架构级的。

**Cloudflare Containers** 能跑镜像，但「持久身份、**磁盘易失**」，目前 beta 无 SLA。数据库反正是外挂的，所以磁盘这条影响变小了——真想试可以，但 `sleepAfter` 仍然和常驻 worker 冲突。

spec §2.2 选的是自建 VPS。下面走这条。

---

## VPS 部署：一条命令

在 VPS 上（Debian / Ubuntu）：

```bash
curl -fsSL https://raw.githubusercontent.com/Yuefan/e-mart/main/scripts/deploy-vps.sh -o deploy.sh
less deploy.sh            # 先读一遍再用 root 跑
sudo bash deploy.sh
```

脚本会：装 Docker（如果没有）、克隆仓库、**生成密钥**、交互式问你域名和 Google / AI 凭据、起服务、验证连通性。

**可以重复运行**：已存在的 `.env.production` 不会被覆盖。这点很重要——重新生成 `ENCRYPTION_KEY` 会让库里所有第三方 token 永久解不开。

下面是手工步骤，想自己控制每一步的话看这个。

### 需要什么

- 一台能跑 Docker 的 Linux VPS（1 核 2G 够用，Postgres 不重）
- 一个指向它的域名（Caddy 自动签 TLS）
- 80 / 443 可达

### 1. 准备 .env.production

```bash
cp .env.example .env.production
npm run setup:env      # 生成 ENCRYPTION_KEY / SESSION_SECRET / POSTGRES_PASSWORD
```

`setup:env` 写的是 `.env`，把那三行挪到 `.env.production`，然后补齐：

```env
APP_DOMAIN="dash.example.com"
APP_URL="https://dash.example.com"
POSTGRES_PASSWORD="<刚生成的>"
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
AI_BASE_URL="https://your-relay.example.com"
AI_API_KEY="sk-..."
```

**`DATABASE_URL` 不用填**——compose 从 `POSTGRES_*` 拼出来，指向内部的 `db` 服务。

### 2. Google Cloud 加一条 redirect URI

到 [OAuth 客户端](https://console.cloud.google.com/auth/clients)，**新增**（不是替换）：

```
https://dash.example.com/api/connections/google/callback
```

### 3. 起服务

```bash
docker compose --env-file .env.production up -d --build
```

顺序是 `db` 健康 → `migrate` 建表后退出 → `web` + `worker` 起来 → `caddy` 签证书。

```bash
docker compose logs -f worker
docker compose ps
```

### 4. 验一下

```bash
curl -s https://dash.example.com/api/diagnostics/google
```

要看到 `"reachable": true`。服务器在国内需要代理的话，`.env.production` 里设 `HTTPS_PROXY`（`NODE_USE_ENV_PROXY=1` 已在 Dockerfile 里）。注意 compose 默认把 `db` 加进了 `NO_PROXY`——数据库连接绝不能走代理。

---

## 本地开发（不用 Docker 也行）

三选一：

**a. 用 compose 只起数据库**（有 Docker 的话最省事）

```bash
docker compose --env-file .env up -d db
# .env 里 DATABASE_URL 指向 localhost:5432 —— 需要把 db 的端口发布出来
```

**b. 托管 Postgres**（没 Docker 时用这个）

[Neon](https://neon.tech) 之类的免费档就够。把连接串填进 `.env` 的 `DATABASE_URL` 即可，注意要带 `?sslmode=require`。

**c. 本机装 Postgres**

装完建库，连接串填进 `.env`。

三种都一样，建表：

```bash
npm run db:migrate      # 开发环境，会生成新迁移
# 或
npx prisma migrate deploy   # 只应用已有迁移
```

---

## 踩过的坑（都已验证）

### 必须从干净的 .next 构建

dev server 会在 `.next/dev/types/` 留下生成的路由类型。过期后 `next build` 的类型检查会在**你根本没改过的生成文件**上报语法错误。Dockerfile 里构建前先 `rm -rf .next`。

### standalone 不含 static 和 public

Next 只把追踪到的依赖放进 `.next/standalone`。`.next/static` 和 `public/` 要另外拷，Dockerfile 已处理。

### 配置里的 path.resolve 会把整个项目打进包

`next.config.ts` 里任何文件系统调用都会让 Turbopack 判定无法静态分析，把 `src`、`docs`、spec 全拷进 standalone（34MB → 29MB 的差别）。`src/lib/db-url.ts` 里那处运行时路径解析加了 `turbopackIgnore` 注释。

### GscDaily.date 是 timestamp 不是 date

看着该用 `@db.Date`，但 node-postgres 把 `DATE` 列按**本地时区**解析。服务器在 +08:00 时，`toISOString().slice(0,10)` 会退一天——而日期是这张表主键的一部分。schema 里有注释说明。

### worker 不能跑多份

compose 里锁了 `replicas: 1`。队列的领取锁保证的是正确性，不是吞吐。

---

## 备份

```bash
docker compose exec -T db pg_dump -U app -d marketing --clean --if-exists \
  | gzip > backup-$(date +%F).sql.gz
```

恢复：

```bash
gunzip -c backup-2026-07-25.sql.gz | docker compose exec -T db psql -U app -d marketing
```

**丢了 `ENCRYPTION_KEY` 就等于丢了所有第三方凭证**——数据库还在，但里面的 token 解不开，只能重新授权。和数据库备份分开放。

---

## 更新

```bash
git pull
docker compose --env-file .env.production up -d --build
```

`migrate` 每次先跑 `prisma migrate deploy`，`web` 和 `worker` 等它成功退出才启动。

改了 schema 的话，本地 `npm run db:migrate` 生成迁移文件、提交，服务器上 `migrate` 服务会自动应用。

---

## 从 SQLite 迁过来

如果你本地那份 SQLite 里有想留的数据：GSC 数据**不用迁**，重新授权后 `Sync` 一次就从 Google 拉回来了。诊断结果和草稿要留的话，用 `npx prisma studio` 分别连两个库手工搬，量不大。

凭证不用迁——重新走一次 Google 授权即可，而且更干净（新库、新 refresh token）。

---

## 不用 Docker 的话

```bash
npm ci
npm run build
npx prisma migrate deploy

# 两个常驻进程，各自用 systemd 管
DATABASE_URL="postgresql://..." node .next/standalone/server.js
DATABASE_URL="postgresql://..." npm run worker
```

standalone 那份记得自己把 `.next/static` 和 `public/` 拷进 `.next/standalone/`。
