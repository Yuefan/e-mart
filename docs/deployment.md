# 部署

## 先说 Cloudflare Worker：不行

你问的两个选项里，Cloudflare Workers **不是"部署"，是重写**。三个硬阻塞：

| 阻塞 | 说明 |
|---|---|
| `better-sqlite3` 是原生模块 | Workers 是 V8 isolate，跑不了 native addon。数据层要整个换成 D1 或 Hyperdrive + Postgres |
| 常驻 worker 进程 | Workers 没有常驻进程。轮询循环要拆成 Cron Triggers + Queues / Workflows |
| 一次审计 6.5 分钟、50+ 子请求 | Paid 版单次调用 CPU 上限 5 分钟；Free 版子请求上限 50，光抓取就爆。要改写成 Workflow 分步执行 |

**Cloudflare Containers** 能跑现成镜像，但它是「持久身份、**磁盘易失**」——容器停了 SQLite 文件就没了，还是得外挂数据库；`sleepAfter` 也和常驻 worker 冲突。目前 beta，无 SLA。

spec §2.2 本来就选了自建 VPS，理由正是这些。下面走 VPS。

> 真要上 Cloudflare 的话，改造量大致是：`prisma/schema.prisma` 换 D1 provider、`src/lib/prisma.ts` 换 `@prisma/adapter-d1`、`src/worker/` 整个删掉改成 Cron Trigger + Queue consumer、`runSeoAudit` 拆成 Workflow 的 step。评估成本前先想清楚值不值——这套东西一天跑几次，VPS 上一台 1C2G 绰绰有余。

---

## VPS 部署

### 需要什么

- 一台能跑 Docker 的 Linux VPS（1 核 2G 足够）
- 一个指向它的域名（Caddy 自动签 TLS 证书）
- 80 和 443 端口可达

### 1. 准备 .env.production

在服务器上，仓库根目录：

```bash
cp .env.example .env.production
node -e "console.log('ENCRYPTION_KEY=\"'+require('crypto').randomBytes(32).toString('hex')+'\"')" >> .env.production
node -e "console.log('SESSION_SECRET=\"'+require('crypto').randomBytes(32).toString('hex')+'\"')" >> .env.production
```

然后编辑，把这几项填对：

```env
APP_DOMAIN="dash.example.com"          # 给 Caddy 签证书用
APP_URL="https://dash.example.com"     # 必须是公网 https 地址
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
AI_BASE_URL="https://your-relay.example.com"
AI_API_KEY="sk-..."
```

**`DATABASE_URL` 不用填**——compose 里写死成 `file:/data/app.db`（挂载卷）。原因见下面「踩过的坑」。

### 2. Google Cloud 加一条 redirect URI

到 [OAuth 客户端](https://console.cloud.google.com/auth/clients) 里，**新增**（不是替换）：

```
https://dash.example.com/api/connections/google/callback
```

本地那条 `http://localhost:3000/...` 留着，两边都能用。

### 3. 起服务

```bash
docker compose --env-file .env.production up -d --build
```

三个服务：`migrate` 跑一次迁移就退出 → `web`（Next.js standalone）和 `worker`（定时任务 + 队列）起来 → `caddy` 签证书并反代。

```bash
docker compose logs -f worker    # 看定时任务
docker compose ps                # 看健康状态
```

### 4. 验一下

```bash
curl -s https://dash.example.com/api/diagnostics/google
```

要看到 `"reachable": true`。如果服务器在国内需要代理，在 `.env.production` 里设 `HTTPS_PROXY`——`NODE_USE_ENV_PROXY=1` 已经在 Dockerfile 里了。

---

## 踩过的坑（都已验证）

### DATABASE_URL 生产环境必须写绝对路径

standalone 打包出来的服务，**工作目录是 `.next/standalone/`，不是项目根目录**。`file:./prisma/dev.db` 这种相对路径会指到一个不存在的地方，所有页面 500，报 `Cannot open database because the directory does not exist`。

compose 里已经写死 `file:/data/app.db`（挂载卷的绝对路径）。自己手动部署时也要用绝对路径。

### 必须从干净的 .next 构建

dev server 会在 `.next/dev/types/` 留下生成的路由类型。这些文件过期后，`next build` 的类型检查阶段会在**你根本没改过的生成文件**上报语法错误。Dockerfile 里构建前先 `rm -rf .next`。

### standalone 不含 static 和 public

Next 只把追踪到的依赖放进 `.next/standalone`。`.next/static` 和 `public/` 要另外拷。Dockerfile 已经处理了。

### 原生模块必须在镜像里编译

`better-sqlite3` 会编译出平台相关的 `.node` 文件。**不要**把本机的 `node_modules` 拷进镜像——`.dockerignore` 已经排除了。镜像里 `npm ci` 时会为 linux 重新编译，所以 deps 阶段装了 `python3 make g++`。

### worker 不能跑多份

`docker-compose.yml` 里锁了 `replicas: 1`。队列的领取锁保证的是**正确性**（不会重复执行），不是吞吐；两个 worker 还会争抢同一个 SQLite 文件。

---

## 备份

整个应用状态就是一个 SQLite 文件——加密后的凭证、GSC 数据、诊断结果、草稿全在里面。

```bash
docker compose exec -T web sh -c 'cat /data/app.db' > backup-$(date +%F).db
```

更规范的做法是用 SQLite 的在线备份（避免写入中途拷贝）：

```bash
docker compose run --rm toolbox \
  npx prisma db execute --stdin <<< "VACUUM INTO '/data/backup.db';"
```

**丢了 `ENCRYPTION_KEY` 就等于丢了所有第三方凭证**——数据库还在，但里面的 token 解不开，只能重新授权。把它和数据库分开备份。

---

## 更新

```bash
git pull
docker compose --env-file .env.production up -d --build
```

`migrate` 服务每次都会先跑 `prisma migrate deploy`，`web` 和 `worker` 等它成功退出才启动。

---

## 不用 Docker 的话

```bash
npm ci
npm run build
npx prisma migrate deploy

# 两个常驻进程，各自用 systemd 管
DATABASE_URL="file:/srv/app/data/app.db" node .next/standalone/server.js
DATABASE_URL="file:/srv/app/data/app.db" npm run worker
```

注意 standalone 那份要自己把 `.next/static` 和 `public/` 拷进 `.next/standalone/`，以及 `DATABASE_URL` 用绝对路径。

---

## 关于换 Postgres

spec §2.1 写的是 Postgres。单人用 SQLite 完全够——一次同步几千行，一次诊断几十行。真要换：

1. `prisma/schema.prisma` 的 `provider` 改 `postgresql`
2. `scopes` 从空格分隔字符串还原成 `String[]`，`meta`/`config`/`logs`/`checks` 等还原成 `Json`，`provider` 还原成 enum
3. `src/lib/prisma.ts` 换成 `@prisma/adapter-pg`
4. compose 里加一个 postgres 服务

`src/lib/db-url.ts` 对非 `file:` 的 URL 是空操作，不用改。
