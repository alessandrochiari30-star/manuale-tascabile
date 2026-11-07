// Avvio e navigazione.
import { clear } from './ui.js';
import { S, on, autoUnlock, localState, syncNow } from './session.js';
import { renderWelcome, renderUnlock } from './gate.js';
import { renderHome, renderAmbito, renderSection, renderSearch, renderDoubts, renderSettings, renderMissing, statusText, applyTheme } from './views.js';
import { renderCalc, renderProposal, renderQuiz } from './views-tools.js';
import { hasLink } from './vault.js';
import { icon } from './icons.js';
import { getState } from './doc.js';
import { transition } from './motion.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const banner = document.getElementById('banner');
const input = document.getElementById('q');
const back = document.getElementById('back');
const searchBtn = document.getElementById('search-btn');
const settingsBtn = document.getElementById('settings');
const syncLine = document.getElementById('sync-line');
const syncText = document.getElementById('sync-text');
const homeTitle = document.getElementById('home-title');
const searchForm = document.getElementById('search-form');
const tabs = document.getElementById('tabs');
const badge = document.getElementById('tab-badge');

back.append(icon('back'));
searchBtn.append(icon('search'));
settingsBtn.append(icon('gear'));
document.getElementById('search-icon').append(icon('search', 19));
const TAB_ICONS = { home: 'home', cerca: 'search', ripasso: 'cards', calc: 'calc' };
for (const link of tabs.querySelectorAll('a[data-tab]')) link.querySelector('.pill').prepend(icon(TAB_ICONS[link.dataset.tab], 19));

// Quale scheda della barra in basso è accesa per ogni schermata.
function tabOf(section) {
  if (section === 'cerca') return 'cerca';
  if (section === 'ripasso') return 'ripasso';
  if (section === 'calc' || section === 'proposta') return 'calc';
  if (section === 'imp') return null;
  return 'home';
}

// Home: stato, impostazioni, titolo e ricerca grande. Ricerca: indietro e campo. Altre: indietro e cerca.
function setHeader(section) {
  const mode = section === undefined ? 'home' : section === 'cerca' ? 'cerca' : 'altro';
  root.dataset.mode = mode;
  back.hidden = mode === 'home';
  syncLine.hidden = mode !== 'home';
  settingsBtn.hidden = mode !== 'home';
  homeTitle.hidden = mode !== 'home';
  searchBtn.hidden = mode !== 'altro';
  searchForm.hidden = mode === 'altro';
  const active = tabOf(section);
  for (const link of tabs.querySelectorAll('a[data-tab]')) {
    if (link.dataset.tab === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function refreshBadge() {
  const count = S.doc ? (getState(S.doc, 'proposta') ?? []).length : 0;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

let focusSearch = false;
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
  setHeader(parts[0]);
  refreshBadge();
  const onSearch = parts[0] === 'cerca';
  if (!onSearch) lastPlace = hash;
  if (document.activeElement !== input || !onSearch) input.value = onSearch ? (params.get('q') ?? '') : '';

  switch (parts[0]) {
    case undefined: renderHome(view); break;
    case 'a': renderAmbito(view, parts[1]); break;
    case 's': renderSection(view, parts[1], params.get('f')); break;
    case 'cerca': renderSearch(view, params.get('q') ?? '', params.get('t') ?? 'tutto'); break;
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
  if (onSearch && focusSearch) {
    focusSearch = false;
    input.focus();
  }
}

// --- ricerca: sempre in alto ---
let searchTimer = null;
function runSearch() {
  const query = input.value.trim();
  const { parts } = parseHash();
  const onSearch = parts[0] === 'cerca';
  if (!query) {
    if (onSearch) {
      history.replaceState(null, '', '#/cerca');
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
  // Il browser può riempire da solo questo campo credendolo un nome utente: conta solo chi ci sta scrivendo.
  if (document.activeElement !== input) {
    input.value = parseHash().parts[0] === 'cerca' ? (parseHash().params.get('q') ?? '') : '';
    return;
  }
  // I risultati vecchi spariscono subito: un tocco non finisce mai su una voce superata.
  if (input.value.trim()) clear(view);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 60);
});
document.getElementById('search-form').addEventListener('submit', event => {
  event.preventDefault();
  input.blur();
});

// --- navigazione ---
// Avanti o indietro: decide il verso dello scorrimento.
const trail = [];
function directionFor(hash) {
  if (trail.length > 1 && trail[trail.length - 2] === hash) {
    trail.pop();
    return 'back';
  }
  if (trail[trail.length - 1] !== hash) trail.push(hash);
  return 'forward';
}

window.addEventListener('hashchange', () => {
  navigated++;
  if (!inApp) return;
  const direction = directionFor(location.hash || '#/');
  transition(() => render(), direction);
});
window.addEventListener('rerender', () => render({ keepScroll: true }));
back.addEventListener('click', () => {
  if (navigated > 0 || history.length > 1) history.back();
  else location.hash = '#/';
});
settingsBtn.addEventListener('click', () => { location.hash = '#/imp'; });
searchBtn.addEventListener('click', () => {
  focusSearch = true;
  location.hash = '#/cerca';
});
tabs.querySelector('a[data-tab="cerca"]').addEventListener('click', () => { focusSearch = true; });

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
  syncText.textContent = statusText();
  refreshBadge();
});

function enter() {
  inApp = true;
  top.hidden = false;
  tabs.hidden = false;
  trail.length = 0;
  trail.push(location.hash || '#/');
  render();
  syncNow().catch(() => {});
}

async function boot() {
  let themeChoice = null;
  try {
    themeChoice = localStorage.getItem('tema');
  } catch { /* preferenza non essenziale */ }
  applyTheme(themeChoice);

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
