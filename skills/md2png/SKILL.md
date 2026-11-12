---
name: md2png
description: Render Markdown as a PNG through md2png-service when asked to create or retrieve a Markdown image.
---

Send `POST /v1/render` with `Authorization: Bearer $API_KEY` and JSON containing `markdown`, optional `theme`, and optional `footer` (`brand`, `via`). The response contains `image_url`, `width`, `height`, and `size_bytes`. Download the image with the same bearer token before its TTL expires. Remote images are blocked; embed local PNG, JPEG, GIF, or WebP as a base64 data URL. Never send a filesystem path.
