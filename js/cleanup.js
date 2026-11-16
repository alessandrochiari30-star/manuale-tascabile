// Pulizia dei doppioni: applica un file di correzioni preparato sul PC.
// Ogni correzione porta `se`, l'`upd` che la voce aveva quando è stata analizzata: se da
// allora la voce è cambiata la correzione si salta, così non si perde una modifica fatta
// a mano. Le voci tolte restano nel documento come eliminate e l'ultima pulizia si annulla.
//
//   togli   la voce è un doppione di quelle in `tieni`, che devono esserci ancora
//   cambia  corregge i campi indicati
//   sposta  porta la voce, con ciò che ha sotto, in fondo a `par`; può anche correggerla
import { buildTree, childrenOf, editNode, moveNode, removeNode, restoreNode, getState, setState } from './doc.js';

const UNDO_KEY = 'pulizia';

const isRef = ref => ref && typeof ref.id === 'string' && Number.isFinite(ref.se);
const hasFields = campi => campi && typeof campi === 'object' && Object.keys(campi).length > 0;

// Una sola correzione per voce: la prima che compare nel file.
export function cleanFixes(data) {
  const list = Array.isArray(data) ? data : data?.correzioni;
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const fix of list) {
    if (!isRef(fix) || seen.has(fix.id)) continue;
    let clean = null;
    if (fix.op === 'togli' && Array.isArray(fix.tieni) && fix.tieni.length && fix.tieni.every(isRef)) {
      clean = { op: 'togli', id: fix.id, se: fix.se, tieni: fix.tieni.map(({ id, se }) => ({ id, se })) };
    } else if (fix.op === 'cambia' && hasFields(fix.campi)) {
      clean = { op: 'cambia', id: fix.id, se: fix.se, campi: fix.campi };
    } else if (fix.op === 'sposta' && typeof fix.par === 'string') {
      clean = { op: 'sposta', id: fix.id, se: fix.se, par: fix.par };
      if (hasFields(fix.campi)) clean.campi = fix.campi;
    }
    if (clean) {
      seen.add(fix.id);
      out.push(clean);
    }
  }
  return out;
}

// Nel file `null` vuol dire «togli il campo»: JSON non ha un valore per l'assenza.
const fieldsOf = campi => Object.fromEntries(Object.entries(campi).map(([key, value]) => [key, value ?? undefined]));

function edit(doc, id, campi, now) {
  const prev = doc.nodes[id];
  const next = editNode(doc, id, fieldsOf(campi), now);
  const before = {};
  for (const key of Object.keys(campi)) {
    if (prev[key] !== next[key]) before[key] = prev[key] ?? null;
  }
  return before;
}

export function applyFixes(doc, fixes, now = Date.now()) {
  const start = buildTree(doc);
  const current = ({ id, se }) => start.visible.has(id) && doc.nodes[id].upd === se;
  const inside = (id, ancestor) => {
    for (let at = id; at !== null && at !== undefined; at = doc.nodes[at]?.par) if (at === ancestor) return true;
    return false;
  };

  const edits = [];
  const moves = [];
  const candidates = [];
  for (const fix of fixes) {
    if (!current(fix)) continue;
    if (fix.op === 'cambia') edits.push(fix);
    else if (fix.op === 'sposta') moves.push(fix);
    else if (fix.tieni.every(current)) candidates.push(fix);
  }
  // Chi fa da riferimento a un altro doppione deve restare.
  const candidateIds = new Set(candidates.map(fix => fix.id));
  const remove = new Set(candidates.filter(fix => !fix.tieni.some(ref => candidateIds.has(ref.id))).map(fix => fix.id));

  const undo = [];
  for (const fix of edits) {
    const before = edit(doc, fix.id, fix.campi, now);
    undo.push({ op: 'cambia', id: fix.id, se: doc.nodes[fix.id].upd, campi: before });
  }
  // Si sposta solo verso una voce che c'è e che resta, e mai sotto se stessi.
  for (const fix of moves) {
    if (!start.visible.has(fix.par) || remove.has(fix.par) || inside(fix.par, fix.id)) continue;
    const { par, ord } = doc.nodes[fix.id];
    const step = { op: 'sposta', id: fix.id, par, ord };
    if (fix.campi) step.campi = edit(doc, fix.id, fix.campi, now);
    step.se = moveNode(doc, fix.id, fix.par, now).upd;
    undo.push(step);
  }
  // Togliere una voce nasconde anche i figli: si fa solo se se ne vanno tutti,
  // contando dove stanno adesso, dopo gli spostamenti.
  const tree = buildTree(doc);
  for (let changed = true; changed;) {
    changed = false;
    for (const id of remove) {
      if (childrenOf(tree, id).some(child => !remove.has(child.id))) {
        remove.delete(id);
        changed = true;
      }
    }
  }
  for (const id of remove) {
    removeNode(doc, id, now);
    undo.push({ op: 'ripristina', id, se: doc.nodes[id].upd });
  }
  if (undo.length) setState(doc, UNDO_KEY, { quando: now, annulla: undo }, now);
  return { fatte: undo.length, saltate: fixes.length - undo.length };
}

export function lastCleanup(doc) {
  const record = getState(doc, UNDO_KEY, null);
  return record?.annulla?.length ? { quando: record.quando, voci: record.annulla.length } : null;
}

export function undoFixes(doc, now = Date.now()) {
  const steps = getState(doc, UNDO_KEY, null)?.annulla ?? [];
  let done = 0;
  for (const step of steps) {
    const node = doc.nodes[step.id];
    if (!node || node.upd !== step.se) continue;
    if (step.op === 'ripristina') {
      if (!node.del) continue;
      restoreNode(doc, step.id, now);
    } else if (step.op === 'sposta') {
      if (!doc.nodes[step.par]) continue;
      if (step.campi && Object.keys(step.campi).length) editNode(doc, step.id, fieldsOf(step.campi), now);
      moveNode(doc, step.id, step.par, now, step.ord);
    } else {
      editNode(doc, step.id, fieldsOf(step.campi), now);
    }
    done++;
  }
  if (steps.length) setState(doc, UNDO_KEY, null, now);
  return { fatte: done, saltate: steps.length - done };
}
