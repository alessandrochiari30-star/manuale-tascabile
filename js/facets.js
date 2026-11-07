// Filtri dei risultati per tipo di voce. Un dubbio è un tipo a sé, non un punto.
const ORDER = [['pt', 'Punti'], ['proc', 'Procedure'], ['num', 'Numeri'], ['tab', 'Tabelle'], ['dubbio', 'Dubbi']];
const DIRECT = new Set(['pt', 'proc', 'num', 'tab']);

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
    { key: 'tutto', label: 'Tutto', count: present.length },
    ...ORDER.filter(([key]) => counts.has(key)).map(([key, label]) => ({ key, label, count: counts.get(key) })),
  ];
}

export function filterResults(results, nodes, key) {
  if (!ORDER.some(([k]) => k === key)) return results;
  return results.filter(r => kindOf(nodes[r.id]) === key);
}
