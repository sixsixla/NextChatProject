# AGENTS.md — RemoteAI 项目上下文

## 项目概述

基于 [ChatGPT-Next-Web (NextChat)](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) 二次开发，适配 DeepSeek V4 系列模型，增加联网搜索功能。部署在 Vercel，支持 PWA 移动端使用。

- **仓库**: `github.com/sixsixla/NextChatProject`
- **部署**: Vercel → `next-chat-project-theta.vercel.app`
- **目标**: 免费、自定义 API Key、安卓手机上使用的 AI 聊天工具

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | SCSS Modules |
| 状态管理 | Zustand |
| 包管理器 | Yarn 1.x |
| 部署 | Vercel (Serverless + Edge) |

## 目录结构

```
app/
├── api/
│   ├── search/route.ts     # ★ 联网搜索代理（Tavily → SearXNG 备选）
│   ├── deepseek.ts          # DeepSeek API 代理（/api/deepseek）
│   ├── [provider]/          # 通用提供商代理路由
│   └── config/route.ts      # 服务端配置下发（needCode等）
├── client/
│   ├── api.ts               # 客户端 API 抽象层 + 访问码校验
│   └── platforms/
│       ├── deepseek.ts      # ★ DeepSeek 客户端实现（流式/思考链）
│       ├── openai.ts        # OpenAI 客户端
│       └── ...              # 其他 14 个平台实现
├── components/
│   ├── chat.tsx             # ★ 聊天主组件（含搜索开关按钮 + doSubmit搜索逻辑）
│   ├── settings.tsx         # 设置页（模型服务商选择 + API Key配置）
│   ├── auth.tsx             # 访问码验证页
│   └── ...
├── store/
│   ├── access.ts            # ★ 访问控制状态（needCode、deepseekApiKey等）
│   ├── chat.ts              # 聊天会话状态（onUserInput → 发送消息）
│   └── config.ts            # 应用配置状态
├── config/
│   ├── server.ts            # 服务端配置（读取 process.env.CODE→md5哈希）
│   └── client.ts            # 客户端配置
├── constant.ts              # ★ 全局常量（ServiceProvider.DeepSeek、模型列表）
├── locales/cn.ts            # 中文翻译
└── utils/model.ts           # 模型表构建（自定义模型解析@ProviderName）
```

## 核心修改（相比原版 NextChat）

### 1. DeepSeek 适配（已内置）

NextChat 原生支持 DeepSeek，无需修改。配置路径：

```
设置页 → 模型服务商 → 选 DeepSeek → 填 API Key
```

自定义模型需加 `@DeepSeek` 后缀指定服务商，如：
```
deepseek-v4-pro@DeepSeek,deepseek-v4-flash@DeepSeek
```

### 2. 联网搜索（★ 核心新增）

**架构**: 前端按键触发 → 调用 `/api/search` → 搜索结果注入用户消息 → 发给 AI

**搜索源优先级**:
1. **Tavily**（Vercel 环境变量 `TAVILY_API_KEY`，稳定、AI 优化）
2. **SearXNG 公共实例**（免费备选，无需 Key）

**关键文件**:
- `app/api/search/route.ts` — 搜索代理服务端
- `app/components/chat.tsx` — `enableWebSearch` 状态 + 🌐 按钮 + `doSubmit` 搜索注入

**搜索注入格式**:
```
【联网搜索结果】
[1] 标题
    摘要
    URL: xxx
...

【用户问题】
用户原始问题
```

### 3. 访问码保护

通过 Vercel 环境变量 `CODE` 控制。服务端 md5 哈希存储，HTTPS 传输。

- `app/store/access.ts` — `needCode: true`（默认需要）
- `app/config/server.ts` — `needCode: ACCESS_CODES.size > 0`（服务端判定）
- `app/api/config/route.ts` — 下发 needCode 到前端

### 4. 构建配置

- `next.config.mjs` — `eslint.ignoreDuringBuilds` + `typescript.ignoreBuildErrors`（跳过外部依赖报错）
- `.npmrc` / `.yarnrc` — 强制官方源（解决 Vercel 镜像源超时）
- `yarn.lock` — 已清理华为云镜像 URL

## 环境变量（Vercel）

| Key | 用途 | 必填 |
|-----|------|------|
| `CODE` | 站点访问密码 | 建议 |
| `TAVILY_API_KEY` | Tavily 搜索 API Key | 推荐（否则用免费备选） |

> DeepSeek API Key **不设**环境变量，用户在设置页前端自行填入，存储在浏览器 localStorage。

## 关键数据流

```
用户打开页面
  → /api/config 下发 needCode
  → needCode=true + 没accessCode → 显示Auth页 → 输入CODE
  → needCode=false → 直接进聊天

用户发消息（🌐 已开启）
  → doSubmit()
  → fetch /api/search?q=xxx
    → Tavily (有TAVILY_API_KEY) / SearXNG (备选)
  → 搜索结果拼接进 userInput
  → chatStore.onUserInput(finalInput)
    → 创建 userMessage + botMessage
    → getClientApi("deepseek") → deepseekApi.chat()
    → fetch /api/deepseek → 代理到 api.deepseek.com
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| "Incorrect API key" 来自 openai.com | 模型服务商还是 OpenAI | 设置页切到 DeepSeek |
| 自定义模型不工作 | 没加 `@DeepSeek` 后缀 | 改为 `模型名@DeepSeek` |
| 搜索 403 | DuckDuckGo 封 Vercel IP | 已换 Tavily + SearXNG |
| 构建超时 | yarn.lock 锁了华为云源 | 已清理 + .npmrc 强制官方源 |
| 非要访问码 | needCode 默认 true | 设了 CODE 就要输，不设就跳过 |
