// Ricerca su tutto il manuale, senza rete: tollera ordine diverso, parole a metà,
// errori di battitura e plurali. Le voci con tutte le parole vengono prima.

const SCORE = { exact: 10, prefix: 6, inner: 5, fuzzy1: 4, fuzzy2: 2, synonym: 3 };
const TITLE_BONUS = 2.5;
const TOKEN = /[a-z0-9]+(?:[.,][0-9]+)*/g;
const STOP = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'e', 'o', 'ed', 'che', 'si', 'come', 'cosa', 'del', 'della', 'dei', 'delle', 'dello', 'al', 'alla', 'ai', 'alle', 'allo', 'nel', 'nella', 'nei', 'nelle', 'sul', 'sulla', 'quanto', 'quale', 'quali', 'quando', 'dove', 'non', 'mi', 'ti', 'ci', 'vi', 'fa', 'fare']);

export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function tokenize(text) { return normalize(text).match(TOKEN) ?? []; }

const hasDigit = word => /\d/.test(word);

export function buildIndex(entries) {
  const vocab = new Map();
  const titles = entries.map(entry => new Set(tokenize(entry.title ?? '')));
  entries.forEach((entry, idx) => {
    for (const word of new Set(tokenize(entry.text))) {
      if (!vocab.has(word)) vocab.set(word, []);
      vocab.get(word).push(idx);
    }
  });
  return { entries, vocab, titles };
}

// Un testo lungo contiene più parole per caso: pesa meno di una voce breve e mirata.
function lengthFactor(length) { return 1 / (1 + 0.5 * Math.log10(1 + length / 80)); }

// Distanza di Damerau-Levenshtein con uscita anticipata oltre `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

function matchWord(token, word) {
  if (word === token) return SCORE.exact;
  if (hasDigit(token)) return token.length >= 3 && word.startsWith(token) ? SCORE.prefix : 0;
  if (word.startsWith(token) && token.length >= 2) return SCORE.prefix;
  if (token.length >= 4 && word.includes(token)) return SCORE.inner;
  if (token.length < 5 || hasDigit(word)) return 0;
  const max = token.length >= 9 ? 2 : 1;
  const d = distance(token, word, max);
  if (d > max) return 0;
  return d === 1 ? SCORE.fuzzy1 : SCORE.fuzzy2;
}

function synonymsOf(token, groups) {
  const out = new Set();
  for (const group of groups) {
    const words = group.map(normalize);
    if (words.includes(token)) words.filter(w => w !== token).forEach(w => out.add(w));
  }
  return out;
}

function queryTokens(query) {
  const all = [...new Set(tokenize(query))];
  const useful = all.filter(t => !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
  return useful.length ? useful : all.filter(t => t.length > 1);
}

export function search(index, query, { limit = 60, synonyms = [] } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const hits = new Map();

  const record = (idx, tokenPos, score, word) => {
    if (!hits.has(idx)) hits.set(idx, { best: new Map(), words: new Set() });
    const hit = hits.get(idx);
    if ((hit.best.get(tokenPos) ?? 0) < score) hit.best.set(tokenPos, score);
    hit.words.add(word);
  };

  tokens.forEach((token, pos) => {
    const related = synonymsOf(token, synonyms);
    for (const [word, postings] of index.vocab) {
      const direct = matchWord(token, word);
      const viaSynonym = related.has(word) ? SCORE.synonym : 0;
      const score = Math.max(direct, viaSynonym);
      if (score) {
        for (const idx of postings) {
          record(idx, pos, index.titles[idx].has(word) ? score * TITLE_BONUS : score, word);
        }
      }
    }
  });

  const results = [];
  for (const [idx, hit] of hits) {
    const entry = index.entries[idx];
    let score = 0;
    for (const value of hit.best.values()) score += value;
    results.push({
      id: entry.id,
      idx,
      matched: hit.best.size,
      score: score * (entry.boost ?? 1) * lengthFactor(entry.text.length),
      words: [...hit.words],
      length: entry.text.length,
    });
  }
  results.sort((x, y) => y.matched - x.matched || y.score - x.score || x.length - y.length || x.idx - y.idx);
  return results.slice(0, limit).map(({ id, score, matched, words }) => ({ id, score, matched, words }));
}
