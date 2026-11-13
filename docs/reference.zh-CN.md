# API 与配置参考

[快速启动](../README.zh-CN.md) | [English](reference.md)

## 配置

Compose 从 `.env` 读取网关配置。Git 和 Docker 构建上下文均排除了 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_KEY` | 必填 | 渲染、图片下载和 MCP 共用的 Bearer 密钥。 |
| `PUBLIC_BASE_URL` | 必填 | 客户端可访问的地址，用于拼接图片 URL。示例值为 `http://localhost:3000`。 |
| `PUBLIC_IMAGES` | `false` | 仅当值为 `true` 时，图片 GET 和 HEAD 请求无需密钥。渲染接口和 MCP 保持鉴权。 |
| `IMAGE_TTL_SECONDS` | `86400` | 图片有效期，单位为秒。 |
| `MAX_CONCURRENCY` | `2` | 单个网关进程同时允许的渲染数。超出的请求直接拒绝，不排队。 |
| `MAX_BODY_BYTES` | `2000000` | 网关请求体大小上限，单位为字节。渲染器另有固定的 2,000,000 字节上限。 |
| `WORKER_URL` | `http://127.0.0.1:3001` | 渲染器地址。Compose 固定覆盖为 `http://worker:3001`。 |
| `IMAGE_DIR` | `./data/images` | 图片目录。Compose 固定覆盖为 `/data/images`。 |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | 网关监听地址和端口。Compose 仅发布 `127.0.0.1:3000`。 |
| `RENDER_HOST` / `RENDER_PORT` | `127.0.0.1` / `3001` | 渲染器监听地址和端口。容器镜像设置 `RENDER_HOST=0.0.0.0`，供内部网络访问。 |

`PUBLIC_BASE_URL` 支持 HTTP 和 HTTPS，不能带用户名、密码、查询参数或片段。网关不会根据请求的 Host 头生成图片地址。修改这个变量不会改变 Docker 发布的端口。

图片过期后返回 `404`。服务在启动时清理过期 PNG，之后按 TTL 与一小时中的较短间隔清理。`images` 数据卷在替换容器时保留。

## HTTP 接口

| 方法 | 路径 | 鉴权 | 返回内容 |
| --- | --- | --- | --- |
| `GET` | `/health` | 公开 | 网关返回 `{"status":"ok"}`。 |
| `GET` | `/openapi.json` | 公开 | OpenAPI 文档。 |
| `POST` | `/v1/render` | Bearer | 渲染 Markdown，返回图片元数据。 |
| `GET` | `/v1/images/:id.png` | 默认 Bearer；`PUBLIC_IMAGES=true` 时公开 | 返回尚未过期的 PNG 文件。 |
| `POST` | `/mcp` | Bearer | 无状态 JSON-RPC 接口。 |

受保护的接口均需要 `Authorization: Bearer <API_KEY>`。

`PUBLIC_IMAGES=true` 对所有尚未过期的图片生效，包括修改配置前生成的图片。能够访问服务且持有图片链接的人可以读取该图片。图片不存在或已过期时仍返回 `404`。服务返回的 `/openapi.json` 会反映当前图片鉴权设置。

### 渲染请求

```json
{
	"markdown": "# 你好\n\n一段 **Markdown**。",
	"theme": "bear",
	"footer": {"brand": "我的笔记", "via": "md2png"}
}
```

`markdown` 必填，长度为 1 到 1,000,000 个字符。`theme` 默认为 `default`。页脚的两个字段均默认为空字符串，各自最多 80 个字符。未知字段会被拒绝，包括 `markdownPath`。

可用主题：`default`、`smartisan-dark`、`apple-notes`、`apple-notes-light`、`bear`、`bazhahei`、`telegraph`。

响应包含 `image_url`、`width`、`height` 和 `size_bytes`。图片宽度为 800 像素，高度随内容变化，不能超过 50,000 像素。REST 响应没有单独的 `id` 字段，图片 UUID 包含在 `image_url` 中。

### HTTP 错误码

| 状态码 | 含义 |
| --- | --- |
| `400` | JSON 无效、主题不支持、字段值无效或包含未知字段。 |
| `401` | 未提供密钥或密钥错误。 |
| `404` | 路由不存在、图片不存在或图片已过期。 |
| `413` | 超过网关请求体大小上限。 |
| `429` | 渲染并发数已满。 |
| `502` | 请求渲染器或生成图片失败，包括渲染超时、图片超高。 |

网关请求渲染器的超时为 60 秒。`/health` 不会调用渲染器，也不会启动 Chromium。

## MCP 与 Agent 集成

`POST /mcp` 支持 `initialize`、`notifications/initialized`、`ping`、`tools/list` 和 `tools/call`。初始化响应声明的协议版本为 `2025-03-26`。

| 工具 | 参数 | 返回内容 |
| --- | --- | --- |
| `render_markdown_to_png` | 与渲染请求相同。 | 包含 `id` 的图片元数据。 |
| `get_image_info` | `{"id":"<图片 UUID>"}` | 尚未过期图片的元数据。 |

