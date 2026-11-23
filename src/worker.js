import { createStore } from './store.js';
import { adminPage, detailPage, notFoundPage, originOf, randomPage, siteConfig } from './shared.js';

const COOKIE_NAME = 'fotsy_admin';
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

function html(body, status = 200, cache = 'public, max-age=30') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache }
  });
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

async function runtimeEnv(runtimeEnv) {
  if (runtimeEnv && (runtimeEnv.ADMIN_USERNAME || runtimeEnv.ADMIN_PASSWORD)) return runtimeEnv;
  try {
    const module = await import('alibaba:workers');
    return module.env || runtimeEnv || {};
  } catch {
    return runtimeEnv || {};
  }
}

export default {
  async fetch(request, context, injectedEnv) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();
    const env = await runtimeEnv(injectedEnv);
    const config = siteConfig(env);
    const origin = originOf(request);
    const namespace = env.KV_NAMESPACE || 'tickle';
    const kv = new EdgeKV({ namespace });
    const store = createStore(kv);
    const secret = env.ADMIN_SECRET || `${env.ADMIN_USERNAME || ''}:${env.ADMIN_PASSWORD || ''}:fotsy-session`;
    const adminConfigured = Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD);

    async function authenticated() {
      const token = readCookie(request, COOKIE_NAME);
      const [payload, signature] = token.split('.');
      if (!payload || !signature || Number(payload) <= Date.now()) return false;
      return safeEqual(signature, await sign(payload, secret));
    }

    if (path === '/api/config' && method === 'GET') {
      return json({
        name: config.name,
        description: config.description,
        icp: config.icp,
        police: config.police,
        wechatQr: config.wechatQr
      });
    }

    if (path === '/api/articles' && method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      const result = await store.listArticles({ limit, offset });
      return json(result);
    }

    const publicArticle = path.match(/^\/api\/articles\/([0-9a-z]{9})$/);
    if (publicArticle && method === 'GET') {
      const article = await store.getArticle(publicArticle[1]);
      return article ? json(article) : json({ error: '文章不存在' }, 404);
    }

    if (path === '/api/admin/login' && method === 'POST') {
      if (!adminConfigured) return json({ error: '管理员账号未配置环境变量' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }
      if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
        return json({ error: '账号或密码错误' }, 401);
      }
      const expires = String(Date.now() + 24 * 60 * 60 * 1000);
      const signature = await sign(expires, secret);
      const secure = origin.startsWith('https:') ? '; Secure' : '';
      const cookie = `${COOKIE_NAME}=${expires}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
      return json({ ok: true }, 200, { 'Set-Cookie': cookie });
    }

    if (path === '/api/admin/logout' && method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    }

    if (path === '/api/admin/session' && method === 'GET') {
      return json({ authenticated: await authenticated(), username: env.ADMIN_USERNAME || '' });
    }

    if (path.startsWith('/api/admin/')) {
      if (!adminConfigured) return json({ error: '管理员账号未配置环境变量' }, 503);
      if (!(await authenticated())) return json({ error: '未登录或登录已过期' }, 401);

      if (path === '/api/admin/articles' && method === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 50);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        return json(await store.listArticles({ limit, offset, query: url.searchParams.get('q') || '' }));
      }

      if (path === '/api/admin/articles' && method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: '请求格式错误' }, 400);
        }
        if (!String(body.title || '').trim() || !String(body.content || '').trim()) {
          return json({ error: '标题和内容不能为空' }, 400);
        }
        try {
          return json(await store.createArticle(body), 201);
        } catch (error) {
          return json({ error: error.message || '创建失败' }, 500);
        }
      }

      const adminArticle = path.match(/^\/api\/admin\/articles\/([0-9a-z]{9})$/);
      if (adminArticle && method === 'GET') {
        const article = await store.getArticle(adminArticle[1]);
        return article ? json(article) : json({ error: '文章不存在' }, 404);
      }

      if (adminArticle && method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: '请求格式错误' }, 400);
        }
        const article = await store.updateArticle(adminArticle[1], body);
        return article ? json(article) : json({ error: '文章不存在' }, 404);
      }

      if (adminArticle && method === 'DELETE') {
        return (await store.deleteArticle(adminArticle[1]))
          ? json({ ok: true })
          : json({ error: '文章不存在' }, 404);
      }

      return json({ error: '接口不存在' }, 404);
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return json({ error: '方法不允许' }, 405);
    }

    if (path === '/agent') {
      return html(adminPage(config), 200, 'no-store');
    }

    const articlePath = path.match(/^\/p\/([0-9a-z]{9})$/);
    if (articlePath) {
      const article = await store.getArticle(articlePath[1]);
      return article
        ? html(detailPage(article, config, origin))
        : html(notFoundPage(config, origin), 404, 'no-store');
    }

    const articles = await store.randomArticles(25);
    return html(randomPage(articles, config, origin));
  }
};
