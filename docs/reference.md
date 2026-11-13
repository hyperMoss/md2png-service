# API and configuration reference

[Quick start](../README.md) | [简体中文](reference.zh-CN.md)

## Configuration

Compose reads `.env` for gateway settings. Git and the Docker build context exclude `.env`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_KEY` | Required | Bearer key for rendering, image downloads, and MCP. |
| `PUBLIC_BASE_URL` | Required | Client-reachable base URL used in image URLs. The example uses `http://localhost:3000`. |
| `PUBLIC_IMAGES` | `false` | Set exactly `true` to allow unauthenticated image GET and HEAD requests. Rendering and MCP remain protected. |
| `IMAGE_TTL_SECONDS` | `86400` | Image lifetime in seconds. |
| `MAX_CONCURRENCY` | `2` | Maximum active renders per gateway process. Extra renders are rejected, not queued. |
| `MAX_BODY_BYTES` | `2000000` | Gateway body limit in bytes. The worker also has a fixed 2,000,000-byte limit. |
| `WORKER_URL` | `http://127.0.0.1:3001` | Worker address. Compose overrides it with `http://worker:3001`. |
| `IMAGE_DIR` | `./data/images` | Image directory. Compose overrides it with `/data/images`. |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Gateway listener. Compose publishes only `127.0.0.1:3000`. |
| `RENDER_HOST` / `RENDER_PORT` | `127.0.0.1` / `3001` | Worker listener. The worker image sets `RENDER_HOST=0.0.0.0` for the private Compose network. |

`PUBLIC_BASE_URL` accepts HTTP or HTTPS without credentials, query parameters, or a fragment. Image URLs do not use the request Host header. Changing this setting does not change the published Docker port.

Expired images return `404`. Cleanup deletes expired PNG files at startup and at intervals of the TTL or one hour, whichever is shorter. The `images` volume persists across container replacement.

## HTTP endpoints

| Method | Path | Authentication | Result |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | `{"status":"ok"}` from the gateway. |
| `GET` | `/openapi.json` | Public | OpenAPI document. |
| `POST` | `/v1/render` | Bearer | Render Markdown and return image metadata. |
| `GET` | `/v1/images/:id.png` | Bearer by default; public when `PUBLIC_IMAGES=true` | PNG bytes if the image exists and has not expired. |
| `POST` | `/mcp` | Bearer | Stateless JSON-RPC endpoint. |

Protected endpoints require `Authorization: Bearer <API_KEY>`.

`PUBLIC_IMAGES=true` applies to all unexpired images, including images created before the setting changed. Anyone able to reach the service with an image URL can read that image. Unknown and expired images still return `404`. The served `/openapi.json` reflects the active image authentication setting.

### Render request

```json
{
	"markdown": "# Hello\n\nSome **Markdown**.",
	"theme": "bear",
	"footer": {"brand": "My notes", "via": "md2png"}
}
```

`markdown` is required and accepts 1 to 1,000,000 characters. `theme` defaults to `default`. Footer fields default to empty strings and accept up to 80 characters each. Unknown fields, including `markdownPath`, are rejected.

Themes: `default`, `smartisan-dark`, `apple-notes`, `apple-notes-light`, `bear`, `bazhahei`, and `telegraph`.

The response contains `image_url`, `width`, `height`, and `size_bytes`. Width is 800 pixels. Height follows the content and cannot exceed 50,000 pixels. The REST response has no separate `id`; the UUID is part of `image_url`.

### HTTP errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid JSON, unsupported theme, invalid field value, or unknown field. |
| `401` | Missing or incorrect bearer key. |
| `404` | Unknown route, missing image, or expired image. |
| `413` | Gateway request body limit exceeded. |
| `429` | All allowed render slots are in use. |
| `502` | Worker request or rendering failed, including the render timeout or image height limit. |

The gateway allows up to 60 seconds for a worker request. `/health` does not call the worker or launch Chromium.

## MCP and agent integrations

`POST /mcp` supports `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. Initialization advertises protocol version `2025-03-26`.

| Tool | Arguments | Result |
| --- | --- | --- |
| `render_markdown_to_png` | Same fields as the render request. | Image metadata including `id`. |
| `get_image_info` | `{"id":"<image UUID>"}` | Metadata for an existing, unexpired image. |

Tool results contain metadata as JSON in a text content item, rather than embedded PNG bytes. Downloads require bearer authentication unless `PUBLIC_IMAGES=true`. In public mode, the returned URL can be used for browser previews without an authorization header.

Example after loading `.env` as shown in the README:

```sh
curl -fsS "$PUBLIC_BASE_URL/mcp" \
	-H "Authorization: Bearer $API_KEY" \
	-H 'Content-Type: application/json' \
	-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_markdown_to_png","arguments":{"markdown":"# Hello from MCP","theme":"bear"}}}'
