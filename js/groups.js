// Gruppi per cliente e canale: raccolgono da tutto il manuale le voci che nominano certe parole.
// Nomi e parole dei gruppi stanno solo nel documento cifrato (meta.gruppi), mai in questo codice.
import { childrenOf } from './doc.js';
import { entryText } from './entries.js';

const CONTENT = new Set(['pt', 'num', 'qa', 'proc', 'tab']);

const slug = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Tiene solo i gruppi ben fatti: nome, almeno una parola, id unico.
export function cleanGroups(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const group of list) {
    if (!group || typeof group.t !== 'string' || !group.t.trim()) continue;
    const parole = (Array.isArray(group.parole) ? group.parole : [])
      .filter(word => typeof word === 'string' && word.trim())
      .map(word => word.trim());
    if (!parole.length) continue;
    const id = slug(typeof group.id === 'string' && group.id.trim() ? group.id : group.t);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, t: group.t.trim(), parole });
  }
  return out;
}

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Vero se il testo contiene una delle parole come parola intera, senza badare a maiuscole.
export function matcher(words) {
  const body = words.map(word => escapeRe(word).replace(/\s+/g, '\\s+')).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'iu');
  return text => re.test(text);
}

// Voci del gruppo dentro `scopeId` (o in tutto il manuale), divise per sezione nell'ordine del manuale.
// Una voce presa porta con sé le sue sotto-voci: quelle non si ripetono.
export function groupHits(tree, group, scopeId = null) {
  const test = matcher(group.parole);
  const out = [];
  const walk = (id, entry, ambito) => {
    for (const node of childrenOf(tree, id)) {
      if (node.ty === 'amb') {
        walk(node.id, null, node);
      } else if (node.ty === 'sec') {
        const next = { section: node, ambito, items: [] };
        out.push(next);
        walk(node.id, next, ambito);
      } else if (entry && CONTENT.has(node.ty)) {
        if (test(entryText(node))) entry.items.push(node);
        else walk(node.id, entry, ambito);
      }
    }
  };
  const scope = scopeId ? tree.byId.get(scopeId) : null;
  walk(scopeId, null, scope?.ty === 'amb' ? scope : null);
  return out.filter(entry => entry.items.length);
}

export const countHits = hits => hits.reduce((total, entry) => total + entry.items.length, 0);
