// Modello del manuale: nodi piatti con genitore e ordine. Ogni voce porta `upd`,
// così due dispositivi si fondono voce per voce e vince la modifica più recente.

const SCHEMA = 1;
const PROTECTED = new Set(['id', 'par', 'ord', 'upd', 'del']);
const BLOBS = ['calc', 'meta'];

export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

function pick(x, y) {
  if (!x) return y;
  if (!y) return x;
  if ((x.upd ?? 0) !== (y.upd ?? 0)) return (x.upd ?? 0) > (y.upd ?? 0) ? x : y;
  return stable(x) >= stable(y) ? x : y;
}

function mergeMaps(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = pick(a[key], b[key]);
  return out;
}

export function merge(a, b) {
  const out = { ...a, nodes: mergeMaps(a.nodes, b.nodes), state: mergeMaps(a.state, b.state) };
  for (const blob of BLOBS) {
    const chosen = pick(a[blob], b[blob]);
    if (chosen !== undefined) out[blob] = chosen;
  }
  return out;
}

function tick(prev, now) { return Math.max(now, (prev?.upd ?? 0) + 1); }

function need(doc, id) {
  const node = doc.nodes[id];
  if (!node) throw new Error('Voce inesistente: ' + id);
  return node;
}

export function editNode(doc, id, fields, now = Date.now()) {
  const prev = need(doc, id);
  const next = { ...prev };
  for (const [key, value] of Object.entries(fields)) {
    if (PROTECTED.has(key)) continue;
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  next.upd = tick(prev, now);
  doc.nodes[id] = next;
  return next;
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return 'u' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function addNode(doc, parentId, fields, now = Date.now()) {
  need(doc, parentId);
  const siblings = Object.values(doc.nodes).filter(n => n.par === parentId);
  const ord = siblings.reduce((max, n) => Math.max(max, n.ord ?? 0), -1) + 1;
  const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => !PROTECTED.has(k)));
  const id = newId();
  doc.nodes[id] = { ...clean, id, par: parentId, ord, upd: now };
  return id;
}

export function removeNode(doc, id, now = Date.now()) {
  const prev = need(doc, id);
  doc.nodes[id] = { ...prev, del: true, upd: tick(prev, now) };
}

export function restoreNode(doc, id, now = Date.now()) {
  const prev = need(doc, id);
  const { del, ...rest } = prev;
  doc.nodes[id] = { ...rest, upd: tick(prev, now) };
}

export function setState(doc, key, val, now = Date.now()) {
  doc.state[key] = { val, upd: tick(doc.state[key], now) };
}

export function getState(doc, key, fallback = undefined) {
  const entry = doc.state[key];
  return entry === undefined ? fallback : entry.val;
}

const ROOT = '\0root';

export function buildTree(doc) {
  const kids = new Map();
  const byId = new Map();
  for (const node of Object.values(doc.nodes)) {
    byId.set(node.id, node);
    if (node.del) continue;
    const key = node.par ?? ROOT;
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(node);
  }
  for (const list of kids.values()) {
    list.sort((x, y) => (x.ord ?? 0) - (y.ord ?? 0) || (x.id < y.id ? -1 : 1));
  }
  const visible = new Set();
  const stack = [...(kids.get(ROOT) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    visible.add(node.id);
    stack.push(...(kids.get(node.id) ?? []));
  }
  return { kids, byId, visible };
}

export function childrenOf(tree, id) { return tree.kids.get(id ?? ROOT) ?? []; }

export function breadcrumb(tree, id) {
  const path = [];
  let node = tree.byId.get(tree.byId.get(id)?.par);
  while (node) {
    path.unshift(node);
    node = tree.byId.get(node.par);
  }
  return path;
}

export function countDescendants(tree, id, ty) {
  let total = 0;
  const stack = [...childrenOf(tree, id)];
  while (stack.length) {
    const node = stack.pop();
    if (node.ty === ty) total++;
    stack.push(...childrenOf(tree, node.id));
  }
  return total;
}

function sameMap(a = {}, b = {}) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => b[k] !== undefined && (a[k] === b[k] || stable(a[k]) === stable(b[k])));
}

export function sameDoc(a, b) {
  return sameMap(a.nodes, b.nodes) && sameMap(a.state, b.state)
    && BLOBS.every(blob => stable(a[blob]) === stable(b[blob]));
}

export function validateDoc(doc) {
  const bad = msg => ({ ok: false, msg });
  if (!doc || typeof doc !== 'object') return bad('Documento assente');
  if (doc.schema !== SCHEMA) return bad('Versione del documento non supportata');
  if (!doc.nodes || typeof doc.nodes !== 'object') return bad('Voci assenti');
  if (!doc.state || typeof doc.state !== 'object') return bad('Stato assente');
  for (const [key, node] of Object.entries(doc.nodes)) {
    if (!node || node.id !== key) return bad('Voce con id incoerente: ' + key);
    if (typeof node.ty !== 'string') return bad('Voce senza tipo: ' + key);
    if (node.par !== null && !doc.nodes[node.par]) return bad('Voce senza genitore: ' + key);
  }
  const safe = new Set();
  for (const start of Object.keys(doc.nodes)) {
    const path = new Set();
    let id = start;
    while (id !== null && !safe.has(id)) {
      if (path.has(id)) return bad('Ciclo nelle voci: ' + id);
      path.add(id);
      id = doc.nodes[id].par;
    }
    for (const seen of path) safe.add(seen);
  }
  return { ok: true, msg: '' };
}