```

The endpoint returns JSON rather than SSE. It has no GET notification stream, resumable sessions, or streaming responses. Clients requiring those features may not interoperate. Tool failures use `result.isError`, so HTTP `200` alone does not establish tool success.

Integration files: [openapi.json](../openapi.json), [openapi.yaml](../openapi.yaml), [function-calling.json](../function-calling.json), and [the md2png skill](../skills/md2png/SKILL.md). `openapi.yaml` uses JSON syntax, which is valid YAML.

## Connect from local Codex

Codex supports HTTP MCP connections. Add this entry to `~/.codex/config.toml`, replace both paths with your Node.js and project paths, then restart the MCP connection or Codex.

```toml
[mcp_servers.md2png]
url = "http://localhost:3000/mcp"
http_headers_helper = "/absolute/path/to/node /absolute/path/to/md2png-service/scripts/codex-mcp-headers.mjs"
tool_timeout_sec = 90
```

`scripts/codex-mcp-headers.mjs` reads the project `.env` and generates the authorization header. The key stays in `.env`. The helper needs Node.js 24 or newer and works independently of the current directory. Paths containing spaces need quotes inside the command string.

`codex mcp get md2png` displays the saved configuration. After connecting, ask Codex: "Use md2png to render this Markdown as a PNG with the bear theme." The Docker service must remain running.

See the [official OpenAI MCP documentation](https://developers.openai.com/docs/extend/mcp) for configuration options.

## Connect from LobeHub in Docker

In the verified local macOS Docker environment, the LobeHub container reaches the published gateway port at `http://host.docker.internal:3000/mcp`. Within LobeHub's container, `localhost:3000` points to LobeHub itself.

Select HTTP or Streamable HTTP in LobeHub's MCP settings, enter that complete URL, and add the header `Authorization: Bearer <API_KEY>` using the key from this project's `.env`. Other Docker platforms require a separate check of their host address mapping.

Tool results use `PUBLIC_BASE_URL` for `image_url`. A local browser can use `localhost:3000`; downloads from inside LobeHub's container need `host.docker.internal:3000` instead. Downloads also require the authorization header unless `PUBLIC_IMAGES=true`.

## Deployment boundaries

The gateway joins an edge network and an internal network. The unauthenticated worker joins only the internal network, has no published port, runs as `pwuser`, and has a 1 GB memory limit. The gateway runs as `node` and stores images in the named `images` volume.

Markdown cannot load remote images, local paths, SVG images, or arbitrary HTML resources. PNG, JPEG, GIF, and WebP images are accepted as `data:image/<type>;base64,...` URLs. The renderer applies a restrictive content security policy and aborts browser network requests, including localhost, private networks, link-local addresses, and cloud metadata.

The API key grants access to rendering and all saved images. There is no per-user image ownership. The worker relies on network isolation. Rendered content and the image volume can contain sensitive data.

## Attribution and rendering differences

The upstream source is [zhaoolee/notes](https://github.com/zhaoolee/notes) at commit `416035cdccd0226aa94f045e8474b45bfd533961`.

Adapted files: `renderer/components/NoteSheet.tsx`, `renderer/components/MarkdownText.tsx`, `renderer/lib/markdown.ts`, and `renderer/lib/note-card-theme-styles.ts`. The components remove upstream product branding and restrict image URLs. The worker, gateway, simplified CSS, and integration files are new.

Theme colors and font stacks come from upstream tokens. The simplified layout is not pixel-identical to the upstream application. The renderer includes OPPOSans Regular, Medium, and Bold as local WOFF2 assets, embeds them in the render document, and waits for font loading before measuring height. Native theme fonts remain preferred where available; OPPOSans supplies the fallback in Docker. Host and container output can still differ when native fonts are available. Third-party images and icons are not redistributed. Font provenance, checksums, and separate terms are in [the font asset notes](../renderer/assets/fonts/README.md).

[LICENSE](../LICENSE) and [NOTICE](../NOTICE) retain upstream Apache-2.0 notices. Dependencies have their own licenses. Apache-2.0 does not grant rights to third-party trademarks or assets.
