# 邮件报告配置（Resend）

诊断跑完后把结果发到你的邮箱。**不配也不影响任何功能**——不配就是不发。

---

## 1. 一条硬规则：只发给验证过的邮箱

填进去的邮箱**不会立刻生效**。填完会往那个地址发一封确认信，点开里面的链接才算数。

这不是为了麻烦你，是为了防止这个应用变成一个「登录后可以往任意邮箱发信」的工具。所以：

- 邮箱地址在确认之前只存在于一张待确认表里，**不会写进你的账号**
- 没确认过的地址，一封报告都不会发
- 确认链接 **24 小时有效、只能用一次**
- 数据库里存的是 token 的 SHA-256,不是 token 本身——库被拖走也拿不到可用的链接

## 2. 在 Resend 里验证一个域名

去 [resend.com](https://resend.com) 注册，然后 **Domains → Add Domain**，加 `roarland.net`（或你想用的域名）。

它会给你几条 DNS 记录（SPF、DKIM，通常还有一条 MX 用于退信）。加到 Cloudflare DNS 里，等它变成 Verified。

> 这一步不能跳过。Resend 只允许从已验证的域名发信，`EMAIL_FROM` 填别的会在发送时被拒。

拿到 API key：**API Keys → Create API Key**，权限选 `Sending access` 就够。

## 3. 填 .env

```env
RESEND_API_KEY="re_xxxxxxxx"
EMAIL_FROM="ROARLAND <dash@roarland.net>"
```

`EMAIL_FROM` 的域名必须和上一步验证的域名一致。`dash@` 这个前缀不需要真实存在，也不需要能收信。

改完**重启 web 和 worker**——环境变量只在启动时读：

```bash
docker compose --env-file .env.production up -d web worker
```

## 4. 用起来

1. 打开 `/account`，找到「通知」
2. 填邮箱 → 「发送验证邮件」
3. 去那个邮箱点确认链接（会跳回 `/account` 并提示已确认）
4. 之后每次诊断跑完，报告自动发过去

报告里有：得分和环比、摘要、按严重度的发现数量、最该先看的几条、本次 AI 花费，以及一个直接跳到那次运行的链接。

想暂时停掉但保留邮箱：取消勾选「诊断完成后邮件通知我」。想彻底移除：点「移除」。

邮件语言跟随你在界面上选的语言——切换语言时会记到账号上，worker 发信时读它。

---

## 常见问题

**填完没收到确认信**

先看 Resend 后台的 **Logs**，能看到每封信的投递状态。常见原因：

- 域名还没 Verified（Resend 会直接拒绝，界面上会显示报错原文）
- 进了垃圾箱——SPF/DKIM 没配全的话很容易被判垃圾
- `EMAIL_FROM` 的域名和验证的域名不一致

**报告没发出来**

worker 日志里会写明原因，一行一条：

```bash
docker compose --env-file .env.production logs worker | grep "no report sent"
```

可能是 `email not configured`、`address not verified`、`reports turned off`，或者 Resend 返回的具体错误。

**发信失败会不会让诊断失败？**

不会。发信在诊断写库**之后**独立执行，任何异常只记日志。丢掉一次 6 分钟的抓取结果只因为邮件没发出去，是不可接受的。
