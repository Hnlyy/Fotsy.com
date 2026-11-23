import { escapeHtml, plainText } from './markdown.js';

const pageSize = 10;
let page = 1;

const list = document.getElementById('articleList');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

function card(article) {
  const summary = article.subtitle || article.summary || plainText(article.content, 110);
  const date = String(article.publishedAt || '').slice(0, 10);
  const cover = article.image
    ? `<img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}" loading="lazy">`
    : '<span class="cover-placeholder">F</span>';
  const tags = (article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  return `<article class="article-card">
    <a class="card-cover" href="/p/${escapeHtml(article.key)}">${cover}</a>
    <div class="card-body">
      <h2><a href="/p/${escapeHtml(article.key)}">${escapeHtml(article.title)}</a></h2>
      <p class="card-summary">${escapeHtml(summary)}</p>
      <div class="card-meta"><time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(date)}</time><span class="tags">${tags}</span></div>
    </div>
  </article>`;
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return;
    const config = await response.json();
    document.title = `${config.name} - 分享技术与生活`;
    document.querySelectorAll('.js-site-name').forEach((node) => { node.textContent = config.name; });
    document.getElementById('icp').textContent = config.icp;
    document.getElementById('police').textContent = config.police;
    document.getElementById('siteDesc').textContent = config.description;
    document.getElementById('wechatQr').src = config.wechatQr;
  } catch {
    // 保留 HTML 中的默认展示值
  }
}

async function loadArticles() {
  list.innerHTML = '<p class="empty">文章加载中…</p>';
  try {
    const response = await fetch(`/api/articles?limit=${pageSize}&offset=${(page - 1) * pageSize}`);
    if (!response.ok) throw new Error('加载失败');
    const data = await response.json();
    list.innerHTML = data.items.length
      ? data.items.map(card).join('')
      : '<p class="empty">暂无文章，欢迎稍后再来。</p>';
    const total = Math.max(1, Math.ceil(data.total / pageSize));
    pageInfo.textContent = `第 ${page} / ${total} 页`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= total;
  } catch {
    list.innerHTML = '<p class="empty">文章加载失败，请刷新页面重试。</p>';
  }
}

prevBtn.addEventListener('click', () => {
  if (page > 1) { page -= 1; loadArticles(); }
});
nextBtn.addEventListener('click', () => {
  page += 1;
  loadArticles();
});

document.getElementById('year').textContent = new Date().getFullYear();
loadConfig();
loadArticles();
