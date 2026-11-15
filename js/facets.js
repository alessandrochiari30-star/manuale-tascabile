// Filtri dei risultati per tipo di voce. Un dubbio è un tipo a sé, non un punto.
// Le domande di ripasso ripetono per forza ciò che sta già nei punti: hanno il loro
// filtro e restano fuori da «Tutto», così una ricerca non mostra la stessa cosa due volte.
const ORDER = [['pt', 'Punti'], ['proc', 'Procedure'], ['num', 'Numeri'], ['tab', 'Tabelle'], ['dubbio', 'Dubbi'], ['qa', 'Domande']];
const DIRECT = new Set(['pt', 'proc', 'num', 'tab', 'qa']);
const APART = 'qa';

export function kindOf(node) {
  if (!node) return null;
  if (node.k === 'q') return 'dubbio';
  return DIRECT.has(node.ty) ? node.ty : null;
}

export function facets(results, nodes) {
  const present = results.filter(r => nodes[r.id]);
  const counts = new Map();
  for (const r of present) {
    const kind = kindOf(nodes[r.id]);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [
    { key: 'tutto', label: 'Tutto', count: present.length - (counts.get(APART) ?? 0) },
    ...ORDER.filter(([key]) => counts.has(key)).map(([key, label]) => ({ key, label, count: counts.get(key) })),
  ];
}

// Il filtro da mostrare all'apertura: quello chiesto, altrimenti «Tutto»; se fuori dalle
// domande non c'è nulla si aprono direttamente le domande.
export function activeFacet(chips, wanted) {
  if (wanted !== 'tutto' && chips.some(chip => chip.key === wanted)) return wanted;
  return chips[0].count === 0 && chips.some(chip => chip.key === APART) ? APART : 'tutto';
}

export function filterResults(results, nodes, key) {
  if (!ORDER.some(([k]) => k === key)) return results.filter(r => kindOf(nodes[r.id]) !== APART);
  return results.filter(r => kindOf(nodes[r.id]) === key);
}
