# AI 网关配置

SEO 诊断分两层：**规则引擎**（确定性检查，不用 AI）和 **AI 层**（优先级排序、跨信号关联、改写建议）。

**不配 AI 也能跑**——你会拿到全部规则发现，只是没有优先级排序和改写文案。所以先跑一次看看，再决定要不要接。

---

## 1. 一个前提：必须是 Anthropic 兼容端点

这里用的是**官方 `@anthropic-ai/sdk`**，不是 OpenAI 兼容的 shim。原因是官方 SDK 才有结构化输出（`output_config.format`）、adaptive thinking、refusal 处理这些东西，用 OpenAI shim 会全丢掉。

所以你的中转必须提供 **`/v1/messages`**（Anthropic 原生），不能只有 `/v1/chat/completions`。

好消息是 **New API 和 LiteLLM 默认都提供**：

| 中转 | Anthropic 端点 | 说明 |
|---|---|---|
| New API | `/v1/messages` | 默认开启 |
| LiteLLM | `/anthropic/v1/messages` | `AI_BASE_URL` 填到 `/anthropic` 为止 |
| 官方直连 | `https://api.anthropic.com` | `AI_BASE_URL` 留空即可 |

> 如果你的中转**只有** OpenAI 格式，告诉我，我需要换一套实现（会损失结构化输出，得改用 tool_use 兜底）。

## 2. 填 .env

```env
# 留空 = 直连 api.anthropic.com；国内需要中转就填中转地址
AI_BASE_URL="https://your-relay.example.com"
AI_API_KEY="sk-xxxx"

AI_MODEL_ANALYSIS="claude-opus-5"
AI_MODEL_FAST="claude-haiku-4-5"
AI_EFFORT="medium"
AI_MAX_MONTHLY_USD="50"
```

改完**重启 worker**（`npm run worker`）——环境变量只在启动时读。

## 3. 验证

```bash
npm run ai:check
```

会发一个最小请求，报告能否连通、用的哪个模型、这次花了多少钱。

---

## 模型和成本

| 模型 | 输入 $/M | 输出 $/M | 适合 |
|---|---|---|---|
| `claude-opus-5` | $5 | $25 | 默认。诊断质量最高 |
| `claude-sonnet-5` | $3 | $15 | 想省钱先试这个，跑几次对比结论质量 |
| `claude-haiku-4-5` | $1 | $5 | 只用于选题/自检这类轻任务 |

一次 SEO 诊断的输入大约 8–15k tokens（证据包已经做过聚合，不会把原始 API 响应整包塞进去），输出 2–4k。按 opus-5 算大概 **$0.15–0.25 一次**。每周一次的话一个月一块钱都不到，`AI_MAX_MONTHLY_USD=50` 是很宽的上限。

`AI_EFFORT` 控制思考深度：`low`/`medium`/`high`/`xhigh`/`max`。默认 `medium`。诊断结论觉得浅就往上调，先调这个再改模型。

## 成本记账

每次调用的 model / input_tokens / output_tokens / 估算成本都写进 `SeoAudit.aiMeta`。当月累计花费达到 `AI_MAX_MONTHLY_USD` 时，新的诊断会拒绝启动并说明原因——不会静默烧钱。

## 常见问题

| 现象 | 原因 |
|---|---|
| 诊断跑完但 `aiUsed: false` | `AI_API_KEY` 没填，或改完没重启 worker |
| `404` / `Not Found` | 中转没开 Anthropic 端点，或 `AI_BASE_URL` 多写了 `/v1`（SDK 会自己拼 `/v1/messages`） |
| `fetch failed` / 超时 | 又是代理问题。worker 由 `npm run worker` 启动才带 `NODE_USE_ENV_PROXY=1` |
| `Schema validation failed` 两次后失败 | 模型输出不符合 schema。中转如果不支持 `output_config.format`，会退化成自由文本 —— 换支持的中转，或告诉我改用 tool_use |
| `The model declined this request` | 安全分类器拒绝了。诊断内容触发了误判，换个站点或稍后重试 |
