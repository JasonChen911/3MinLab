import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistWithDeepSeek } from './ai.mjs';
import { selectApiKey } from './api-key.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.API_PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const recentRequests = [];

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk.toString();
    if (data.length > 40000) throw new Error('请求过大');
  }
  try { return JSON.parse(data); } catch { throw new Error('请求不是有效 JSON'); }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', `http://${host}:${port}`).pathname;

  if (pathname.startsWith('/api/')) {
    const origin = req.headers.origin;
    if (origin && !new Set([`http://127.0.0.1:5173`, `http://localhost:5173`, `http://${host}:${port}`]).has(origin)) {
      return send(res, 403, { error: '来源不受支持' });
    }
    if (pathname === '/api/ai/status' && req.method === 'GET') {
      return send(res, 200, { available: !!process.env.DEEPSEEK_API_KEY, model: 'deepseek-flash', modes: ['clarify', 'enrich', 'revise'] });
    }
    if (pathname !== '/api/ai/assist' || req.method !== 'POST') return send(res, 404, { error: '接口不存在' });

    let key;
    try { key = selectApiKey(req.headers['x-deepseek-api-key'], process.env.DEEPSEEK_API_KEY); }
    catch (error) { return send(res, 400, { error: error.message }); }
    if (!key) return send(res, 503, { error: '尚未配置 DeepSeek API Key。请打开设置填写自己的 Key，或继续使用本地策划引擎。' });

    const now = Date.now();
    while (recentRequests.length && recentRequests[0] < now - 60000) recentRequests.shift();
    if (recentRequests.length >= 6) return send(res, 429, { error: '请求过于频繁，请稍后再试' });
    recentRequests.push(now);

    try {
      return send(res, 200, await assistWithDeepSeek(await readJson(req), key));
    } catch (error) {
      return send(res, error.name === 'TimeoutError' ? 504 : 400, { error: error.message || 'AI 请求失败' });
    }
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const path = resolve(join(root, requested.replace(/^\/+/, '')));
  if (!path.startsWith(root)) return send(res, 403, { error: '路径不受支持' });
  try {
    const file = (await stat(path)).isFile() ? path : join(root, 'index.html');
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch {
    send(res, 404, { error: '页面不存在，请先运行 npm run build' });
  }
});

server.listen(port, host, () => console.log(`Activity Lab API: http://${host}:${port}`));
