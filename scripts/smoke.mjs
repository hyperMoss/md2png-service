import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
const key = process.env.API_KEY;
assert.ok(key, 'Set API_KEY in .env');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const request = (path, options = {}) => fetch(new URL(path, base), {
  ...options,
  signal: AbortSignal.timeout(70000),
});
const post = (path, body) => request(path, { method: 'POST', headers, body: JSON.stringify(body) });

const health = await request('/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
assert.equal((await request('/openapi.json')).status, 200);
assert.equal((await request('/v1/render', { method: 'POST', body: '{}' })).status, 401);
assert.equal((await request('/mcp', { method: 'POST', body: '{}' })).status, 401);
assert.equal((await post('/v1/render', { markdown: 'test', theme: 'invalid' })).status, 400);

const response = await post('/v1/render', {
  markdown: '# 你好，Markdown\n\n## 本地部署验证\n\n| 项目 | 状态 |\n| --- | --- |\n| Docker | 已部署 |\n| 中文渲染 | 正常 |\n\n- [x] 图片生成与下载\n- [x] Bearer 鉴权',
  theme: 'bear',
  footer: { brand: '我的笔记', via: 'md2png' },
});
assert.equal(response.status, 200, await response.clone().text());
const metadata = await response.json();
assert.equal(metadata.width, 800);
assert.ok(metadata.height > 0);
assert.equal(new URL(metadata.image_url).origin, new URL(base).origin);
assert.equal((await fetch(metadata.image_url, { signal: AbortSignal.timeout(10000) })).status, process.env.PUBLIC_IMAGES === 'true' ? 200 : 401);
const image = await fetch(metadata.image_url, { headers, signal: AbortSignal.timeout(10000) });
assert.equal(image.status, 200);
assert.match(image.headers.get('content-type'), /^image\/png/);
const png = Buffer.from(await image.arrayBuffer());
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), metadata.width);
assert.equal(png.readUInt32BE(20), metadata.height);
assert.equal(png.length, metadata.size_bytes);
const output = process.env.SMOKE_OUTPUT || '/tmp/md2png-smoke.png';
await writeFile(output, png);

async function rpc(id, method, params) {
  const response = await post('/mcp', { jsonrpc: '2.0', id, method, params });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.ok(!body.error, JSON.stringify(body.error));
  assert.ok(!body.result.isError, JSON.stringify(body.result));
  return body.result;
}

assert.equal((await rpc(1, 'initialize', {})).serverInfo.name, 'md2png-service');
const tools = (await rpc(2, 'tools/list')).tools.map(tool => tool.name);
assert.ok(tools.includes('render_markdown_to_png'));
assert.ok(tools.includes('get_image_info'));
const rendered = await rpc(3, 'tools/call', {
  name: 'render_markdown_to_png', arguments: { markdown: '# MCP 中文笔记', theme: 'default' },
});
const mcpImage = JSON.parse(rendered.content[0].text);
assert.ok(mcpImage.id);
const info = await rpc(4, 'tools/call', { name: 'get_image_info', arguments: { id: mcpImage.id } });
assert.deepEqual(JSON.parse(info.content[0].text), mcpImage);
console.log(`Passed: health, OpenAPI, auth, validation, PNG download, MCP render and image info. Sample: ${output} (${metadata.width}x${metadata.height}, ${png.length} bytes)`);
