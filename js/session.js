// Stato dell'app aperta: documento in memoria, chiave, salvataggio cifrato e sincronizzazione.
import {
  deriveKey, newSalt, sealFile, parseFile, openFile, sealText, openText, makeLink, readLink,
  fromB64, keyExpired, ITERATIONS, WrongPassword, BadFile,
} from './vault.js';
import { buildTree, merge, sameDoc, validateDoc } from './doc.js';
import { buildIndex } from './search.js';
import { searchEntries } from './entries.js';
import { createRemote, RemoteAuth, RemoteOffline } from './remote.js';
import { syncOnce, SyncGaveUp } from './sync.js';
import { kvGet, kvSet, kvDel, kvClear } from './store.js';

export const S = {
  doc: null,
  tree: null,
  index: null,
  vault: null,
  conn: null,
  sha: null,
  dirty: false,
  sync: { kind: 'idle', at: null, msg: '' },
};

const listeners = { doc: new Set(), status: new Set() };
export const on = (event, fn) => listeners[event].add(fn);
const emit = event => listeners[event].forEach(fn => fn());

const root = document.documentElement;

function setSync(kind, msg = '') {
  S.sync = { kind, msg, at: kind === 'ok' ? new Date() : S.sync.at };
  root.dataset.sync = kind;
  emit('status');
}
function setSaved(saved) { root.dataset.saved = saved ? 'yes' : 'no'; }

function rebuild() {
  S.tree = buildTree(S.doc);
  S.index = buildIndex(searchEntries(S.doc));
}

function activate(doc, vault, conn, tokenSealed, sha, dirty) {
  S.doc = doc;
  S.vault = vault;
  S.conn = conn;
  S.tokenSealed = tokenSealed;
  S.sha = sha;
  S.dirty = dirty;
  rebuild();
  setSaved(true);
  kvSet('lastUsed', Date.now()).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
}

// --- salvataggio sul dispositivo: uno alla volta, l'ultimo stato vince ---
let saving = null;
let saveAgain = false;

async function writeLocal() {
  const { key, salt, iter } = S.vault;
  await kvSet('file', await sealFile(S.doc, key, salt, iter));
  await kvSet('dirty', S.dirty);
  await kvSet('sha', S.sha);
}

function saveLocal() {
  if (saving) {
    saveAgain = true;
    return saving;
  }
  setSaved(false);
  saving = (async () => {
    try {
      do {
        saveAgain = false;
        await writeLocal();
      } while (saveAgain);
      setSaved(true);
    } catch {
      setSync('error', 'Modifica non salvata su questo dispositivo: non chiudere l\'app e riprova.');
      throw new Error('Salvataggio fallito');
    } finally {
      saving = null;
    }
  })();
  return saving;
}

// --- modifiche ---
export async function commit(change, { render = true } = {}) {
  change(S.doc);
  S.dirty = true;
  setSync('pending');
  if (render) {
    rebuild();
    emit('doc');
  }
  await saveLocal();
  scheduleSync();
}

// --- sincronizzazione ---
let syncTimer = null;
let syncing = null;

function scheduleSync(ms = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, ms);
}

export function syncNow() {
  if (syncing) return syncing;
  clearTimeout(syncTimer);
  if (!S.doc) return Promise.resolve();
  if (navigator.onLine === false) {
    setSync('offline');
    return Promise.resolve();
  }
  setSync('syncing');
  syncing = runSync().finally(() => { syncing = null; });
  return syncing;
}

async function runSync() {
  try {
    const token = await openText(S.tokenSealed, S.vault.key);
    const remote = createRemote({ ...S.conn, token });
    const snapshot = S.doc;
    const result = await syncOnce({ remote, vault: S.vault, local: snapshot });
    const fresh = merge(S.doc, result.doc);
    const changed = !sameDoc(fresh, S.doc);
    S.doc = fresh;
    S.sha = result.sha;
    S.dirty = !sameDoc(fresh, result.doc);
    if (changed) {
      rebuild();
      emit('doc');
    }
    await saveLocal();
    if (S.dirty) {
      setSync('pending');
      scheduleSync(500);
    } else {
      setSync('ok');
    }
  } catch (err) {
    if (err instanceof RemoteOffline) setSync('offline');
    else if (err instanceof RemoteAuth) setSync('error', 'Chiave di accesso non valida o scaduta: aggiornala nelle impostazioni. Le modifiche restano su questo dispositivo.');
    else if (err instanceof WrongPassword) setSync('error', 'L\'archivio remoto non si apre con questa password: non è stato toccato.');
    else if (err instanceof BadFile) setSync('error', 'L\'archivio remoto risulta rovinato: non è stato toccato.');
    else if (err instanceof SyncGaveUp) {
      setSync('pending', err.message);
      scheduleSync(10000);
    } else setSync('error', 'Sincronizzazione non riuscita. Le modifiche restano su questo dispositivo.');
  }
}

