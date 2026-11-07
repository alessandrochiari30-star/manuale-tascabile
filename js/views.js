// Schermate di consultazione: home, ambito, sezione, ricerca, dubbi e impostazioni.
import { el, put, inlineNodes, sourcesLine, field, armButton, toast, secretForm } from './ui.js';
import { childrenOf, countDescendants, breadcrumb, getState, setState } from './doc.js';
import { search } from './search.js';
import { entryText } from './entries.js';
import { snippet } from './forms.js';
import { plainText } from './inline.js';
import { S, commit, syncNow, lock, deviceLink, updateToken, forgetDevice, sealedExport } from './session.js';
import { WrongPassword } from './vault.js';
import { resolveTheme } from './theme.js';
import { stagger } from './motion.js';
import { icon } from './icons.js';
import { addRecent } from './recent.js';
import { facets, filterResults, kindOf } from './facets.js';
import { openEditor, openNew } from './edit.js';

const fonti = () => S.doc.meta?.fonti ?? {};
const nav = hash => { location.hash = hash; };

// --- home ---
let homeShown = false;
export function renderHome(view) {
  const tiles = childrenOf(S.tree, null).map((a, i) => {
    const hasTool = childrenOf(S.tree, a.id).some(n => n.ty === 'link');
    const procs = countDescendants(S.tree, a.id, 'proc');
    const unit = a.unit ?? 'punti';
    const facts = [`${countDescendants(S.tree, a.id, 'pt')} ${unit}`];
    if (hasTool) facts.push('calcolatore');
    else if (procs) facts.push(`${procs} procedure`);
    return el('a', { class: 'tile' + (i === 0 ? ' main' : ''), href: `#/a/${encodeURIComponent(a.id)}` },
      icon('amb' + i, 22),
      el('span', { class: 'tile-text' }, el('b', {}, a.t), el('span', {}, facts.join(' · '))));
  });
  const questions = Object.values(S.doc.nodes).filter(n => S.tree.visible.has(n.id) && (n.ty === 'qa' || n.ty === 'proc')).length;
  tiles.push(el('a', { class: 'tile', href: '#/ripasso' },
    icon('cards', 22),
    el('span', { class: 'tile-text' }, el('b', {}, 'Ripasso'), el('span', {}, `${questions} domande`))));

  // I riquadri entrano in sequenza solo alla prima apertura: dopo, la Home deve essere subito pronta.
  if (!homeShown) {
    homeShown = true;
    stagger(tiles);
  }
  const doubts = doubtNodes().length;
  const recent = addRecent(getState(S.doc, 'recenti'), '');
  put(view,
    recent.length ? el('div', { class: 'recents' }, recent.map(query => el('a', { class: 'recent', href: `#/cerca?q=${encodeURIComponent(query)}` }, icon('clock', 14), query))) : null,
    el('p', { class: 'label' }, 'Ambiti'),
    el('div', { class: 'grid' }, tiles),
    doubts ? el('a', { id: 'home-dubbi', href: '#/dubbi' },
      icon('alert'),
      el('span', { class: 'grow' }, el('b', {}, `${doubts} dubbi da verificare`), el('span', {}, 'Prima di dirli a un cliente')),
      icon('go', 18)) : null,
  );
}

export function statusText() {
  const { kind, at, msg } = S.sync;
  if (kind === 'ok') return `Sincronizzato${at ? ' alle ' + at.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}.`;
  if (kind === 'syncing') return 'Sincronizzazione in corso…';
  if (kind === 'pending') return msg || 'Modifiche salvate qui, da inviare.';
  if (kind === 'offline') return S.dirty ? 'Senza rete: modifiche salvate qui, partiranno al ritorno della rete.' : 'Senza rete: stai usando la copia su questo dispositivo.';
  if (kind === 'error') return msg;
  return '';
}

