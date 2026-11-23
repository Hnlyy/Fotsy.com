import { escapeHtml, plainText, renderMarkdown } from '../public/assets/markdown.js';

export function siteConfig(env = {}) {
  return {
    name: env.SITE_NAME || 'Fotsy',
    description: env.SITE_DESCRIPTION || '分享技术、思考与生活的文章站点',
    icp: env.ICP_NO || '粤ICP备05070602号',
    police: env.POLICE_NO || '粤公网安备 11010102000001号',
    wechatQr: env.WECHAT_QR || '/assets/wechat-qr.svg'
  };
}

export function formatDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10).replace(/-/g, '-');
}

function sidebar(config) {
  return `
    <aside class="sidebar">
      <section class="side-card">
        <h2>扫码关注</h2>
        <img class="wechat-qr" src="${escapeHtml(config.wechatQr)}" alt="微信二维码" loading="lazy">
        <p>用微信扫码，获取更多内容与更新</p>
      </section>
      <section class="side-card">
        <h2>站点说明</h2>
        <p>${escapeHtml(config.description)}</p>
      </section>
    </aside>`;
}

function layout({ config, title, description, canonical, robots, ogImage, jsonLd, body, script }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(config.name)},文章,博客">
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
  <meta property="og:type" content="${jsonLd ? 'article' : 'website'}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
  ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
  <link rel="stylesheet" href="/assets/style.css">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">${escapeHtml(config.name)}</a>
      <nav class="nav">
        <a href="/">首页</a>
        <a href="/archives">文章归档</a>
      </nav>
    </div>
  </header>
  <main class="container">${body}</main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p>© ${new Date().getFullYear()} ${escapeHtml(config.name)}. 保留所有权利。</p>
      <p><span>${escapeHtml(config.icp)}</span><span class="divider">·</span><span>${escapeHtml(config.police)}</span></p>
    </div>
  </footer>
  ${script ? `<script type="module" src="${script}"></script>` : ''}
