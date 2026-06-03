# AGENTS.md — RemoteAI 项目上下文

## 项目概述

基于 [ChatGPT-Next-Web (NextChat)](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) 二次开发，适配 DeepSeek V4 系列模型，增加 Tool Calling 联网搜索（参照 [deepcode-cli](https://github.com/lessweb/deepcode-cli)）。部署在 Vercel，支持 PWA 移动端使用。

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
│   ├── search/route.ts     # ★ 搜索聚合代理（SearXNG×3 并发 + Tavily → 去重合并）
│   ├── deepseek.ts          # DeepSeek API 代理（/api/deepseek）
│   ├── [provider]/          # 通用提供商代理路由
│   └── config/route.ts      # 服务端配置下发（needCode等）
├── client/
│   ├── api.ts               # 客户端 API 抽象层 + 访问码校验
│   └── platforms/
│       ├── deepseek.ts      # ★ DeepSeek 客户端（WebSearch tool 注册 + handler 执行）
│       ├── openai.ts        # OpenAI 客户端
│       └── ...              # 其他 14 个平台实现
├── components/
│   ├── chat.tsx             # ★ 聊天主组件（🌐 搜索按钮）
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
├── utils/
│   ├── model.ts             # 模型表构建（自定义模型解析@ProviderName）
│   └── chat.ts              # streamWithThink — tool calling 循环引擎
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

### 2. 联网搜索（★ Tool Calling 模式，参照 deepcode-cli）

**架构**: WebSearch 注册为 OpenAI Tool Function，LLM 自主决定何时搜索，无需用户手动触发。

**搜索后端**: 多源并发聚合
- 3 个 SearXNG 公共实例并发请求
- Tavily（如果 Vercel 设置了 `TAVILY_API_KEY`）
- 结果按 URL 去重合并，返回 Top 8

**Tool 执行流程**:
```
用户发消息
  → deepseekApi.chat() 发送请求（附带 WebSearch tool 定义）
  → V4 判断需要搜索 → 返回 tool_call: { name: "WebSearch", arguments: { query: "..." } }
  → streamWithThink 拦截 tool_call → 执行 WebSearch handler
  → handler 调 /api/search → 聚合搜索结果 → 作为 tool_result 返回
  → V4 拿到搜索结果 → 生成最终回答
```

**关键文件**:
- `app/client/platforms/deepseek.ts` — `WEBSEARCH_TOOL` 常量 + `allFuncs.WebSearch` handler
- `app/api/search/route.ts` — 多源并发搜索 + URL 去重合并
- `app/utils/chat.ts` — `streamWithThink` tool calling 循环引擎

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
| `TAVILY_API_KEY` | Tavily 搜索 API Key | 可选（增强搜索质量） |

> DeepSeek API Key **不设**环境变量，用户在设置页前端自行填入，存储在浏览器 localStorage。

## 关键数据流

```
用户打开页面
  → /api/config 下发 needCode
  → needCode=true + 没accessCode → 显示Auth页 → 输入CODE
  → needCode=false → 直接进聊天

用户发消息
  → doSubmit()
  → chatStore.onUserInput(userInput)
    → 创建 userMessage + botMessage
    → getClientApi("deepseek") → deepseekApi.chat()
      → 请求体包含 WebSearch tool 定义
      → fetch /api/deepseek → 代理到 api.deepseek.com
      → V4 判断需要搜索 → 返回 tool_call: WebSearch
        → handler 调 /api/search
          → SearXNG×3 并发 + Tavily（可选）
          → 去重合并 → 返回 Top 8
        → tool_result 发回 V4
      → V4 基于搜索结果流式输出答案
```

## 搜索架构演进

| 版本 | 模式 | 触发方式 | 问题 |
|------|------|----------|------|
| v1 | DuckDuckGo 搜索注入 | 用户手动点 🌐 + 前端拼接消息 | DDG 封 Vercel IP (403) |
| v2 | Tavily + SearXNG 注入 | 用户手动点 🌐 + 前端拼接消息 | Tavily 结果少且不准 |
| v3 | **Tool Calling** | LLM 自主调用 WebSearch tool | ✅ 当前版本 |

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| "Incorrect API key" 来自 openai.com | 模型服务商还是 OpenAI | 设置页切到 DeepSeek |
| 自定义模型不工作 | 没加 `@DeepSeek` 后缀 | 改为 `模型名@DeepSeek` |
| 搜索不触发 | LLM 认为不需要搜索 | 问需要实时信息的问题（如"今天日期"） |
| 构建超时 | yarn.lock 锁了华为云源 | 已清理 + .npmrc 强制官方源 |
| 非要访问码 | needCode 默认 true | 设了 CODE 就要输，不设就跳过 |