// --- ambito ---
export function renderAmbito(view, id) {
  const node = S.doc.nodes[id];
  if (!node || !S.tree.visible.has(id)) return renderMissing(view);
  const kids = childrenOf(S.tree, id);
  if (kids.length === 1 && kids[0].ty === 'sec') {
    location.replace(`#/s/${encodeURIComponent(kids[0].id)}`);
    return;
  }
  put(view, el('h1', {}, node.t), node.sub ? el('p', { class: 'sub' }, node.sub) : null);
  for (const kid of kids) {
    const href = kid.ty === 'link' ? `#/${kid.route}` : `#/s/${encodeURIComponent(kid.id)}`;
    put(view, el('a', { class: 'row' + (kid.ty === 'link' ? ' tool' : ''), href },
      el('div', { class: 'grow' }, el('b', {}, kid.t), kid.sub ? el('span', {}, kid.sub) : null),
      icon('go', 18)));
  }
}

// --- sezione ---
const expanded = new Set();

function editButton(id) {
  return el('button', { type: 'button', class: 'edit', 'aria-label': 'Modifica', onclick: event => { event.stopPropagation(); event.preventDefault(); openEditor(id); } }, icon('pencil', 18));
}

function flagOf(node) {
  if (node.k === 'key') return el('span', { class: 'flag-key' }, 'Da sapere');
  if (node.k === 'q') return el('span', { class: 'flag-doubt' }, 'Da verificare');
  return null;
}

// Voce: in cima alla sezione è una scheda; i sotto-punti sono righe separate da divisori.
function renderPoint(node, focusId, depth) {
  const kids = childrenOf(S.tree, node.id);
  const classes = ['node'];
  if (depth === 0) classes.push('card');
  if (kids.length) classes.push('can');
  if (node.k === 'key') classes.push('key');
  if (node.k === 'q') classes.push('doubt');
  if (node.k === 'n') classes.push('note');
  if (node.id === focusId) classes.push('flash');
  const open = kids.length > 0 && expanded.has(node.id);
  if (open) classes.push('open');

  const box = el('div', { class: classes.join(' '), 'data-id': node.id });
  const wrap = kids.length ? el('div', { class: 'kids-wrap' }) : null;
  const chev = kids.length ? el('button', { type: 'button', class: 'chev', 'aria-expanded': open ? 'true' : 'false', 'aria-label': 'Apri o chiudi' }, icon('chevron', 16)) : null;
  const fill = () => { if (!wrap.firstChild) wrap.append(kidsOf(kids, focusId, depth + 1)); };
  const toggle = () => {
    const willOpen = !box.classList.contains('open');
    if (willOpen) {
      expanded.add(node.id);
      fill();
      void wrap.offsetHeight; // il contenuto esiste prima che parta l'animazione dell'altezza
    } else {
      expanded.delete(node.id);
    }
    box.classList.toggle('open', willOpen);
    wrap.inert = !willOpen;
    chev.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };
  if (chev) chev.addEventListener('click', toggle);
  if (open) fill();
  if (wrap) wrap.inert = !open;

  const source = sourcesLine(node.s, fonti());
  const text = el('div', { class: 'node-text', onclick: kids.length ? toggle : undefined },
    flagOf(node),
    el('span', { class: 'node-body' }, inlineNodes(node.t)),
    typeof node.v === 'number' ? el('div', { class: 'vbar' }, barFill(node.v)) : null,
    source || node.ed ? el('span', { class: 'src' }, source, node.ed ? el('span', { class: 'mine' }, source ? ' · modificato da te' : 'modificato da te') : null) : null);
  box.append(el('div', { class: 'node-row' }, text, editButton(node.id), chev));
  if (wrap) box.append(wrap);
  return box;
}

function barFill(value) {
  const fill = el('i');
  fill.style.width = Math.max(0, Math.min(100, value)) + '%';
  return fill;
}

function kidsOf(kids, focusId, depth) {
  return el('div', { class: 'kids' }, kids.map(kid => renderAny(kid, focusId, depth)));
}

