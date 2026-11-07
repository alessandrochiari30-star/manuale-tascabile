// Un giro di sincronizzazione: legge l'archivio, fonde e riscrive solo se serve.
// Un archivio illeggibile o incoerente ferma tutto: non viene mai sovrascritto.
import { merge, sameDoc, validateDoc } from './doc.js';
import { parseFile, openFile, sealFile, BadFile } from './vault.js';
import { RemoteConflict } from './remote.js';

const ATTEMPTS = 3;

export class SyncGaveUp extends Error {
  constructor() { super('Archivio occupato: riprova tra poco'); this.name = 'SyncGaveUp'; }
}

export async function syncOnce({ remote, vault, local }) {
  const { key, salt, iter } = vault;
  let current = local;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const found = await remote.get();
    let merged = current;
    if (found) {
      const theirs = await openFile(parseFile(found.text), key);
      const check = validateDoc(theirs);
      if (!check.ok) throw new BadFile(check.msg);
      merged = merge(current, theirs);
      if (sameDoc(merged, theirs)) return { doc: merged, sha: found.sha, pushed: false };
    }
    try {
      const sha = await remote.put(await sealFile(merged, key, salt, iter), found ? found.sha : null);
      return { doc: merged, sha, pushed: true };
    } catch (err) {
      if (!(err instanceof RemoteConflict)) throw err;
      current = merged;
    }
  }
  throw new SyncGaveUp();
}
