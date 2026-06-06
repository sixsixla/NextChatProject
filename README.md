# RemoteAI

RemoteAI 是基于 [ChatGPT-Next-Web / NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) 二次开发的个人 AI Chat 工具。项目目标是：免费部署到 Vercel，移动端/PWA 使用方便，用户可以在前端填写自己的 API Key，并为 DeepSeek 等默认无联网搜索能力的模型补上 WebSearch 工具。

当前仓库：`github.com/sixsixla/NextChatProject`

当前部署：`https://next-chat-project-theta.vercel.app`

## 项目目的

- 基于 NextChat 成熟的聊天 UI、PWA、模型配置和多端适配能力，快速得到一个可用的私人 AI Chat 工具。
- 面向安卓手机等移动端使用场景，部署后可以直接在浏览器打开，也可以添加到桌面当作 PWA 使用。
- 不在服务端统一配置 DeepSeek API Key，而是让用户在设置页填写自己的 API Key，保存在浏览器本地。
- 给 DeepSeek V4 Pro、DeepSeek V4 Flash 等默认不带联网搜索能力的模型增加免费好用的 WebSearch 工具。
- 保留访问码保护，通过 Vercel 环境变量 `CODE` 控制是否需要站点密码。

## 相比原版 NextChat 做了什么

### DeepSeek 使用体验

NextChat 已经支持 DeepSeek，本项目保留这条路径，并围绕个人 API Key 使用场景做了说明和适配。

使用方式：

1. 进入设置页。
2. 模型服务商选择 `DeepSeek`。
3. 填写自己的 DeepSeek API Key。
4. 如需自定义模型，在模型配置里使用 `@DeepSeek` 后缀。

示例：

```text
deepseek-v4-pro@DeepSeek,deepseek-v4-flash@DeepSeek
```

### WebSearch Tool Calling

原版 NextChat 不会自动给普通模型补联网搜索能力。本项目新增 `WebSearch` tool，并注册为 OpenAI 兼容的 function tool，让模型在需要实时信息时自主调用搜索。

调用流程：

```text
用户提问
  -> DeepSeek 请求携带 WebSearch tool 定义
  -> 模型判断是否需要搜索
  -> 返回 tool_call: WebSearch
  -> 前端 handler 调用 /api/search
  -> 搜索结果作为 tool result 返回给模型
  -> 模型基于搜索结果继续流式回答
```

这不是把搜索结果直接拼进用户提示词，而是使用 Tool Calling 循环，让模型自己决定什么时候搜索、搜索什么关键词。

### 免费搜索聚合后端

新增 `/api/search` 接口：

- 并发请求 3 个 SearXNG 公共实例。
- 如果配置了 `TAVILY_API_KEY`，同时请求 Tavily 增强搜索质量。
- 按 URL 去重合并结果。
- 返回 Top 8 给模型使用。
- 单个搜索源失败不会中断整体搜索。

### 访问码保护

访问码沿用 NextChat 机制：

- 设置 `CODE` 后，用户需要输入访问码。
- 不设置 `CODE` 时，服务端下发 `needCode=false`，直接进入聊天页。
- 前端默认 `needCode=true`，启动后会从 `/api/config` 获取服务端真实配置覆盖。

### Vercel 部署适配

为了让项目在 Vercel 上更容易跑起来：

- `vercel.json` 指定 Next.js 框架、构建命令、输出目录和安装命令。
- `.npmrc` / `.yarnrc` 固定官方 registry，避免镜像源导致安装超时。
- `next.config.mjs` 暂时跳过构建期 ESLint 和 TypeScript 阻断，优先保证部署可用。

## 环境变量

| 变量名 | 用途 | 必填 |
| --- | --- | --- |
| `CODE` | 站点访问码，设置后需要登录 | 建议 |
| `TAVILY_API_KEY` | Tavily 搜索 API Key，用于增强搜索质量 | 可选 |

DeepSeek API Key 推荐由用户在前端设置页填写，不需要在 Vercel 环境变量中统一配置。项目仍保留 NextChat 原有的 `DEEPSEEK_API_KEY` 服务端兜底能力，但个人使用场景下一般不需要。

## 快速使用

1. Fork 或 clone 本仓库。
2. 部署到 Vercel。
3. 在 Vercel 环境变量中设置 `CODE`。
4. 可选设置 `TAVILY_API_KEY`。
5. 打开网页，进入设置页。
6. 模型服务商选择 `DeepSeek`。
7. 填写自己的 DeepSeek API Key。
8. 选择 DeepSeek 模型开始聊天。

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `app/client/platforms/deepseek.ts` | 注册 `WebSearch` tool，并实现搜索 handler |
| `app/api/search/route.ts` | SearXNG + Tavily 搜索聚合接口 |
| `app/utils/chat.ts` | Tool Calling 循环执行引擎，负责执行 tool call 并继续流式请求 |
| `app/api/deepseek.ts` | DeepSeek API 代理 |
| `app/store/access.ts` | 访问码、API Key、服务商配置状态 |
| `app/config/server.ts` | 读取服务端环境变量并生成下发配置 |
| `next.config.mjs` | Next.js 构建配置 |
| `vercel.json` | Vercel 部署配置 |

## 详细改动

更完整的改动说明见 [REMOTEAI_CHANGES.md](./REMOTEAI_CHANGES.md)。

## 上游项目

本项目基于 NextChat 二次开发。感谢原项目提供完整的聊天框架、PWA 能力、多模型支持和部署基础。

- 上游仓库：[ChatGPTNextWeb/ChatGPT-Next-Web](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web)
- 原项目协议：MIT