function renderTable(node, focusId) {
  const rows = node.rows ?? [];
  const body = rows.map((row, i) => {
    const query = node.cerca?.[i];
    return el('tr', {
      class: query ? 'can' : undefined,
      onclick: query ? () => { location.hash = `#/cerca?q=${encodeURIComponent(query)}`; } : undefined,
    }, row.map(cell => el('td', {}, cell)));
  });
  return el('div', { class: 'tabblock card' + (node.id === focusId ? ' node flash' : ''), 'data-id': node.id },
    el('div', { class: 'tabhead' }, el('span', {}, node.t), editButton(node.id)),
    el('div', { class: 'tabwrap' }, el('table', {},
      el('thead', {}, el('tr', {}, (node.cols ?? []).map(col => el('th', {}, col)))),
      el('tbody', {}, body))),
    sourcesLine(node.s, fonti()) ? el('span', { class: 'src' }, sourcesLine(node.s, fonti())) : null);
}

function renderNumber(node, focusId) {
  return el('div', { class: 'node card' + (node.id === focusId ? ' flash' : ''), 'data-id': node.id },
    el('div', { class: 'num node-row' },
      el('div', { class: 'grow' }, el('span', { class: 'val' }, node.val), node.t,
        sourcesLine(node.s, fonti()) ? el('span', { class: 'src' }, sourcesLine(node.s, fonti())) : null),
      editButton(node.id)));
}

function renderQuestion(node, focusId) {
  return el('details', { class: 'qa' + (node.id === focusId ? ' node flash' : ''), 'data-id': node.id, open: node.id === focusId },
    el('summary', {}, node.t),
    el('div', { class: 'detail-body' }, el('p', {}, inlineNodes(node.r)), editButton(node.id)));
}

function renderProcedure(node, focusId) {
  const key = 'spunte:' + node.id;
  const ticks = [...(getState(S.doc, key) ?? [])];
  const steps = el('ol', { class: 'steps' }, (node.steps ?? []).map((step, i) => el('li', {},
    el('input', {
      type: 'checkbox',
      checked: ticks[i],
      'aria-label': step.t,
      onchange: event => {
        ticks[i] = event.target.checked;
        commit(doc => setState(doc, key, ticks), { render: false }).catch(() => {});
      },
    }),
    el('div', {}, el('b', {}, step.t), step.d ? el('span', {}, inlineNodes(step.d)) : null,
      sourcesLine(step.s, fonti()) ? el('span', { class: 'src' }, sourcesLine(step.s, fonti())) : null))));
  return el('details', { class: 'proc' + (node.id === focusId ? ' node flash' : ''), 'data-id': node.id, open: node.id === focusId },
    el('summary', {}, node.t),
    el('div', { class: 'detail-body' },
      node.q ? el('p', {}, el('strong', {}, 'Quando: '), node.q) : null,
      steps,
      node.warn?.length ? el('div', { class: 'warnbox' }, el('strong', {}, 'Attenzione'), el('ul', {}, node.warn.map(w => el('li', {}, w)))) : null,
      node.tools ? el('p', {}, el('strong', {}, 'Strumenti: '), node.tools) : null,
      node.verify ? el('div', { class: 'warnbox' }, el('strong', {}, 'Da verificare: '), node.verify) : null,
      editButton(node.id)));
}

function renderAny(node, focusId, depth = 0) {
  switch (node.ty) {
    case 'tab': return renderTable(node, focusId);
    case 'num': return renderNumber(node, focusId);
    case 'qa': return renderQuestion(node, focusId);
    case 'proc': return renderProcedure(node, focusId);
    default: return renderPoint(node, focusId, depth);
  }
}

