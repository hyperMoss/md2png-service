import { createServer } from 'node:http';
import { renderSchema } from './schema.js';
import { render } from './render.js';

createServer(async (req,res) => {
  if(req.method !== 'POST' || req.url !== '/internal/render'){res.writeHead(404).end();return;}
  try {
    const parts: Buffer[]=[]; let size=0;
    for await (const part of req) {const b=Buffer.from(part);size+=b.length;if(size>2_000_000){res.writeHead(413).end();return;}parts.push(b);}
    const parsed=renderSchema.safeParse(JSON.parse(Buffer.concat(parts).toString()));
    if(!parsed.success){res.writeHead(400).end('Invalid input');return;}
    const result=await render(parsed.data);
    res.writeHead(200,{'content-type':'image/png','x-image-width':result.width,'x-image-height':result.height}).end(result.png);
  } catch {res.writeHead(500).end('Rendering failed');}
}).listen(Number(process.env.RENDER_PORT || 3001),process.env.RENDER_HOST || '127.0.0.1');
