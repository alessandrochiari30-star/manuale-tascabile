// Ricerche recenti: la più nuova in testa, senza doppioni, al massimo `max`.
export function addRecent(list, query, max = 5) {
  const clean = (Array.isArray(list) ? list : []).filter(item => typeof item === 'string' && item.trim());
  const wanted = String(query ?? '').trim();
  if (!wanted) return clean.slice(0, max);
  const lower = wanted.toLowerCase();
  return [wanted, ...clean.filter(item => item.toLowerCase() !== lower)].slice(0, max);
}