export function renderSection(view, id, focusId) {
  const node = S.doc.nodes[id];
  if (!node || !S.tree.visible.has(id)) return renderMissing(view);
  if (focusId) for (const parent of breadcrumb(S.tree, focusId)) expanded.add(parent.id);

  const kids = childrenOf(S.tree, id);
  const expandable = kids.some(kid => childrenOf(S.tree, kid.id).length);
  const addTy = addTypeFor(kids);
  const ambito = breadcrumb(S.tree, id)[0];
  put(view,
    el('div', { class: 'sec-head' },
      el('div', { class: 'grow' }, ambito ? el('p', { class: 'eyebrow' }, ambito.t) : null, el('h1', {}, node.t)),
      editButton(id)),
    node.sub ? el('p', { class: 'sub' }, node.sub) : null,
    expandable ? el('div', { class: 'tools' }, el('button', {
      type: 'button',
      class: 'btn',
      id: 'expand-all',
      onclick: () => {
        const all = [];
        const stack = [...kids];
        while (stack.length) {
          const n = stack.pop();
          const sub = childrenOf(S.tree, n.id);
          if (sub.length) all.push(n.id);
          stack.push(...sub);
        }
        const close = all.every(x => expanded.has(x));
        all.forEach(x => (close ? expanded.delete(x) : expanded.add(x)));
        window.dispatchEvent(new CustomEvent('rerender'));
      },
    }, 'Apri o chiudi tutto')) : null,
    el('div', { class: 'cards' }, kids.map(kid => renderAny(kid, focusId, 0))),
    el('button', { type: 'button', id: 'add-node', class: 'add-btn', onclick: () => openNew(id, addTy.ty) }, icon('plus', 18), addTy.label),
  );
  if (focusId) {
    const target = view.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
    target?.scrollIntoView({ block: 'center' });
  }
}

function addTypeFor(kids) {
  const first = kids[0]?.ty;
  if (first === 'qa') return { ty: 'qa', label: 'Aggiungi domanda' };
  if (first === 'proc') return { ty: 'proc', label: 'Aggiungi procedura' };
  if (first === 'num') return { ty: 'num', label: 'Aggiungi numero' };
  return { ty: 'pt', label: 'Aggiungi punto' };
}

// --- ricerca e dubbi ---
const KINDS = { sec: 'Sezione', link: 'Strumento', pt: 'Punto', num: 'Numero', qa: 'Domanda', proc: 'Procedura', tab: 'Tabella' };

export function targetOf(node) {
  if (node.ty === 'link') return `#/${node.route}`;
  if (node.ty === 'sec') return `#/s/${encodeURIComponent(node.id)}`;
  const path = breadcrumb(S.tree, node.id);
  let section = null;
  for (let i = path.length - 1; i >= 0 && !section; i--) if (path[i].ty === 'sec') section = path[i];
  if (!section) return '#/';
  return `#/s/${encodeURIComponent(section.id)}?f=${encodeURIComponent(node.id)}`;
}

function resultCard(node, words, query = '') {
  const doubt = node.k === 'q';
  const path = breadcrumb(S.tree, node.id).map(p => plainText(p.t)).slice(0, 3).join(' › ');
  const text = node.ty === 'num' ? `${node.t}: ${node.val}` : entryText(node);
  const source = sourcesLine(node.s, fonti());
  return el('article', { class: 'res' + (doubt ? ' dubbio' : ''), 'data-kind': kindOf(node) ?? node.ty },
    el('button', {
      type: 'button',
      class: 'res-open',
      onclick: () => {
        if (query) commit(doc => setState(doc, 'recenti', addRecent(getState(doc, 'recenti'), query)), { render: false }).catch(() => {});
        nav(targetOf(node));
      },
    },
      el('span', { class: 'res-meta' },
        el('span', { class: 'res-kind' }, doubt ? 'Da verificare' : (KINDS[node.ty] ?? 'Voce')),
        path ? el('span', { class: 'res-path' }, ' · ' + path) : null),
      el('b', {}, snippet(text, words, 190).map(part => (part.hit ? el('mark', {}, part.t) : part.t)))),
    el('div', { class: 'res-foot' },
      el('span', {}, source),
      node.ty === 'link' ? null : el('button', { type: 'button', class: 'edit', 'aria-label': 'Modifica', onclick: () => openEditor(node.id) }, icon('pencil', 18))));
}

