// Pulizia dei doppioni: applica un file di correzioni preparato sul PC.
// Ogni correzione porta `se`, l'`upd` che la voce aveva quando è stata analizzata: se da
// allora la voce è cambiata la correzione si salta, così non si perde una modifica fatta
// a mano. Le voci tolte restano nel documento come eliminate e l'ultima pulizia si annulla.
import { buildTree, childrenOf, editNode, removeNode, restoreNode, getState, setState } from './doc.js';

const UNDO_KEY = 'pulizia';

const isRef = ref => ref && typeof ref.id === 'string' && Number.isFinite(ref.se);

export function cleanFixes(data) {
  const list = Array.isArray(data) ? data : data?.correzioni;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const fix of list) {
    if (!isRef(fix)) continue;
    if (fix.op === 'togli' && Array.isArray(fix.tieni) && fix.tieni.length && fix.tieni.every(isRef)) {
      out.push({ op: 'togli', id: fix.id, se: fix.se, tieni: fix.tieni.map(({ id, se }) => ({ id, se })) });
    } else if (fix.op === 'cambia' && fix.campi && typeof fix.campi === 'object' && Object.keys(fix.campi).length) {
      out.push({ op: 'cambia', id: fix.id, se: fix.se, campi: fix.campi });
    }
  }
  return out;
}

// Nel file `null` vuol dire «togli il campo»: JSON non ha un valore per l'assenza.
const fieldsOf = campi => Object.fromEntries(Object.entries(campi).map(([key, value]) => [key, value ?? undefined]));

export function applyFixes(doc, fixes, now = Date.now()) {
  const tree = buildTree(doc);
  const current = ({ id, se }) => tree.visible.has(id) && doc.nodes[id].upd === se;

  const edits = [];
  const candidates = [];
  for (const fix of fixes) {
    if (!current(fix)) continue;
    if (fix.op === 'cambia') edits.push(fix);
    else if (fix.tieni.every(current)) candidates.push(fix);
  }
  // Chi fa da riferimento a un altro doppione deve restare.
  const candidateIds = new Set(candidates.map(fix => fix.id));
  const remove = new Set(candidates.filter(fix => !fix.tieni.some(ref => candidateIds.has(ref.id))).map(fix => fix.id));
  // Togliere una voce nasconde anche i figli: si fa solo se se ne vanno tutti.
  for (let changed = true; changed;) {
    changed = false;
    for (const id of remove) {
      if (childrenOf(tree, id).some(child => !remove.has(child.id))) {
        remove.delete(id);
        changed = true;
      }
    }
  }

  const undo = [];
  for (const fix of edits) {
    const prev = doc.nodes[fix.id];
    const next = editNode(doc, fix.id, fieldsOf(fix.campi), now);
    const before = {};
    for (const key of Object.keys(fix.campi)) {
      if (prev[key] !== next[key]) before[key] = prev[key] ?? null;
    }
    undo.push({ op: 'cambia', id: fix.id, se: next.upd, campi: before });
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
    } else {
      editNode(doc, step.id, fieldsOf(step.campi), now);
    }
    done++;
  }
  if (steps.length) setState(doc, UNDO_KEY, null, now);
  return { fatte: done, saltate: steps.length - done };
}
