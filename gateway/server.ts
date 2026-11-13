import { createApp, cleanup } from './app.js';
const config={apiKey:process.env.API_KEY || '',publicBaseUrl:process.env.PUBLIC_BASE_URL || '',workerUrl:process.env.WORKER_URL || 'http://127.0.0.1:3001',imageDir:process.env.IMAGE_DIR || './data/images',ttlMs:Number(process.env.IMAGE_TTL_SECONDS || 86400)*1000,concurrency:Number(process.env.MAX_CONCURRENCY || 2),maxBodyBytes:Number(process.env.MAX_BODY_BYTES || 2000000),publicImages:process.env.PUBLIC_IMAGES === 'true'};
const app=createApp(config);
await cleanup(config.imageDir,config.ttlMs);
setInterval(()=>cleanup(config.imageDir,config.ttlMs).catch(console.error),Math.min(config.ttlMs,3600000)).unref();
export default {port:Number(process.env.PORT || 3000),hostname:process.env.HOST || '0.0.0.0',fetch:app.fetch};