export function renderSearch(view, query, kind = 'tutto') {
  if (!query.trim()) {
    put(view, el('p', { class: 'sub' }, 'Scrivi una parola, anche a metà: cerco in tutto il manuale.'));
    return;
  }
  const all = search(S.index, query, { synonyms: S.doc.meta?.sinonimi ?? [], limit: 200 });
  if (!all.length) {
    put(view, el('p', { class: 'sub' }, `Nessun risultato per «${query}». Prova con meno parole o con un'altra parola.`));
    return;
  }
  const chips = facets(all, S.doc.nodes);
  const active = chips.some(c => c.key === kind) ? kind : 'tutto';
  const base = `#/cerca?q=${encodeURIComponent(query)}`;
  put(view, el('div', { class: 'facets', role: 'group', 'aria-label': 'Filtra per tipo' }, chips.map(chip => el('a', {
    class: 'facet',
    href: chip.key === 'tutto' ? base : `${base}&t=${chip.key}`,
    'data-key': chip.key,
    'aria-current': chip.key === active ? 'true' : 'false',
  }, chip.label, el('span', {}, String(chip.count))))));
  const shown = filterResults(all, S.doc.nodes, active).slice(0, 60);
  const cards = [];
  for (const result of shown) {
    const node = S.doc.nodes[result.id];
    if (node) cards.push(resultCard(node, result.words, query));
  }
  stagger(cards.slice(0, 10), 25);
  put(view, cards);
}

function doubtNodes() {
  const out = [];
  const stack = [...childrenOf(S.tree, null)].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (node.k === 'q') out.push(node);
    stack.push(...[...childrenOf(S.tree, node.id)].reverse());
  }
  return out;
}

export function renderDoubts(view) {
  const doubts = doubtNodes();
  put(view, el('h1', {}, 'Dubbi aperti'), el('p', { class: 'sub' }, `${doubts.length} punti da chiarire. Quando ne risolvi uno, aprilo e cambia il tipo.`));
  for (const node of doubts) put(view, resultCard(node, []));
}

export function renderMissing(view) {
  put(view, el('h1', {}, 'Voce non trovata'), el('p', { class: 'sub' }, 'Potrebbe essere stata eliminata.'), el('a', { class: 'btn', href: '#/' }, 'Torna alla home'));
}

