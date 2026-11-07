// Cifratura lato dispositivo: PBKDF2-SHA256 → AES-256-GCM, tramite WebCrypto.
// Il contenuto esce dal dispositivo solo come risultato di queste funzioni.

const FORMAT = 'mt1';
const MIN_ITER = 1000;
const MAX_ITER = 10_000_000;
const LINK_PREFIX = '#collega=';
export const ITERATIONS = 600_000;

export class WrongPassword extends Error {
  constructor() { super('Password errata o file manomesso'); this.name = 'WrongPassword'; }
}
export class BadFile extends Error {
  constructor(msg = 'File non valido') { super(msg); this.name = 'BadFile'; }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function fromB64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const toUrl = t => t.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = t => t.replace(/-/g, '+').replace(/_/g, '/');

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function newSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
export { toB64, fromB64 };

export async function deriveKey(password, salt, iter = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(bytes, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv: toB64(iv), ct: toB64(ct) };
}
async function decryptBytes({ iv, ct }, key) {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct)));
  } catch {
    throw new WrongPassword();
  }
}

export async function sealFile(doc, key, salt, iter = ITERATIONS) {
  const packed = await pipe(enc.encode(JSON.stringify(doc)), new CompressionStream('gzip'));
  const sealed = await encryptBytes(packed, key);
  return JSON.stringify({ format: FORMAT, iter, salt: toB64(salt), ...sealed });
}

export function parseFile(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new BadFile(); }
  if (!file || file.format !== FORMAT) throw new BadFile();
  for (const field of ['salt', 'iv', 'ct']) {
    if (typeof file[field] !== 'string') throw new BadFile();
  }
  if (!Number.isInteger(file.iter) || file.iter < MIN_ITER || file.iter > MAX_ITER) throw new BadFile();
  return file;
}

export async function openFile(file, key) {
  const packed = await decryptBytes(file, key);
  try {
    return JSON.parse(dec.decode(await pipe(packed, new DecompressionStream('gzip'))));
  } catch {
    throw new BadFile();
  }
}

export function sealText(text, key) { return encryptBytes(enc.encode(text), key); }
export async function openText(sealed, key) { return dec.decode(await decryptBytes(sealed, key)); }

export async function makeLink(baseUrl, conn, password, iter = ITERATIONS) {
  const salt = newSalt();
  const key = await deriveKey(password, salt, iter);
  const sealed = await sealText(JSON.stringify(conn), key);
  const payload = toUrl(btoa(JSON.stringify({ iter, salt: toB64(salt), ...sealed })));
  return baseUrl + LINK_PREFIX + payload;
}

export function hasLink(fragment) { return typeof fragment === 'string' && fragment.startsWith(LINK_PREFIX); }

export async function readLink(fragment, password) {
  if (!hasLink(fragment)) throw new BadFile('Link non valido');
  let data;
  try {
    data = JSON.parse(atob(fromUrl(fragment.slice(LINK_PREFIX.length))));
  } catch {
    throw new BadFile('Link non valido');
  }
  if (!Number.isInteger(data.iter) || data.iter < MIN_ITER || data.iter > MAX_ITER) throw new BadFile('Link non valido');
  const key = await deriveKey(password, fromB64(data.salt), data.iter);
  return JSON.parse(await openText(data, key));
}

const KEY_DAYS = 14;

export function keyExpired(lastUsed, now = Date.now()) {
  if (typeof lastUsed !== 'number') return true;
  return now - lastUsed > KEY_DAYS * 86_400_000;
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return { ok: false, msg: 'Servono almeno 12 caratteri.' };
  }
  if (new Set(password).size < 5) return { ok: false, msg: 'Troppo ripetitiva: usa caratteri diversi.' };
  return { ok: true, msg: '' };
}
