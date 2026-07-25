# Google OAuth + Search Console 配置指引

跑通这一步之后，`Continue with Google` 就能登录并拉到你的 GSC 数据。全程免费，大约 5 分钟。

---

## 1. 建一个 Google Cloud 项目

1. 打开 https://console.cloud.google.com/projectcreate
2. 项目名随便填，比如 `ai-marketing-dashboard`，创建后在顶部项目选择器里切过去。

## 2. 启用 Search Console API

1. 打开 https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
2. 确认右上角是刚建的项目，点 **启用 / Enable**。

> 注意是 **Google Search Console API**，不是 "Search Console API (legacy)"，也不是 Custom Search。

## 3. 配置 OAuth 同意屏幕

打开 https://console.cloud.google.com/auth/overview

1. **User Type** 选 **External（外部）**。
   > 只有 Google Workspace 组织账号才有 Internal 选项。选 External 不代表要过审——只要不发布、保持 Testing 状态即可。
2. 应用名称、支持邮箱、开发者邮箱填自己的邮箱。
3. **Scopes**：可以先跳过，代码里会在授权时动态请求。
4. **Test users**：把你自己的 Google 账号（拥有 GSC 资源的那个）加进去。**这一步不能漏**，Testing 状态下只有测试用户能授权。
5. 发布状态保持 **Testing**。

> Testing 模式下 refresh_token 有效期 **7 天**，过期后重新点一次 `Re-authorize` 即可。
> 想要长期有效，把应用状态改成 **In production**（个人用途、不申请敏感 scope 的情况下通常无需人工审核，但会多一个「未验证应用」的警告页，点「高级 → 继续」即可）。

## 4. 创建 OAuth 客户端

打开 https://console.cloud.google.com/auth/clients → **Create client**

- **Application type**：`Web application`
- **Name**：随便，比如 `dashboard-local`
- **Authorized redirect URIs**：新增一条，必须**一字不差**：

  ```
  http://localhost:3000/api/connections/google/callback
  ```

  > 部署到线上后，再加一条 `https://你的域名/api/connections/google/callback`，
  > 同时把 `.env` 里的 `APP_URL` 改成对应域名。

创建完会弹出 **Client ID** 和 **Client secret**，复制备用。

## 5. 填进 .env

项目根目录的 `.env`：

```env
GOOGLE_CLIENT_ID="1234567890-xxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
```

`ENCRYPTION_KEY` / `SESSION_SECRET` 已经由 `npm run setup:env` 生成好了，不用动。

改完 **重启 `npm run dev`**——Next.js 只在启动时读环境变量。

## 6. 验证

1. 打开 http://localhost:3000 → 跳到 `/login`
2. 点 **Continue with Google** → 选账号 → 勾选 Search Console 权限
3. 回到 `/connections`，应该列出该账号下所有已验证的 GSC 资源
4. 挑一个点 **Add as site** → 自动回补 90 天数据 → 跳转到曲线页

---

## 常见问题

| 报错 | 原因 |
|---|---|
| `redirect_uri_mismatch` | 第 4 步的 URI 和 `APP_URL` 拼出来的不一致。注意 http/https、端口、结尾不能有斜杠 |
| `access_denied` | 你的账号没加进 Test users（第 3 步），或者在同意页点了取消 |
| `google_unreachable` | **服务端连不上 Google**。浏览器走系统代理不代表 Node 走。用 `npm run dev` 启动（已带 `NODE_USE_ENV_PROXY=1`），且 shell 里要有 `HTTPS_PROXY`。自检：`curl http://localhost:3000/api/diagnostics/google` |
| `token_exchange_failed` | Google 明确拒绝了这个 code。页面上会附带 Google 返回的原文，按它排查：`invalid_client` = secret 错，`invalid_grant` = code 过期/重复使用，`redirect_uri_mismatch` = 第 4 步的 URI 不一致 |
| 属性列表是空的 | 这个 Google 账号在 Search Console 里没有已验证的资源。先去 https://search.google.com/search-console 验证站点 |
| `invalid_grant` / 突然要重新授权 | Testing 状态下 refresh_token 7 天过期。点 `Re-authorize`，或把应用改成 In production |

## 权限说明

应用只请求这些 scope：

- `openid` / `email` / `profile` —— 用来创建本地账号（登录即授权，一步到位）
- `https://www.googleapis.com/auth/webmasters.readonly` —— **只读** Search Console

只读 scope 意味着这个应用在任何情况下都无法修改你的 GSC 设置。access token 和 refresh token 都用 AES-256-GCM 加密后落库，任何时候都不会下发到浏览器。
