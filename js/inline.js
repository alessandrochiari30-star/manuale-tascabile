// Formattazione minima dei testi. Produce pezzi, mai HTML: l'interfaccia li inserisce
// come testo, quindi un contenuto non può eseguire codice.

const PATTERN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_LINK = /^https?:\/\//i;

export function parseInline(text) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(PATTERN)) {
    if (match.index > last) parts.push({ k: 'text', t: source.slice(last, match.index) });
    const [, bold, code, label, href] = match;
    if (bold !== undefined) parts.push({ k: 'bold', t: bold });
    else if (code !== undefined) parts.push({ k: 'code', t: code });
    else if (SAFE_LINK.test(href)) parts.push({ k: 'link', t: label, href });
    else parts.push({ k: 'text', t: label });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ k: 'text', t: source.slice(last) });
  return parts;
}

export function plainText(text) {
  return parseInline(text).map(part => part.t).join('');
}
