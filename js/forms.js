// Conversioni tra voci del documento e testo modificabile, ed estratti per i risultati.
import { normalize } from './search.js';

const SOURCES_AT_END = /((?:\s+@[A-Z]\d*)+)\s*$/;

export function rowsToText(rows = []) { return rows.map(row => row.join(' | ')).join('\n'); }

export function textToRows(text, columns = 1) {
  return String(text ?? '').split('\n')
    .filter(line => line.trim())
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim());
      while (cells.length < columns) cells.push('');
      return cells;
    });
}

export function stepsToText(steps = []) {
  return steps.map(step => {
    const detail = step.d ? ` :: ${step.d}` : '';
    const sources = (step.s ?? []).map(s => ` @${s}`).join('');
    return step.t + detail + sources;
  }).join('\n');
}

export function textToSteps(text) {
  return String(text ?? '').split('\n')
    .filter(line => line.trim())
    .map(line => {
      let body = line.trim();
      const s = [];
      const found = body.match(SOURCES_AT_END);
      if (found) {
        s.push(...found[1].trim().split(/\s+/).map(code => code.slice(1)));
        body = body.slice(0, found.index);
      }
      const split = body.indexOf(' :: ');
      return split < 0
        ? { t: body.trim(), d: '', s }
        : { t: body.slice(0, split).trim(), d: body.slice(split + 4).trim(), s };
    });
}

export function listToText(list) { return (list ?? []).join('\n'); }
export function textToList(text) { return String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean); }

export function sourcesToText(sources) { return (sources ?? []).join(', '); }
export function textToSources(text) { return String(text ?? '').split(/[,\s]+/).filter(Boolean); }

export function sourceLabel(code, map = {}) {
  const match = String(code).match(/^([A-Z])(\d*)$/);
  if (!match || !map[match[1]]) return String(code);
  return match[2] ? `${map[match[1]]} ${match[2]}` : map[match[1]];
}

function normalizedWithMap(text) {
  let out = '';
  const positions = [];
  for (let i = 0; i < text.length; i++) {
    for (const ch of normalize(text[i])) {
      out += ch;
      positions.push(i);
    }
  }
  return { out, positions };
}

function findHits(text, words) {
  const { out, positions } = normalizedWithMap(text);
  const hits = [];
  for (const word of words) {
    const safe = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safe) continue;
    for (const match of out.matchAll(new RegExp(`(?<![a-z0-9])${safe}(?![a-z0-9])`, 'g'))) {
      hits.push([positions[match.index], positions[match.index + match[0].length - 1] + 1]);
    }
  }
  hits.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (last && hit[0] <= last[1]) last[1] = Math.max(last[1], hit[1]);
    else merged.push([...hit]);
  }
  return merged;
}

export function snippet(text, words = [], max = 160) {
  const source = String(text ?? '');
  const hits = findHits(source, words);
  let from = 0;
  let to = source.length;
  if (source.length > max) {
    from = Math.max(0, (hits[0]?.[0] ?? 0) - Math.floor(max / 2));
    to = Math.min(source.length, from + max);
    from = Math.max(0, to - max);
  }
  const parts = [];
  if (from > 0) parts.push({ t: '…', hit: false });
  let cursor = from;
  for (const [start, end] of hits) {
    if (end <= from || start >= to) continue;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (a > cursor) parts.push({ t: source.slice(cursor, a), hit: false });
    parts.push({ t: source.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < to) parts.push({ t: source.slice(cursor, to), hit: false });
  if (to < source.length) parts.push({ t: '…', hit: false });
  return parts;
}
