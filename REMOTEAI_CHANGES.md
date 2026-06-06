# RemoteAI 改动说明

本仓库基于 [ChatGPT-Next-Web / NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) 二次开发，目标是做一个可以免费部署、移动端友好、方便使用自定义 API Key 的 AI Chat 工具。

## 项目目的

- 使用 NextChat 成熟的聊天界面、PWA 能力和多模型配置能力，部署到 Vercel 后可以直接在安卓手机浏览器或添加到桌面使用。
- 让用户在前端设置页自行填写 DeepSeek API Key，API Key 保存在浏览器本地，适合个人低成本使用。
- 面向 DeepSeek V4 Pro、DeepSeek V4 Flash 等默认不带联网搜索能力的模型，增加 WebSearch 工具，让模型可以在需要实时信息时自主搜索网页。
- 保留 NextChat 原有的访问码保护能力，通过 Vercel 环境变量 `CODE` 控制站点是否需要密码。

## 主要改动

### 1. DeepSeek 使用路径

NextChat 已有 DeepSeek 提供商支持，本项目保留并强化这条路径：

- 设置页选择 `DeepSeek` 作为模型服务商。
- 用户填写自己的 DeepSeek API Key。
- 自定义模型可使用 `模型名@DeepSeek` 指定服务商，例如：

```text
deepseek-v4-pro@DeepSeek,deepseek-v4-flash@DeepSeek
```

客户端请求会走 `/api/deepseek` 代理，再转发到 DeepSeek API。

### 2. WebSearch Tool Calling 搜索

原版 NextChat 不会自动给 DeepSeek 模型补联网搜索能力。本项目新增了一个 `WebSearch` tool，注册为 OpenAI 兼容的 function tool：

```text
用户提问
  -> DeepSeek 请求携带 WebSearch tool 定义
  -> 模型判断是否需要搜索
  -> 返回 tool_call: WebSearch
  -> 前端 handler 调用 /api/search
  -> 搜索结果作为 tool result 返回给模型
  -> 模型基于搜索结果继续流式回答
```

这不是简单把搜索结果拼进用户提示词，而是让模型按需自主调用工具。适合“今天发生了什么”“某个最新版本/新闻/价格/政策”等需要实时信息的问题。

### 3. 免费搜索聚合后端

新增 `/api/search` 搜索聚合接口：

- 并发请求 3 个 SearXNG 公共实例，作为免费搜索来源。
- 如果部署环境配置了 `TAVILY_API_KEY`，同时请求 Tavily 增强结果质量。
- 按 URL 去重合并，返回 Top 8 搜索结果。
- 单个搜索源失败不会让整体失败，只有所有来源都失败时才返回无结果。

### 4. 访问码保护

访问码沿用 NextChat 的机制：

- Vercel 设置 `CODE` 后，用户需要输入访问码才能使用。
- 没有设置 `CODE` 时，服务端下发 `needCode=false`，前端直接进入聊天页。
- 前端默认 `needCode=true`，启动后会从 `/api/config` 获取服务端真实配置覆盖。

### 5. Vercel 构建与部署适配

为了让 fork 在 Vercel 上更稳定构建：

- `vercel.json` 指定 Next.js 框架、构建命令、输出目录和安装命令。
- `.npmrc` / `.yarnrc` 固定官方 registry，避免镜像源导致安装超时。
- `next.config.mjs` 暂时跳过构建期 ESLint 和 TypeScript 阻断，优先保证部署可用。

## 环境变量

| 变量名 | 用途 | 必填 |
| --- | --- | --- |
| `CODE` | 站点访问码，设置后需要登录 | 建议 |
| `TAVILY_API_KEY` | Tavily 搜索 API Key，用于增强搜索质量 | 可选 |

DeepSeek API Key 推荐由用户在前端设置页填写，不需要在 Vercel 环境变量中统一配置。项目仍保留 NextChat 原有的 `DEEPSEEK_API_KEY` 服务端兜底能力，但个人使用场景下通常不需要。

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

## 使用建议

1. 在 Vercel 部署本仓库。
2. 设置 `CODE` 作为站点访问码。
3. 可选设置 `TAVILY_API_KEY`，不设置也会使用免费 SearXNG 搜索源。
4. 打开页面后，在设置页选择 DeepSeek，填写自己的 DeepSeek API Key。
5. 如果使用自定义 DeepSeek 模型，在自定义模型配置中加上 `@DeepSeek` 后缀。
6. 提问实时问题时，模型会按需调用 `WebSearch`。

## 注意事项

- `WebSearch` 是否触发由模型决定。普通常识问题可能不会搜索，实时问题更容易触发。
- SearXNG 公共实例是免费来源，稳定性取决于公共服务状态；配置 Tavily 可以提高可用性和结果质量。
- 当前聊天输入区保留了搜索按钮，但搜索实际触发点已经迁移到 Tool Calling，按钮更多是搜索能力提示。
- 构建配置目前允许忽略 ESLint 和 TypeScript 构建错误，后续如果要长期维护，建议逐步恢复严格检查。

