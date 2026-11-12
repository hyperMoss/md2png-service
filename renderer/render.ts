import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { NoteSheet } from './components/NoteSheet.js';
import { splitSections } from './lib/markdown.js';
import { NOTE_CARD_THEME_STYLES } from './lib/note-card-theme-styles.js';
import type { RenderInput } from './schema.js';

export function renderHtml(input: RenderInput): string {
  const style = NOTE_CARD_THEME_STYLES[input.theme];
  const c = style.colors;
  const content = renderToStaticMarkup(createElement(NoteSheet, { notes: splitSections(input.markdown), footerBrand: input.footer.brand, footerVia: input.footer.via }));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
  *{box-sizing:border-box}html,body{margin:0;background:${c.paper}}body{font-family:${style.fontFamily};color:${c.text}}.note-sheet{width:800px;padding:64px;background:${c.paper};font-size:20px;line-height:1.8}.note-index h2,.note-copy h1,.note-copy h2,.note-copy h3{color:${c.heading};font-family:${style.headingFontFamily};line-height:1.4}.note-index h2{border-bottom:1px solid ${c.border};padding-bottom:12px}.note-copy a{color:${c.accent}}.note-copy img{display:block;max-width:100%;height:auto;margin:20px auto}.note-copy pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:20px;background:${c.pre};color:${c.preText}}.note-copy :not(pre)>code{background:${c.code};color:${c.codeText}}blockquote{border-left:4px solid ${c.quoteMark};padding-left:20px;color:${c.quote}}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid ${c.border};padding:8px}th{background:${c.tableHead}}.sheet-footer{border-top:1px solid ${c.border};color:${c.footer};margin-top:48px;padding-top:20px;font-size:14px}.sheet-footer-copy{display:flex;justify-content:space-between}.markdown-blank-line{height:1em;margin:0}.note-centered-line{text-align:center}.sheet-frame,.sheet-corner{display:none} </style></head><body>${content}</body></html>`;
}
export async function render(input: RenderInput) {
  const browser = await chromium.launch({headless:true, timeout:15000, args:['--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage({viewport:{width:800,height:2000},deviceScaleFactor:1});
    await page.route('**/*', route => route.abort());
    await page.setContent(renderHtml(input), {waitUntil:'load',timeout:30000});
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))));
    const height = await page.locator('.note-sheet').evaluate(el => Math.ceil(el.getBoundingClientRect().height));
    if (height > 50000) throw new Error('Rendered image exceeds height limit');
    const chunks: {input:Buffer;left:number;top:number}[]=[];
    for(let top=0;top<height;top+=2000){
      const size=Math.min(2000,height-top);
      const input=await page.screenshot({type:'png',clip:{x:0,y:top,width:800,height:size},animations:'disabled'});
      chunks.push({input,left:0,top});
    }
    const png=await sharp({create:{width:800,height,channels:4,background:'#ffffff'}}).composite(chunks).png().toBuffer();
    return {png,width:800,height};
  } finally { await browser.close(); }
}
