export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const value = String(url || '').trim();
  return /^(javascript|data|vbscript):/i.test(value) ? '#' : escapeHtml(value);
}

function inline(text) {
  const held = [];
  const hold = (html) => {
    held.push(html);
    return `\u0000${held.length - 1}\u0000`;
  };

  let value = String(text || '').replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  value = escapeHtml(value);
  value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
    hold(`<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`)
  );
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
    hold(`<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
  );
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  value = value.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  value = value.replace(/\u0000(\d+)\u0000/g, (_, index) => held[Number(index)] || '');
  return value;
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

export function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const lang = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = cells(line);
      const aligns = cells(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left'
      );
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        body.push(cells(lines[i]));
        i += 1;
      }
      const th = header.map((cell, index) => `<th style="text-align:${aligns[index] || 'left'}">${inline(cell)}</th>`).join('');
      const tr = body
        .map((row) => `<tr>${header.map((_, index) => `<td style="text-align:${aligns[index] || 'left'}">${inline(row[index] || '')}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
      continue;
    }

    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s{0,3}[-*+]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s{0,3}\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s{0,3}\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|>|[-*+]\s|\d+\.\s)/.test(lines[i]) && !/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  return out.join('\n');
}

export function plainText(markdown, max = 160) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