window.addEventListener('online', () => { if (S.doc) syncNow().catch(() => {}); });
window.addEventListener('offline', () => { if (S.doc) setSync('offline'); });
let lastVisibleSync = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.doc) return;
  kvSet('lastUsed', Date.now()).catch(() => {});
  if (Date.now() - lastVisibleSync > 60000) {
    lastVisibleSync = Date.now();
    syncNow().catch(() => {});
  }
});

// --- avvio e sblocco ---
export async function localState() {
  const [file, key, lastUsed] = await Promise.all([kvGet('file'), kvGet('key'), kvGet('lastUsed')]);
  return { hasFile: Boolean(file), hasKey: Boolean(key), expired: keyExpired(lastUsed) };
}

async function loadInto(key) {
  const text = await kvGet('file');
  const parsed = parseFile(text);
  const doc = await openFile(parsed, key);
  const check = validateDoc(doc);
  if (!check.ok) throw new BadFile(check.msg);
  const vault = { key, salt: fromB64(parsed.salt), iter: parsed.iter };
  const [conn, tokenSealed, sha, dirty] = await Promise.all([kvGet('conn'), kvGet('token'), kvGet('sha'), kvGet('dirty')]);
  activate(doc, vault, conn, tokenSealed, sha ?? null, Boolean(dirty));
}

export async function autoUnlock() {
  const state = await localState();
  if (!state.hasFile || !state.hasKey) return false;
  if (state.expired) {
    await kvDel('key');
    return false;
  }
  try {
    await loadInto(await kvGet('key'));
    return true;
  } catch {
    await kvDel('key');
    return false;
  }
}

export async function unlock(password) {
  const parsed = parseFile(await kvGet('file'));
  const key = await deriveKey(password, fromB64(parsed.salt), parsed.iter);
  await loadInto(key);
  await kvSet('key', key);
}

async function persistNew({ doc, key, salt, iter, conn, token, sha, text }) {
  const tokenSealed = await sealText(token, key);
  await kvSet('file', text);
  await kvSet('conn', conn);
  await kvSet('token', tokenSealed);
  await kvSet('sha', sha);
  await kvSet('dirty', false);
  await kvSet('key', key);
  activate(doc, { key, salt, iter }, conn, tokenSealed, sha, false);
  setSync('ok');
}

export async function firstSetup({ seed, password, owner, repo, token }) {
  const check = validateDoc(seed);
  if (!check.ok) throw new BadFile(check.msg);
  const conn = { owner, repo };
  const remote = createRemote({ ...conn, token });
  if (await remote.get()) {
    throw new Error('In questo repository esiste già un archivio: non lo sovrascrivo. Usa il link di collegamento.');
  }
  const salt = newSalt();
  const key = await deriveKey(password, salt, ITERATIONS);
  const text = await sealFile(seed, key, salt, ITERATIONS);
  const sha = await remote.put(text, null);
  await persistNew({ doc: seed, key, salt, iter: ITERATIONS, conn, token, sha, text });
}

export async function connectWithLink(fragment, password) {
  const { owner, repo, token } = await readLink(fragment, password);
  const conn = { owner, repo };
  const remote = createRemote({ ...conn, token });
  const found = await remote.get();
  if (!found) throw new Error('L\'archivio non c\'è ancora: fai prima la configurazione dal PC.');
  const parsed = parseFile(found.text);
  const salt = fromB64(parsed.salt);
  const key = await deriveKey(password, salt, parsed.iter);
  const doc = await openFile(parsed, key);
  const check = validateDoc(doc);
  if (!check.ok) throw new BadFile(check.msg);
  await persistNew({ doc, key, salt, iter: parsed.iter, conn, token, sha: found.sha, text: found.text });
}

// --- impostazioni ---
export async function deviceLink(password) {
  const parsed = parseFile(await kvGet('file'));
  const key = await deriveKey(password, fromB64(parsed.salt), parsed.iter);
  await openFile(parsed, key);
  const token = await openText(S.tokenSealed, S.vault.key);
  const url = location.origin + location.pathname;
  return makeLink(url, { ...S.conn, token }, password);
}

export async function updateToken(token) {
  const remote = createRemote({ ...S.conn, token });
  await remote.get();
  S.tokenSealed = await sealText(token, S.vault.key);
  await kvSet('token', S.tokenSealed);
  return syncNow();
}

export async function lock() {
  if (saving) await saving.catch(() => {});
  await kvDel('key');
  location.replace(location.pathname);
}

export async function forgetDevice() {
  await kvClear();
  location.replace(location.pathname);
}

export function sealedExport() {
  const { key, salt, iter } = S.vault;
  return sealFile(S.doc, key, salt, iter);
}
