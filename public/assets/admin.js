import { escapeHtml, renderMarkdown } from './markdown.js';

const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const editorPanel = document.getElementById('editorPanel');
const rows = document.getElementById('articleRows');
const searchInput = document.getElementById('searchInput');
const listTotal = document.getElementById('listTotal');
const pageInfo = document.getElementById('pageInfo');
const editorForm = document.getElementById('editorForm');
const mdInput = document.getElementById('mdInput');
const mdPreview = document.getElementById('mdPreview');

const pageSize = 10;
let page = 1;
let keyword = '';

function pad(value) { return String(value).padStart(2, '0'); }

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function show(panel) {
  loginPanel.hidden = panel !== 'login';
  adminPanel.hidden = panel !== 'admin';
  editorPanel.hidden = panel !== 'editor';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function renderRows(items) {
  rows.innerHTML = items.map((article) => `
    <tr>
      <td><a href="/p/${escapeHtml(article.key)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>
        ${article.subtitle ? `<div class="muted">${escapeHtml(article.subtitle)}</div>` : ''}</td>
      <td>${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</td>
      <td>${escapeHtml(String(article.publishedAt || '').slice(0, 10))}</td>
      <td><code>${escapeHtml(article.key)}</code></td>
      <td><div class="row-actions">
        <button type="button" data-action="edit" data-key="${escapeHtml(article.key)}">编辑</button>
        <button type="button" class="danger" data-action="delete" data-key="${escapeHtml(article.key)}">删除</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">暂无文章</td></tr>';
}

async function loadList() {
  try {
    const query = new URLSearchParams({ limit: pageSize, offset: (page - 1) * pageSize, q: keyword });
    const data = await api(`/api/admin/articles?${query}`);
    renderRows(data.items);
    listTotal.textContent = `共 ${data.total} 篇`;
    const total = Math.max(1, Math.ceil(data.total / pageSize));
    pageInfo.textContent = `第 ${page} / ${total} 页`;
  } catch (error) {
    listTotal.textContent = error.message;
  }
}

function openEditor(article = null) {
  editorForm.reset();
  editorForm.elements.key.value = article?.key || '';
  editorForm.elements.title.value = article?.title || '';
  editorForm.elements.subtitle.value = article?.subtitle || '';
  editorForm.elements.image.value = article?.image || '';
  editorForm.elements.tags.value = (article?.tags || []).join(', ');
  editorForm.elements.publishedAt.value = toLocalInput(article?.publishedAt || new Date().toISOString());
  mdInput.value = article?.content || '';
  mdPreview.innerHTML = renderMarkdown(mdInput.value);
  document.getElementById('editorTitle').textContent = article ? '编辑文章' : '新建文章';
  document.getElementById('editorError').textContent = '';
  show('editor');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function insertMarkdown(type) {
  const start = mdInput.selectionStart;
  const end = mdInput.selectionEnd;
  const selected = mdInput.value.slice(start, end);
  const patterns = {
    heading: `## ${selected || '标题'}`,
    bold: `**${selected || '粗体文字'}**`,
    italic: `*${selected || '斜体文字'}*`,
    link: `[${selected || '链接文字'}](https://example.com)`,
    image: `![${selected || '图片描述'}](https://example.com/image.jpg)`,
    code: `\n\`\`\`js\n${selected || '// 代码'}\n\`\`\`\n`,
    quote: `> ${selected || '引用内容'}`,
    list: `- ${selected || '列表项'}`
  };
  const text = patterns[type] || selected;
  mdInput.value = mdInput.value.slice(0, start) + text + mdInput.value.slice(end);
  const cursor = start + text.length;
  mdInput.focus();
  mdInput.setSelectionRange(cursor, cursor);
  mdPreview.innerHTML = renderMarkdown(mdInput.value);
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('loginError');
  error.textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') })
    });
    show('admin');
    await loadList();
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  show('login');
});

document.getElementById('newBtn').addEventListener('click', () => openEditor());
document.getElementById('closeEditorBtn').addEventListener('click', () => show('admin'));
document.querySelectorAll('.editor-toolbar button').forEach((button) => {
  button.addEventListener('click', () => insertMarkdown(button.dataset.md));
});
mdInput.addEventListener('input', () => { mdPreview.innerHTML = renderMarkdown(mdInput.value); });

rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const key = button.dataset.key;
  if (button.dataset.action === 'edit') {
    try {
      openEditor(await api(`/api/admin/articles/${key}`));
    } catch (error) {
      listTotal.textContent = error.message;
    }
    return;
  }
  if (!window.confirm('确定删除这篇文章吗？此操作不可恢复。')) return;
  try {
    await api(`/api/admin/articles/${key}`, { method: 'DELETE' });
    await loadList();
  } catch (error) {
    listTotal.textContent = error.message;
  }
});

editorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('editorError');
  error.textContent = '';
  const form = new FormData(editorForm);
  const payload = {
    title: form.get('title'),
    subtitle: form.get('subtitle'),
    image: form.get('image'),
    tags: form.get('tags'),
    publishedAt: form.get('publishedAt'),
    content: form.get('content')
  };
  const key = form.get('key');
  try {
    await api(key ? `/api/admin/articles/${key}` : '/api/admin/articles', {
      method: key ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    show('admin');
    page = 1;
    await loadList();
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    keyword = searchInput.value.trim();
    page = 1;
    loadList();
  }, 250);
});
document.getElementById('prevBtn').addEventListener('click', () => {
  if (page > 1) { page -= 1; loadList(); }
});
document.getElementById('nextBtn').addEventListener('click', () => {
  page += 1;
  loadList();
});

api('/api/admin/session').then((session) => {
  if (session.authenticated) {
    show('admin');
    loadList();
  } else {
    show('login');
  }
}).catch(() => show('login'));
