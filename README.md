# md2png-service

A standalone Markdown-to-PNG service extracted and adapted from [zhaoolee/notes](https://github.com/zhaoolee/notes) at commit `416035cdccd0226aa94f045e8474b45bfd533961`. It uses a Bun/Hono gateway and a private Node/Playwright renderer. The gateway stores PNG files on a persistent volume and expires them after a configurable TTL.

## Run

Install Docker and Compose, copy `.env.example` to `.env`, set a strong `API_KEY` and set `PUBLIC_BASE_URL` to the externally reachable URL. Run `docker compose up --build`. The gateway listens on `127.0.0.1:3000`; the renderer has no published port and uses an internal network. Put an authenticated HTTPS reverse proxy in front of the gateway for remote access; Cloudflare Tunnel or Tailscale are possible alternatives. Do not expose the renderer directly. Back up the `images` volume if its temporary contents need to survive host replacement.

For local development, install Node 24 and Bun, run `npm ci`, install Playwright Chromium and its system dependencies (`./node_modules/.bin/playwright install --with-deps chromium`), then run `npm run worker` and `API_KEY=... PUBLIC_BASE_URL=http://localhost:3000 npm run gateway` in separate terminals. The worker binds localhost by default. `npm test` and `npm run typecheck` run the checks.

## API

`POST /v1/render` accepts JSON `{ "markdown": "# Hello", "theme": "default", "footer": {"brand": "Example", "via": ""} }`. Theme defaults to `default`; alternatives are `smartisan-dark`, `apple-notes`, `apple-notes-light`, `bear`, `bazhahei`, and `telegraph`. The response contains `image_url`, `width`, `height`, and `size_bytes`. Fetch the URL with the same bearer key. `GET /health` and `GET /openapi.json` are public. All other endpoints require `Authorization: Bearer <API_KEY>`. Image URLs are generated only from `PUBLIC_BASE_URL`, never the request Host.

```sh
curl -sS http://localhost:3000/v1/render \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d '{"markdown":"# Hello\n\n| One | Two |\n| --- | --- |\n| 1 | 2 |","theme":"bear"}'
```

The image endpoint is `GET /v1/images/:id.png`. Images expire after `IMAGE_TTL_SECONDS` (default 86400). Cleanup runs at startup and periodically. `MAX_BODY_BYTES` defaults to 2 MB; `MAX_CONCURRENCY` defaults to 2. Oversized requests return 413 and requests above the render concurrency limit return 429. `openapi.yaml` is JSON-formatted YAML; `function-calling.json` and `skills/md2png/SKILL.md` provide agent integrations.

## MCP

`POST /mcp` supports stateless JSON-RPC `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`, with `render_markdown_to_png` and `get_image_info`. Send the same bearer token. The response is JSON, not an SSE stream; GET-based server notifications, resumable sessions and streaming are not implemented. Clients requiring those optional transport features may not interoperate. The tool returns the image ID as well as the URL and dimensions. Image info requires that ID.

## Images and safety

Remote URLs, local paths, SVG, HTML and arbitrary network resources in Markdown are not loaded. Embed local PNG, JPEG, GIF or WebP images as `data:image/<type>;base64,...` URLs. The renderer applies a restrictive content security policy and aborts browser network requests, including localhost, private networks, link-local addresses and cloud metadata. `markdownPath` is rejected. Only grant the API key to trusted callers; the internal worker is deliberately unauthenticated and relies on network isolation. Rendered images may contain sensitive content, so treat the bearer key and storage volume accordingly.

## Attribution and limitations

`LICENSE` and `NOTICE` retain the upstream Apache-2.0 notices. `renderer/components/NoteSheet.tsx`, `renderer/components/MarkdownText.tsx`, `renderer/lib/markdown.ts` and `renderer/lib/note-card-theme-styles.ts` derive from the upstream project; the components were adapted to remove product branding and restrict image URLs. The worker, simplified CSS, gateway and integration files are new. Theme colors and font stacks come from upstream tokens, while the layout is simplified and is not pixel-identical. The upstream OPPOSans font files, third-party images and icons are not redistributed; system fonts are used. Third-party dependencies have their own licenses, and the Apache license does not grant rights to third-party trademarks or assets.
