import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../src/worker.js';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

class MockEdgeKV {
  static store = new Map();
  static calls = 0;
  constructor({ namespace }) { this.namespace = namespace; }
  async get(key, options = {}) {
    MockEdgeKV.calls += 1;
    const value = MockEdgeKV.store.get(`${this.namespace}:${key}`);
    if (value === undefined) return undefined;
    return options.type === 'json' ? JSON.parse(value) : value;
  }
  async put(key, value) { MockEdgeKV.calls += 1; MockEdgeKV.store.set(`${this.namespace}:${key}`, String(value)); }
  async delete(key) { MockEdgeKV.calls += 1; return MockEdgeKV.store.delete(`${this.namespace}:${key}`); }
}
globalThis.EdgeKV = MockEdgeKV;

const env = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'test-password',
  ADMIN_SECRET: 'test-secret',
  KV_NAMESPACE: 'tickle',
  SITE_NAME: '测试站点',
  ICP_NO: '粤ICP备12345678号',
  POLICE_NO: '粤公网安备12345678901234号'
};

async function call(path, options = {}, cookie = '') {
  MockEdgeKV.calls = 0;
  const request = new Request(`https://example.com${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await worker.fetch(request, {}, env);
  assert.ok(MockEdgeKV.calls <= 10, `${path}: KV 调用 ${MockEdgeKV.calls} 次，超过 10 次限制`);
  return result;
}

const configResponse = await call('/api/config');
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
assert.equal(config.icp, '粤ICP备12345678号');

const unauth = await call('/api/admin/articles');
assert.equal(unauth.status, 401);

const badLogin = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
assert.equal(badLogin.status, 401);

const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'test-password' } });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];

const createdResponse = await call('/api/admin/articles', {
  method: 'POST',
  cookie,
  body: {
    title: '测试文章',
    subtitle: '副标题',
    image: '',
    tags: '技术, 测试',
    content: '# 标题\n\n这是**正文**内容。',
    publishedAt: '2026-11-23T10:00:00Z'
  }
}, cookie);
assert.equal(createdResponse.status, 201);
const article = await createdResponse.json();
assert.match(article.key, /^[0-9a-z]{9}$/);

const list = await (await call('/api/articles?limit=10')).json();
assert.equal(list.total, 1);
assert.equal(list.items[0].title, '测试文章');

const detail = await call(`/p/${article.key}`);
assert.equal(detail.status, 200);
const detailHtml = await detail.text();
assert.match(detailHtml, /<title>测试文章 - 测试站点<\/title>/);
assert.match(detailHtml, /application\/ld\+json/);
assert.match(detailHtml, /<strong>正文<\/strong>/);

const other = await call('/some/random/path');
assert.equal(other.status, 200);
assert.match(await other.text(), /发现更多内容/);

const admin = await call('/agent');
assert.equal(admin.status, 200);
assert.match(await admin.text(), /内容管理/);

const updatedResponse = await call(`/api/admin/articles/${article.key}`, {
  method: 'PUT',
  body: { title: '已更新标题', content: '新内容' }
}, cookie);
assert.equal(updatedResponse.status, 200);
assert.equal((await updatedResponse.json()).title, '已更新标题');

const deleted = await call(`/api/admin/articles/${article.key}`, { method: 'DELETE' }, cookie);
assert.equal(deleted.status, 200);
assert.equal((await (await call('/api/articles')).json()).total, 0);

console.log('smoke test: all checks passed');
