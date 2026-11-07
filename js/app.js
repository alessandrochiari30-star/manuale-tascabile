// Avvio e navigazione.
import { clear } from './ui.js';
import { S, on, autoUnlock, localState, syncNow } from './session.js';
import { renderWelcome, renderUnlock } from './gate.js';
import { renderHome, renderAmbito, renderSection, renderSearch, renderDoubts, renderSettings, renderMissing, statusText, applyTheme } from './views.js';
import { renderCalc, renderProposal, renderQuiz } from './views-tools.js';
import { hasLink } from './vault.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const banner = document.getElementById('banner');
const input = document.getElementById('q');
const back = document.getElementById('back');
const title = document.getElementById('title');
const sheet = document.getElementById('sheet');
const root = document.documentElement;

let inApp = false;
let navigated = 0;
let lastPlace = '#/';

function parseHash() {
  const hash = location.hash || '#/';
  const [path, query] = hash.slice(1).split('?');
  return { hash, parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query ?? '') };
}

function render({ keepScroll = false } = {}) {
  if (!inApp) return;
  const y = window.scrollY;
  const { hash, parts, params } = parseHash();
  clear(view);
  back.hidden = parts.length === 0;
  title.textContent = S.doc.meta?.titolo ?? 'Manuale';
  const onSearch = parts[0] === 'cerca';
  if (!onSearch) lastPlace = hash;
  if (document.activeElement !== input || !onSearch) input.value = onSearch ? (params.get('q') ?? '') : '';

  switch (parts[0]) {
    case undefined: renderHome(view); break;
    case 'a': renderAmbito(view, parts[1]); break;
    case 's': renderSection(view, parts[1], params.get('f')); break;
    case 'cerca': renderSearch(view, params.get('q') ?? ''); break;
    case 'dubbi': renderDoubts(view); break;
    case 'calc': renderCalc(view); break;
    case 'proposta': renderProposal(view); break;
    case 'ripasso': renderQuiz(view); break;
    case 'imp': renderSettings(view); break;
    default: renderMissing(view);
  }
  root.dataset.view = hash;
  if (keepScroll) window.scrollTo(0, y);
  else if (!params.get('f')) window.scrollTo(0, 0);
}

// --- ricerca: sempre in alto ---
let searchTimer = null;
function runSearch() {
  const query = input.value.trim();
  const { parts } = parseHash();
  const onSearch = parts[0] === 'cerca';
  if (!query) {
    if (onSearch) {
      history.replaceState(null, '', lastPlace);
      render();
    }
    return;
  }
  const target = `#/cerca?q=${encodeURIComponent(query)}`;
  if (onSearch) history.replaceState(null, '', target);
  else history.pushState(null, '', target);
  render({ keepScroll: false });
}

input.addEventListener('input', () => {
  // I risultati vecchi spariscono subito: un tocco non finisce mai su una voce superata.
  if (input.value.trim()) clear(view);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 60);
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter') input.blur();
});

// --- navigazione ---
window.addEventListener('hashchange', () => {
  navigated++;
  render();
});
window.addEventListener('rerender', () => render({ keepScroll: true }));
back.addEventListener('click', () => {
  if (navigated > 0 || history.length > 1) history.back();
  else location.hash = '#/';
});
document.getElementById('settings').addEventListener('click', () => { location.hash = '#/imp'; });

// Un aggiornamento mentre si scrive nel foglio non deve far perdere il testo: si ridisegna alla chiusura.
let pendingRender = false;
on('doc', () => {
  if (sheet.open) {
    pendingRender = true;
    return;
  }
  render({ keepScroll: true });
});
sheet.addEventListener('close', () => {
  if (pendingRender) {
    pendingRender = false;
    render({ keepScroll: true });
  }
});

on('status', () => {
  const { kind, msg } = S.sync;
  banner.hidden = kind !== 'error';
  banner.textContent = kind === 'error' ? msg : '';
  const line = document.getElementById('status');
  if (line) line.textContent = statusText();
});

function enter() {
  inApp = true;
  top.hidden = false;
  render();
  syncNow().catch(() => {});
}

async function boot() {
  try {
    applyTheme(localStorage.getItem('tema') ?? '');
  } catch { /* preferenza non essenziale */ }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  let state;
  try {
    state = await localState();
  } catch {
    banner.hidden = false;
    banner.textContent = 'Questo browser non permette di salvare i dati: esci dalla navigazione privata e riprova.';
    return;
  }

  if (hasLink(location.hash) || !state.hasFile) {
    if (!state.hasFile) {
      renderWelcome(view, enter);
      return;
    }
    history.replaceState(null, '', location.pathname);
  }
  if (await autoUnlock()) enter();
  else renderUnlock(view, enter);
}

boot();
