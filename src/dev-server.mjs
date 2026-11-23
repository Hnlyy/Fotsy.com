import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import worker from './worker.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = join(root, 'public');
const dbFile = join(root, '.dev-kv.json');

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

async function loadEnv() {
  const env = { ...process.env };
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index > 0) env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
  } catch {
    // 没有 .env 时直接使用进程环境变量
  }
  return env;
}

class DevEdgeKV {
  constructor(namespace) {
    this.namespace = namespace;
  }

  static async load() {
    DevEdgeKV.store = new Map();
    try {
      const parsed = JSON.parse(await readFile(dbFile, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) DevEdgeKV.store.set(key, value);
    } catch {
      // 首次运行
    }
  }

  static persist() {
    clearTimeout(DevEdgeKV.timer);
    DevEdgeKV.timer = setTimeout(async () => {
      const data = Object.fromEntries(DevEdgeKV.store);
      await writeFile(dbFile, JSON.stringify(data, null, 2), 'utf8');
    }, 100);
  }

  async get(key, options = {}) {
    const value = DevEdgeKV.store.get(`${this.namespace}:${key}`);
    if (value === undefined) return undefined;
    return options.type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value) {
    DevEdgeKV.store.set(`${this.namespace}:${key}`, String(value));
    DevEdgeKV.persist();
  }

  async delete(key) {
    const result = DevEdgeKV.store.delete(`${this.namespace}:${key}`);
    DevEdgeKV.persist();
    return result;
  }
}

globalThis.EdgeKV = DevEdgeKV;
await DevEdgeKV.load();
const env = await loadEnv();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(publicDir, relative));

  if (filePath.startsWith(publicDir)) {
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    } catch {
      // 静态文件不存在，交给边缘函数处理
    }
  }

  try {
    const result = await worker.fetch(new Request(url, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text()
    }), {}, env);
    const headers = Object.fromEntries(result.headers.entries());
    response.writeHead(result.status, headers);
    response.end(request.method === 'HEAD' ? undefined : await result.text());
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`服务器错误: ${error.stack || error.message}`);
  }
});

const port = Number(env.PORT) || 8787;
server.listen(port, () => console.log(`本地预览: http://localhost:${port}  后台: http://localhost:${port}/agent`));
