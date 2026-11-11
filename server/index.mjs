import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistWithDeepSeek } from './ai.mjs';
import { apiKey, aiStatus, configureAI, testAI, runAITask, createActivityDraft, createStageDraft, providerFetch } from './ai-service.mjs';
import { generateFile, generateBundle, importWorkbook } from './files.mjs';
import { generateDocumentAI } from './document-ai.mjs';
import { requestAdjustment } from './assistant-ai.mjs';

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
    if (data.length > 2000000) throw new Error('请求过大');
  }
  try { return JSON.parse(data); } catch { throw new Error('请求不是有效 JSON'); }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', `http://${host}:${port}`).pathname;

  if (pathname.startsWith('/api/')) {
    const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,`${host}:${port}`,'127.0.0.1:5173','localhost:5173']);
    if(!allowedHosts.has(req.headers.host))return send(res,403,{error:'仅接受本机服务地址'});
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const requestFetch=(url,options)=>providerFetch(url,{...options,signal:AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])])});

    const origin = req.headers.origin;
    if (origin && !new Set([`http://127.0.0.1:5173`, `http://localhost:5173`, `http://${host}:${port}`]).has(origin)) {
      return send(res, 403, { error: '来源不受支持' });
    }
    if(pathname==='/api/ai/config'&&req.method==='GET')return send(res,200,aiStatus());
    if(['/api/ai/config','/api/ai/test','/api/ai/task','/api/ai/activity-draft','/api/ai/stage-draft'].includes(pathname)&&req.method==='POST') {
      try {if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(res,403,{error:'配置与智能分析只允许本机访问'});
        if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'需要 JSON 请求'});
        const input=await readJson(req);return send(res,200,pathname==='/api/ai/config'?configureAI(input):pathname==='/api/ai/test'?await testAI(controller.signal):pathname==='/api/ai/activity-draft'?await createActivityDraft(input,controller.signal):pathname==='/api/ai/stage-draft'?await createStageDraft(input,controller.signal):await runAITask(input,controller.signal));
      }catch(error){return send(res,400,{error:error.message});}
    }
    if (pathname === '/api/files/export' && req.method === 'POST') {
      try { const payload=await readJson(req); const result=await generateFile(payload);res.writeHead(200,{'Content-Type':result.mime,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="activity-document.${payload.format}"`});return res.end(result.bytes); }
      catch(error){return send(res,400,{error:error.message});}
    }
    if (pathname === '/api/files/export-bundle' && req.method === 'POST') {
      try { const payload=await readJson(req);const result=await generateBundle(payload.files);res.writeHead(200,{'Content-Type':result.mime,'Cache-Control':'no-store','Content-Disposition':'attachment; filename="workgroup-tasks.zip"'});return res.end(result.bytes); }
      catch(error){return send(res,400,{error:error.message});}
    }
    if(pathname==='/api/files/import-xlsx'&&req.method==='POST') {
      try {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5000000)throw new Error('Excel 文件不能超过 5 MB');chunks.push(chunk);}return send(res,200,{rows:await importWorkbook(Buffer.concat(chunks))});}
      catch(error){return send(res,400,{error:'Excel 导入失败：'+error.message});}
    }
    if(pathname==='/api/ideas/convert'&&req.method==='POST')return send(res,501,{code:'NOT_IMPLEMENTED',error:'组织者思路文档转策划接口已预留，尚未接入模型与文档解析。当前方案未修改。'});
    if(pathname==='/api/assistant/status'&&req.method==='GET')return send(res,200,aiStatus());
    if(pathname==='/api/assistant/adjust'&&req.method==='POST') {
      try {const key=apiKey();const now=Date.now();while(recentRequests.length&&recentRequests[0]<now-60000)recentRequests.shift();if(recentRequests.length>=6)return send(res,429,{error:'请求过于频繁，请稍后重试'});recentRequests.push(now);return send(res,200,await requestAdjustment(await readJson(req),key,requestFetch));}
      catch(error){return send(res,error.code==='NOT_CONFIGURED'?503:error.name==='TimeoutError'?504:400,{error:error.message,...(error.code?{code:error.code}:{})});}
    }
    if(pathname==='/api/documents/ai'&&req.method==='POST') {
      try {const key=apiKey();const now=Date.now();while(recentRequests.length&&recentRequests[0]<now-60000)recentRequests.shift();if(recentRequests.length>=6)return send(res,429,{error:'请求过于频繁，请稍后再试'});recentRequests.push(now);return send(res,200,await generateDocumentAI(await readJson(req),key,requestFetch));}
      catch(error){return send(res,error.name==='TimeoutError'?504:400,{error:error.message});}
    }
    if (pathname === '/api/ai/status' && req.method === 'GET') {
      return send(res, 200, aiStatus());
    }
    if (pathname !== '/api/ai/assist' || req.method !== 'POST') return send(res, 404, { error: '接口不存在' });

    let key;
    try { key = apiKey(); }
    catch (error) { return send(res, 400, { error: error.message }); }
    if (!key) return send(res, 503, { error: '尚未配置 DeepSeek API Key。请打开设置填写自己的 Key，或继续使用本地策划引擎。' });

    const now = Date.now();
    while (recentRequests.length && recentRequests[0] < now - 60000) recentRequests.shift();
    if (recentRequests.length >= 6) return send(res, 429, { error: '请求过于频繁，请稍后再试' });
    recentRequests.push(now);

    try {
      return send(res, 200, await assistWithDeepSeek(await readJson(req), key,requestFetch));
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