工具结果在文本内容项中返回 JSON 格式的元数据，不直接返回 PNG 字节。除非设置 `PUBLIC_IMAGES=true`，否则下载图片需要 Bearer 鉴权。公开模式下，返回的地址可以直接用于浏览器预览，无需鉴权头。

按 README 读取 `.env` 后，可以发送以下请求：

```sh
curl -fsS "$PUBLIC_BASE_URL/mcp" \
	-H "Authorization: Bearer $API_KEY" \
	-H 'Content-Type: application/json' \
	-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_markdown_to_png","arguments":{"markdown":"# 来自 MCP 的笔记","theme":"bear"}}}'
```

该接口返回 JSON，不使用 SSE。它没有 GET 通知流、可恢复会话或流式响应。要求这些传输能力的客户端可能无法兼容。工具执行失败时返回 `result.isError`，因此 HTTP `200` 不代表工具执行成功。

集成文件：[openapi.json](../openapi.json)、[openapi.yaml](../openapi.yaml)、[function-calling.json](../function-calling.json) 和 [md2png 技能](../skills/md2png/SKILL.md)。`openapi.yaml` 使用 JSON 语法，该语法也是有效的 YAML。

## 接入本机 Codex

Codex 支持直接连接 HTTP MCP 服务。在 `~/.codex/config.toml` 中添加以下配置，将两个路径替换为本机 Node.js 和本项目的实际路径，然后重启 MCP 连接或重新启动 Codex。

```toml
[mcp_servers.md2png]
url = "http://localhost:3000/mcp"
http_headers_helper = "/absolute/path/to/node /absolute/path/to/md2png-service/scripts/codex-mcp-headers.mjs"
tool_timeout_sec = 90
```

`scripts/codex-mcp-headers.mjs` 从项目 `.env` 读取密钥并生成鉴权头，无需把密钥复制到 Codex 配置中。该脚本需要 Node.js 24 或更新版本，不依赖当前工作目录。路径含空格时，需要在命令字符串内为路径添加引号。

运行 `codex mcp get md2png` 可检查配置。连接后可要求 Codex：“使用 md2png 将这段 Markdown 渲染为 bear 主题的 PNG。”Docker 服务需要保持运行。

配置选项见 [OpenAI 官方 MCP 文档](https://developers.openai.com/docs/extend/mcp)。

## 接入 Docker 中的 LobeHub

在本项目的 macOS Docker 环境中，LobeHub 容器需要使用 `http://host.docker.internal:3000/mcp` 连接宿主机发布的端口。`localhost:3000` 在 LobeHub 容器内指向 LobeHub 自己，无法连接本项目。

在 LobeHub 的 MCP 配置中选择 HTTP 或 Streamable HTTP，填写上述完整地址，并添加请求头 `Authorization: Bearer <API_KEY>`。密钥取自本项目 `.env`。此地址适用于已验证的本机环境，其他 Docker 平台需分别检查宿主机地址映射。

MCP 工具返回的 `image_url` 由 `PUBLIC_BASE_URL` 决定。本机浏览器可以使用 `localhost:3000`，LobeHub 容器内下载则需要改用 `host.docker.internal:3000`。未开启 `PUBLIC_IMAGES=true` 时，下载还需要携带鉴权头。

## 部署边界

网关同时连接外部网络和内部网络。无需鉴权的渲染器只连接内部网络，不发布宿主机端口，以 `pwuser` 用户运行，内存上限为 1 GB。网关以 `node` 用户运行，图片存储在名为 `images` 的数据卷中。

Markdown 不能加载远程图片、本地路径、SVG 图片或任意 HTML 资源。PNG、JPEG、GIF 和 WebP 图片可通过 `data:image/<type>;base64,...` 嵌入。渲染器使用严格的内容安全策略，并中止浏览器网络请求，包括指向本机、私有网络、链路本地地址和云元数据服务的请求。

API 密钥可以访问渲染功能和所有已保存图片，服务没有按用户隔离图片。渲染器依赖网络隔离。渲染内容及图片数据卷可能包含敏感信息。

## 来源与渲染差异

上游为 [zhaoolee/notes](https://github.com/zhaoolee/notes)，对应提交 `416035cdccd0226aa94f045e8474b45bfd533961`。

改编文件包括 `renderer/components/NoteSheet.tsx`、`renderer/components/MarkdownText.tsx`、`renderer/lib/markdown.ts` 和 `renderer/lib/note-card-theme-styles.ts`。组件移除了上游产品品牌，并限制了图片 URL。渲染服务、网关、简化 CSS 和集成文件为本项目新增。

主题颜色和字体栈来自上游配置。布局经过简化，不与上游应用逐像素一致。渲染器内置 OPPOSans 常规、中等和粗体 WOFF2 文件，直接嵌入渲染文档，并在测量高度前等待字体加载完成。主题仍优先使用可用的原生字体，Docker 中由 OPPOSans 提供回退，因此宿主机和容器的输出仍可能因原生字体而存在差异。项目不分发第三方图片或图标。字体来源、校验和及独立使用条款见[字体资源说明](../renderer/assets/fonts/README.md)。

[LICENSE](../LICENSE) 和 [NOTICE](../NOTICE) 保留上游 Apache-2.0 声明。依赖使用各自的许可证，Apache-2.0 不授予第三方商标或资源的使用权。
