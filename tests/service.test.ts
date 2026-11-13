import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import {createApp,cleanup} from '../gateway/app.js';
import {renderHtml,render} from '../renderer/render.js';
import {renderSchema} from '../renderer/schema.js';

test('GFM and external image protection',()=>{const html=renderHtml(renderSchema.parse({markdown:'## Title\n\n| A | B |\n|---|---|\n| x | y |\n\n- [x] done\n\n![remote](http://169.254.169.254/latest/meta-data)'}));assert.match(html,/<table>/);assert.match(html,/type="checkbox"/);assert.doesNotMatch(html,/169\.254/);});

test('gateway auth, validation, render, MCP and TTL',async()=>{const dir=await mkdtemp(join(tmpdir(),'md2png-'));try{const png=await sharp({create:{width:2,height:3,channels:4,background:'#fff'}}).png().toBuffer();const app=createApp({apiKey:'secret',publicBaseUrl:'https://example.com',workerUrl:'http://worker',imageDir:dir,ttlMs:1000,concurrency:1,maxBodyBytes:5000,fetchWorker:async()=>new Response(new Uint8Array(png),{headers:{'x-image-width':'2','x-image-height':'3'}})});const headers={'authorization':'Bearer secret','content-type':'application/json'};assert.equal((await app.request('/v1/render',{method:'POST',body:'{}'})).status,401);assert.equal((await app.request('/v1/render',{method:'POST',headers,body:JSON.stringify({markdown:'x',theme:'no'})})).status,400);assert.equal((await app.request('/v1/render',{method:'POST',headers,body:JSON.stringify({markdown:'x',markdownPath:'/etc/passwd'})})).status,400);const response=await app.request('/v1/render',{method:'POST',headers,body:JSON.stringify({markdown:'hi'})});assert.equal(response.status,200);const result=await response.json() as {image_url:string;width:number;height:number};assert.equal(result.width,2);assert.equal(result.height,3);assert.match(result.image_url,/^https:\/\/example.com/);const path=new URL(result.image_url).pathname;assert.equal((await app.request(path,{headers})).status,200);const list=await app.request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal((await list.json() as any).result.tools.length,2);const mcpRender=await app.request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'render_markdown_to_png',arguments:{markdown:'MCP'}}})});assert.equal((await mcpRender.json() as any).result.content[0].type,'text');const call=await app.request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_image_info',arguments:{id:path.split('/').pop()?.replace('.png','')}}})});assert.equal((await call.json() as any).result.content[0].type,'text');const file=join(dir,path.split('/').pop()!);await utimes(file,new Date(0),new Date(0));await cleanup(dir,1000);assert.equal((await app.request(path,{headers})).status,404);}finally{await rm(dir,{recursive:true,force:true});}});

test('Chromium renders real PNG including multiple screenshot slices',async()=>{const result=await render(renderSchema.parse({markdown:'## Heading\n\n'+('Long text line\n\n'.repeat(160))}));assert.ok(result.height>2000);const meta=await sharp(result.png).metadata();assert.equal(meta.width,800);assert.equal(meta.height,result.height);});

test('public image access is configurable and leaves render and MCP protected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'md2png-public-'));
  const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };
  try {
    const png = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#fff' } }).png().toBuffer();
    for (const publicImages of [false, true]) {
      const app = createApp({ apiKey: 'secret', publicBaseUrl: 'https://example.com', workerUrl: 'http://worker', imageDir: dir, ttlMs: 60000, concurrency: 1, maxBodyBytes: 5000, publicImages, fetchWorker: async () => new Response(new Uint8Array(png), { headers: { 'x-image-width': '2', 'x-image-height': '3' } }) });
      const rendered = await app.request('/v1/render', { method: 'POST', headers, body: JSON.stringify({ markdown: 'hello' }) });
      assert.equal(rendered.status, 200);
      const metadata = await rendered.json();
      const path = new URL(metadata.image_url).pathname;
      const anonymous = await app.request(path);
      assert.equal(anonymous.status, publicImages ? 200 : 401);
      if (publicImages) assert.deepEqual(Buffer.from(await anonymous.arrayBuffer()), png);
      assert.equal((await app.request(path, { method: 'HEAD' })).status, publicImages ? 200 : 401);
      assert.equal((await app.request(path, { headers })).status, 200);
      assert.equal((await app.request('/v1/render', { method: 'POST', body: '{}' })).status, 401);
      assert.equal((await app.request('/mcp', { method: 'POST', body: '{}' })).status, 401);
      assert.equal((await app.request(path, { method: 'POST' })).status, 401);
      assert.equal((await app.request('/v1/images/')).status, 401);
      const spec = await (await app.request('/openapi.json')).json();
      assert.deepEqual(spec.paths['/v1/images/{id}.png'].get.security, publicImages ? [] : undefined);
      await utimes(join(dir, path.split('/').pop()!), new Date(0), new Date(0));
      assert.equal((await app.request(path, { headers: publicImages ? {} : headers })).status, 404);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Chromium uses bundled OPPOSans without network access', async () => {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(renderHtml(renderSchema.parse({ markdown: '# 中文字体 123 ABC\n\n正文与 **粗体**。' })));
    const faces = await page.evaluate(async () => {
      const loaded = [];
      for (const weight of [400, 500, 700]) {
        const fonts = await document.fonts.load(`${weight} 20px OPPOSans`, '中文123');
        loaded.push({ weight, count: fonts.length, statuses: fonts.map(font => font.status) });
      }
      return loaded;
    });
    for (const face of faces) {
      assert.equal(face.count, 1);
      assert.deepEqual(face.statuses, ['loaded']);
    }
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    for (const selector of ['.note-copy h1', '.note-copy p:not(.markdown-blank-line)']) {
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      assert.ok(fonts.length > 0);
      for (const font of fonts) {
        assert.match(font.familyName, /^OPPOSans/);
        assert.equal(font.isCustomFont, true);
      }
    }
  } finally {
    await browser.close();
  }
});