// --- impostazioni ---
function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function renderSettings(view) {
  const status = el('p', { id: 'status', class: 'note' }, statusText());
  const syncBtn = el('button', { type: 'button', id: 'set-sync', class: 'btn primary', onclick: () => { syncNow().catch(() => {}); } }, 'Sincronizza ora');

  const linkPass = el('input', { id: 'set-link-pass', type: 'password', autocomplete: 'current-password' });
  const linkErr = el('div', { class: 'err', hidden: true, role: 'alert' });
  const linkOut = el('textarea', { id: 'set-link-out', rows: 4, readonly: true, hidden: true });
  const copyBtn = el('button', {
    type: 'button',
    class: 'btn',
    hidden: true,
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(linkOut.value);
        toast('Link copiato.');
      } catch {
        linkOut.select();
        toast('Seleziona e copia il testo.');
      }
    },
  }, 'Copia il link');
  const linkGo = el('button', {
    type: 'button',
    id: 'set-link-go',
    class: 'btn',
    onclick: async () => {
      linkErr.hidden = true;
      linkGo.disabled = true;
      try {
        linkOut.value = await deviceLink(linkPass.value);
        linkOut.hidden = false;
        copyBtn.hidden = false;
        linkPass.value = '';
      } catch (err) {
        linkErr.textContent = err instanceof WrongPassword ? 'Password errata.' : 'Link non creato: riprova.';
        linkErr.hidden = false;
      } finally {
        linkGo.disabled = false;
      }
    },
  }, 'Crea il link');

  const tokenField = el('input', { id: 'set-token', type: 'text', class: 'secret', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const tokenErr = el('div', { class: 'err', hidden: true, role: 'alert' });
  const tokenGo = el('button', {
    type: 'button',
    class: 'btn',
    onclick: async () => {
      tokenErr.hidden = true;
      try {
        await updateToken(tokenField.value.trim());
        tokenField.value = '';
        toast('Chiave aggiornata.');
      } catch (err) {
        tokenErr.textContent = err.message;
        tokenErr.hidden = false;
      }
    },
  }, 'Aggiorna la chiave');

  const theme = el('select', {
    id: 'set-theme',
    onchange: event => {
      applyTheme(event.target.value);
      try { localStorage.setItem('tema', event.target.value); } catch { /* preferenza non essenziale */ }
    },
  }, el('option', { value: 'dark' }, 'Scuro'), el('option', { value: 'light' }, 'Chiaro'), el('option', { value: 'auto' }, 'Come il dispositivo'));
  theme.value = themeChoice === 'auto' || themeChoice === 'light' ? themeChoice : 'dark';

  put(view,
    el('h1', {}, 'Impostazioni'),
    el('section', { class: 'card' }, el('h2', {}, 'Sincronizzazione'), status, syncBtn),
    el('section', { class: 'card' },
      el('h2', {}, 'Collega un altro dispositivo'),
      el('p', { class: 'note' }, 'Il link è cifrato e si apre solo con la tua password. Mandalo a te stesso e aprilo sull\'altro dispositivo.'),
      secretForm(field('La tua password', linkPass), linkErr, linkGo, linkOut, copyBtn)),
    el('section', { class: 'card' }, el('h2', {}, 'Aspetto'), field('Tema', theme)),
    el('section', { class: 'card' },
      el('h2', {}, 'Copie di sicurezza'),
      el('p', { class: 'note' }, 'Il file cifrato si apre solo con la password. Il file leggibile contiene tutto in chiaro: tienilo solo sul tuo PC e non condividerlo.'),
      el('div', { class: 'tools' },
        el('button', { type: 'button', id: 'set-exp-enc', class: 'btn', onclick: async () => saveFile(`manuale-${today()}.enc`, await sealedExport(), 'application/octet-stream') }, 'Scarica cifrato'),
        armButton(el('button', { type: 'button', id: 'set-exp-plain', class: 'btn' }, 'Scarica leggibile'), 'Conferma: file in chiaro', () => saveFile(`manuale-${today()}.json`, JSON.stringify(S.doc, null, 1), 'application/json')))),
    el('section', { class: 'card' },
      el('h2', {}, 'Chiave di accesso'),
      el('p', { class: 'note' }, 'Serve solo quando quella vecchia scade.'),
      field('Nuova chiave', tokenField), tokenErr, tokenGo),
    el('section', { class: 'card' },
      el('h2', {}, 'Sicurezza'),
      el('p', { class: 'note' }, 'L\'app si richiude da sola dopo 14 giorni senza uso.'),
      el('div', { class: 'tools' },
        el('button', { type: 'button', id: 'set-lock', class: 'btn primary', onclick: () => lock() }, 'Blocca ora'),
        armButton(el('button', { type: 'button', class: 'btn danger' }, 'Scollega dispositivo'), S.dirty ? 'Conferma: modifiche non inviate perse' : 'Conferma: scollega', () => forgetDevice())),
    ),
  );
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let themeChoice = null;

export function applyTheme(choice) {
  themeChoice = choice;
  document.documentElement.dataset.theme = resolveTheme(choice, systemDark.matches);
}

systemDark.addEventListener('change', () => {
  if (themeChoice === 'auto') applyTheme('auto');
});
