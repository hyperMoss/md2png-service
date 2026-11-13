import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const { API_KEY } = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
if (!API_KEY) {
  console.error('md2png: API_KEY is missing from the project .env file');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ Authorization: `Bearer ${API_KEY}` }) + '\n');
