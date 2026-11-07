// Memoria del dispositivo. Qui finiscono solo dati cifrati e una chiave non esportabile.
const DB = 'manuale';
const STORE = 'kv';
let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error); };
    req.onblocked = () => { opening = null; reject(new Error('Memoria occupata da un\'altra finestra dell\'app')); };
  });
  return opening;
}

function run(mode, action) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Scrittura annullata'));
  }));
}

export const kvGet = key => run('readonly', store => store.get(key));
export const kvSet = (key, value) => run('readwrite', store => store.put(value, key));
export const kvDel = key => run('readwrite', store => store.delete(key));
export const kvClear = () => run('readwrite', store => store.clear());
