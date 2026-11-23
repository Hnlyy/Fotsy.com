const META_KEY = 'idx:meta';
const SHARD_PREFIX = 'idx:shard:';
const SHARD_SIZE = 300;
const KEY_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomKey() {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => KEY_CHARS[byte % KEY_CHARS.length]).join('');
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeArticle(input, key, existing = {}) {
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags || '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    key,
    title: String(input.title || '').trim(),
    subtitle: String(input.subtitle || '').trim(),
    image: String(input.image || '').trim(),
    tags: [...new Set(tags)].slice(0, 20),
    content: String(input.content || ''),
    publishedAt: normalizeDate(input.publishedAt || existing.publishedAt),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createStore(kv) {
  async function readMeta() {
    const meta = await kv.get(META_KEY, { type: 'json' });
    return meta && typeof meta === 'object'
      ? { total: Number(meta.total) || 0, shards: Number(meta.shards) || 0 }
      : { total: 0, shards: 0 };
  }

  async function readShard(index) {
    const shard = await kv.get(`${SHARD_PREFIX}${index}`, { type: 'json' });
    return Array.isArray(shard) ? shard : [];
  }

  async function uniqueKey() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const key = randomKey();
      if ((await kv.get(key)) === undefined) return key;
    }
    throw new Error('无法生成唯一 KV 键，请稍后重试');
  }

  async function getArticle(key) {
    if (!/^[0-9a-z]{9}$/.test(key || '')) return null;
    const article = await kv.get(key, { type: 'json' });
    return article && typeof article === 'object' ? article : null;
  }

  async function allKeys() {
    const meta = await readMeta();
    const shards = await Promise.all(
      Array.from({ length: meta.shards }, (_, index) => readShard(index))
    );
    return [...new Set(shards.flat())].filter((key) => /^[0-9a-z]{9}$/.test(key));
  }

  async function loadArticles(keys) {
    const articles = await Promise.all(keys.map((key) => getArticle(key)));
    return articles.filter(Boolean).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async function listArticles({ limit = 20, offset = 0, query = '' } = {}) {
    const keyword = String(query || '').trim().toLowerCase();
    const keys = (await allKeys()).reverse();
    const articles = await loadArticles(keys);
    const filtered = keyword
      ? articles.filter((article) =>
          `${article.title} ${article.subtitle} ${article.tags.join(' ')}`.toLowerCase().includes(keyword)
        )
      : articles;
    return {
      total: filtered.length,
      items: filtered.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 20))
    };
  }

  async function randomArticles(count = 25) {
    const keys = await allKeys();
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return loadArticles(keys.slice(0, count));
  }

  async function createArticle(input) {
    const key = await uniqueKey();
    const article = normalizeArticle(input, key);
    await kv.put(key, JSON.stringify(article));

    const meta = await readMeta();
    const last = meta.shards > 0 ? meta.shards - 1 : 0;
    const shard = await readShard(last);
    shard.push(key);

    if (shard.length > SHARD_SIZE) {
      await kv.put(`${SHARD_PREFIX}${last}`, JSON.stringify(shard.slice(0, SHARD_SIZE)));
      await kv.put(`${SHARD_PREFIX}${last + 1}`, JSON.stringify(shard.slice(SHARD_SIZE)));
      await kv.put(META_KEY, JSON.stringify({ total: meta.total + 1, shards: last + 2 }));
    } else {
      await kv.put(`${SHARD_PREFIX}${last}`, JSON.stringify(shard));
      await kv.put(META_KEY, JSON.stringify({ total: meta.total + 1, shards: Math.max(meta.shards, last + 1) }));
    }
    return article;
  }

  async function updateArticle(key, input) {
    const existing = await getArticle(key);
    if (!existing) return null;
    const article = normalizeArticle(input, key, existing);
    await kv.put(key, JSON.stringify(article));
    return article;
  }

  async function deleteArticle(key) {
    const existing = await getArticle(key);
    if (!existing) return false;
    await kv.delete(key);

    const meta = await readMeta();
    for (let index = 0; index < meta.shards; index += 1) {
      const shard = await readShard(index);
      if (shard.includes(key)) {
        await kv.put(`${SHARD_PREFIX}${index}`, JSON.stringify(shard.filter((item) => item !== key)));
      }
    }
    await kv.put(META_KEY, JSON.stringify({ total: Math.max(0, meta.total - 1), shards: meta.shards }));
    return true;
  }

  return { getArticle, listArticles, randomArticles, createArticle, updateArticle, deleteArticle, allKeys };
}
