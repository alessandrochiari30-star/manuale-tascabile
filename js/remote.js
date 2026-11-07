// Archivio remoto: un solo file cifrato in un repository privato, tramite GitHub Contents API.

const API = 'https://api.github.com';
const NAME = /^(?!\.+$)[A-Za-z0-9._-]+$/;

export class RemoteConflict extends Error {
  constructor() { super('Archivio cambiato nel frattempo'); this.name = 'RemoteConflict'; }
}
export class RemoteAuth extends Error {
  constructor(msg = 'Chiave di accesso non valida o scaduta') { super(msg); this.name = 'RemoteAuth'; }
}
export class RemoteOffline extends Error {
  constructor() { super('Nessuna connessione'); this.name = 'RemoteOffline'; }
}
export class RemoteError extends Error {
  constructor(status) { super('Errore del servizio remoto: ' + status); this.name = 'RemoteError'; this.status = status; }
}

export function createRemote({ owner, repo, token, path = 'manuale.enc', fetch: fetchFn = globalThis.fetch.bind(globalThis) }) {
  if (!NAME.test(owner ?? '') || !NAME.test(repo ?? '')) throw new Error('Nome utente o repository non valido');
  const base = `${API}/repos/${owner}/${repo}`;
  const contents = `${base}/contents/${path}`;

  async function call(url, { method = 'GET', accept = 'application/vnd.github+json', body } = {}) {
    try {
      return await fetchFn(url, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new RemoteOffline();
    }
  }

  async function get() {
    const res = await call(contents);
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new RemoteAuth();
    if (!res.ok) throw new RemoteError(res.status);
    const file = await res.json();
    if (file.encoding === 'base64' && file.content) {
      return { text: atob(file.content.replace(/\s/g, '')), sha: file.sha };
    }
    const blob = await call(`${base}/git/blobs/${file.sha}`, { accept: 'application/vnd.github.raw+json' });
    if (blob.status === 401 || blob.status === 403) throw new RemoteAuth();
    if (!blob.ok) throw new RemoteError(blob.status);
    return { text: await blob.text(), sha: file.sha };
  }

  async function put(text, sha) {
    const body = { message: 'Aggiornamento', content: btoa(text), ...(sha ? { sha } : {}) };
    const res = await call(contents, { method: 'PUT', body });
    if (res.status === 409 || res.status === 422) throw new RemoteConflict();
    if (res.status === 401 || res.status === 403) throw new RemoteAuth();
    if (res.status === 404) throw new RemoteAuth('Repository non trovato o chiave senza permessi');
    if (!res.ok) throw new RemoteError(res.status);
    return (await res.json()).content.sha;
  }

  return { get, put };
}
