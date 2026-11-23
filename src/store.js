import { plainText } from '../public/assets/markdown.js';

const INDEX_KEY = 'idx_articles';
const MAX_INDEX = 2000;
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

function toSummary(article) {
  return {
    key: article.key,
    title: article.title,
    subtitle: article.subtitle,
    image: article.image,
    tags: article.tags,
    publishedAt: article.publishedAt,
    summary: plainText(article.content, 110)
  };
}

export function createStore(kv) {
  async function readIndex() {
    const list = await kv.get(INDEX_KEY, { type: 'json' });
    return Array.isArray(list) ? list : [];
  }

  async function writeIndex(list) {
    await kv.put(INDEX_KEY, JSON.stringify(list.slice(0, MAX_INDEX)));
  }

  async function uniqueKey() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const key = randomKey();
      const existing = await kv.get(key, { type: 'text' });
      if (existing === undefined || existing === null || existing === '') return key;
    }
    throw new Error('无法生成唯一 KV 键，请稍后重试');
  }

  async function getArticle(key) {
    if (!/^[0-9a-z]{9}$/.test(key || '')) return null;
    const article = await kv.get(key, { type: 'json' });
    return article && typeof article === 'object' ? article : null;
  }

  async function allKeys() {
    return (await readIndex()).map((item) => item.key).filter((key) => /^[0-9a-z]{9}$/.test(key));
  }

  async function listArticles({ limit = 20, offset = 0, query = '' } = {}) {
    const index = await readIndex();
    const keyword = String(query || '').trim().toLowerCase();
    const sorted = index
      .filter((item) => /^[0-9a-z]{9}$/.test(item.key))
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    const filtered = keyword
      ? sorted.filter((item) =>
          `${item.title} ${item.subtitle} ${item.summary} ${(item.tags || []).join(' ')}`.toLowerCase().includes(keyword)
        )
      : sorted;
    const start = Math.max(Number(offset) || 0, 0);
    return {
      total: filtered.length,
      items: filtered.slice(start, start + (Number(limit) || 20))
    };
  }

  async function randomArticles(count = 25) {
    const index = await readIndex();
    const items = index.filter((item) => /^[0-9a-z]{9}$/.test(item.key));
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, count);
  }

  async function createArticle(input) {
    const key = await uniqueKey();
    const article = normalizeArticle(input, key);
    await kv.put(key, JSON.stringify(article));

    const index = await readIndex();
    index.unshift(toSummary(article));
    await writeIndex(index);
    return article;
  }

  async function updateArticle(key, input) {
    const existing = await getArticle(key);
    if (!existing) return null;
    const article = normalizeArticle(input, key, existing);
    await kv.put(key, JSON.stringify(article));

    const index = await readIndex();
    const position = index.findIndex((item) => item.key === key);
    const summary = toSummary(article);
    if (position >= 0) index[position] = summary;
    else index.unshift(summary);
    await writeIndex(index);
    return article;
  }

  async function deleteArticle(key) {
    const existing = await getArticle(key);
    if (!existing) return false;
    await kv.delete(key);

    const index = await readIndex();
    await writeIndex(index.filter((item) => item.key !== key));
    return true;
  }

  return { getArticle, listArticles, randomArticles, createArticle, updateArticle, deleteArticle, allKeys };
}