</body>
</html>`;
}

export function articleCard(article) {
  const summary = article.subtitle || plainText(article.content, 110);
  return `
    <article class="article-card">
      <a class="card-cover" href="/p/${escapeHtml(article.key)}">
        ${article.image ? `<img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}" loading="lazy">` : '<span class="cover-placeholder">F</span>'}
      </a>
      <div class="card-body">
        <h2><a href="/p/${escapeHtml(article.key)}">${escapeHtml(article.title)}</a></h2>
        <p class="card-summary">${escapeHtml(summary)}</p>
        <div class="card-meta">
          <time datetime="${escapeHtml(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
          <span class="tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</span>
        </div>
      </div>
    </article>`;
}

export function detailPage(article, config, origin) {
  const description = article.subtitle || plainText(article.content, 160);
  const canonical = `${origin}/p/${article.key}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    image: article.image || undefined,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    author: { '@type': 'Organization', name: config.name },
    publisher: { '@type': 'Organization', name: config.name },
    mainEntityOfPage: canonical
  };
  const body = `
    <div class="content-layout">
      <div class="content-main">
        <article class="article-detail">
          <h1>${escapeHtml(article.title)}</h1>
          ${article.subtitle ? `<p class="article-subtitle">${escapeHtml(article.subtitle)}</p>` : ''}
          <div class="article-meta">
            <time datetime="${escapeHtml(article.publishedAt)}">发布于 ${formatDate(article.publishedAt)}</time>
            <span class="tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</span>
          </div>
          ${article.image ? `<img class="article-cover" src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}">` : ''}
          <div class="article-content markdown-body">${renderMarkdown(article.content)}</div>
        </article>
      </div>
      ${sidebar(config)}
    </div>`;
  return layout({
    config,
    title: `${article.title} - ${config.name}`,
    description,
    canonical,
    ogImage: article.image,
    jsonLd,
    body
  });
}

export function randomPage(articles, config, origin) {
  const body = `
    <div class="content-layout">
      <div class="content-main">
        <section class="list-page">
          <h1>发现更多内容</h1>
          <p class="page-intro">为您随机推荐 ${articles.length} 篇文章</p>
          ${articles.length ? `<div class="article-list">${articles.map(articleCard).join('')}</div>` : '<p class="empty">暂无文章，请稍后再来。</p>'}
        </section>
      </div>
      ${sidebar(config)}
    </div>`;
  return layout({
    config,
    title: `发现更多内容 - ${config.name}`,
    description: `随机浏览 ${config.name} 的文章内容`,
    canonical: `${origin}/archives`,
    robots: 'noindex,follow',
    body
  });
}

export function adminPage(config) {
  const body = `
    <div class="admin-wrap">
      <section id="loginPanel" class="admin-panel">
        <h1>后台登录</h1>
        <form id="loginForm">
          <label>账号<input name="username" autocomplete="username" required></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit">登录</button>
          <p id="loginError" class="form-error"></p>
        </form>
      </section>
      <section id="adminPanel" class="admin-panel" hidden>
        <div class="admin-head">
          <h1>内容管理</h1>
          <div>
            <button id="newBtn" type="button">新建文章</button>
            <button id="logoutBtn" type="button" class="ghost">退出</button>
          </div>
        </div>
        <div class="admin-toolbar">
          <input id="searchInput" type="search" placeholder="搜索标题、副标题或标签">
          <span id="listTotal" class="muted"></span>
        </div>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>标题</th><th>标签</th><th>发布时间</th><th>KV 键</th><th>操作</th></tr></thead>
            <tbody id="articleRows"></tbody>
          </table>
        </div>
        <div class="pager">
          <button id="prevBtn" type="button" class="ghost">上一页</button>
          <span id="pageInfo"></span>
          <button id="nextBtn" type="button" class="ghost">下一页</button>
        </div>
      </section>
      <section id="editorPanel" class="admin-panel editor-panel" hidden>
        <div class="admin-head"><h1 id="editorTitle">新建文章</h1><button id="closeEditorBtn" type="button" class="ghost">返回列表</button></div>
        <form id="editorForm">
          <input type="hidden" name="key">
          <div class="form-grid">
            <label>标题<input name="title" required maxlength="120"></label>
            <label>副标题<input name="subtitle" maxlength="200"></label>
            <label>主图地址<input name="image" placeholder="https://..."></label>
            <label>标签（逗号分隔）<input name="tags" placeholder="技术,随笔"></label>
            <label>发布时间<input name="publishedAt" type="datetime-local"></label>
          </div>
          <div class="editor-toolbar">
            <button type="button" data-md="heading">标题</button>
            <button type="button" data-md="bold">粗体</button>
            <button type="button" data-md="italic">斜体</button>
            <button type="button" data-md="link">链接</button>
            <button type="button" data-md="image">图片</button>
            <button type="button" data-md="code">代码</button>
            <button type="button" data-md="quote">引用</button>
            <button type="button" data-md="list">列表</button>
          </div>
          <div class="editor-grid">
            <label>Markdown<textarea name="content" id="mdInput" spellcheck="false" placeholder="# 从这里开始写作..."></textarea></label>
            <div class="preview"><h3>实时预览</h3><div id="mdPreview" class="markdown-body"></div></div>
          </div>
          <p id="editorError" class="form-error"></p>
          <div class="admin-actions"><button type="submit">保存文章</button></div>
        </form>
      </section>
    </div>`;
  return layout({
    config,
    title: `内容管理 - ${config.name}`,
    description: '后台内容管理',
    robots: 'noindex,nofollow',
    body,
    script: '/assets/admin.js'
  });
}

export function notFoundPage(config, origin) {
  return layout({
    config,
    title: `文章不存在 - ${config.name}`,
    description: '文章不存在或已删除',
    canonical: `${origin}/`,
    robots: 'noindex,follow',
    body: `
      <div class="content-layout">
        <div class="content-main"><section class="list-page"><h1>文章不存在</h1><p class="empty">这篇文章可能已被删除，返回<a href="/">首页</a>看看。</p></section></div>
        ${sidebar(config)}
      </div>`
  });
}

export function originOf(request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}
