import { readFileSync } from 'node:fs';

const fontFaces = [
  { file: 'OPPOSans-R.woff2', weight: 400 },
  { file: 'OPPOSans-M.woff2', weight: 500 },
  { file: 'OPPOSans-B.woff2', weight: 700 },
];

export const fontFaceCss = fontFaces.map(({ file, weight }) => {
  const bytes = readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url));
  return `@font-face{font-family:"OPPOSans";font-style:normal;font-weight:${weight};font-display:block;src:url("data:font/woff2;base64,${bytes.toString('base64')}") format("woff2")}`;
}).join('\n');
