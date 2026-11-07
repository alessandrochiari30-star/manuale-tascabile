// Schermate di consultazione: home, ambito, sezione, ricerca, dubbi e impostazioni.
import { el, put, inlineNodes, sourcesLine, field, armButton, toast, secretForm } from './ui.js';
import { childrenOf, countDescendants, breadcrumb, getState, setState } from './doc.js';
import { search } from './search.js';
import { entryText } from './entries.js';
import { snippet } from './forms.js';
import { plainText } from './inline.js';
import { S, commit, syncNow, lock, deviceLink, updateToken, forgetDevice, sealedExport } from './session.js';
import { WrongPassword } from './vault.js';
import { openEditor, openNew } from './edit.js';

const fonti = () => S.doc.meta?.fonti ?? {};
const nav = hash => { location.hash = hash; };

// --- home ---
export function renderHome(view) {
  const tiles = childrenOf(S.tree, null).map((a, i) => {
    const hasTool = childrenOf(S.tree, a.id).some(n => n.ty === 'link');
    const procs = countDescendants(S.tree, a.id, 'proc');
    const unit = a.unit ?? 'punti';
    const facts = [`${countDescendants(S.tree, a.id, 'pt')} ${unit}`];
    if (hasTool) facts.push('calcolatore');
    else if (procs) facts.push(`${procs} procedure`);
    return el('a', { class: 'tile' + (i === 0 ? ' main' : ''), href: `#/a/${encodeURIComponent(a.id)}` }, el('b', {}, a.t), el('span', {}, facts.join(' · ')));
  });
  const questions = Object.values(S.doc.nodes).filter(n => S.tree.visible.has(n.id) && (n.ty === 'qa' || n.ty === 'proc')).length;
  tiles.push(el('a', { class: 'tile', href: '#/ripasso' }, el('b', {}, 'Ripasso'), el('span', {}, `${questions} domande`)));

  const doubts = doubtNodes().length;
  put(view, 
    el('div', { class: 'grid' }, tiles),
    doubts ? el('a', { id: 'home-dubbi', class: 'row warn', href: '#/dubbi' }, el('div', { class: 'grow' }, el('b', {}, `${doubts} dubbi aperti`), el('span', {}, 'Da verificare prima di dirli a un cliente')), el('i', { class: 'go' }, '›')) : null,
    el('p', { class: 'status', id: 'status' }, statusText()),
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
      el('i', { class: 'go' }, '›')));
  }
}

// --- sezione ---
const expanded = new Set();

function editButton(id) {
  return el('button', { type: 'button', class: 'edit', 'aria-label': 'Modifica', onclick: event => { event.stopPropagation(); event.preventDefault(); openEditor(id); } }, '✎');
}

function renderPoint(node, focusId) {
  const kids = childrenOf(S.tree, node.id);
  const classes = ['node'];
  if (kids.length) classes.push('can');
  if (node.k === 'key') classes.push('key');
  if (node.k === 'q') classes.push('doubt');
  if (node.k === 'n') classes.push('note');
  if (node.id === focusId) classes.push('flash');
  const open = expanded.has(node.id);
  if (open) classes.push('open');

  const box = el('div', { class: classes.join(' '), 'data-id': node.id });
  const toggle = () => {
    if (expanded.has(node.id)) expanded.delete(node.id);
    else expanded.add(node.id);
    const holder = box.querySelector(':scope > .kids');
    box.classList.toggle('open');
    if (holder) holder.hidden = !box.classList.contains('open');
    else if (box.classList.contains('open')) box.append(kidsOf(kids, focusId));
  };
  const source = sourcesLine(node.s, fonti());
  const text = el('div', { class: 'node-text', onclick: kids.length ? toggle : undefined },
    node.k === 'q' ? el('span', { class: 'flag' }, '⚠ Da verificare') : null,
    inlineNodes(node.t),
    typeof node.v === 'number' ? el('div', { class: 'vbar' }, barFill(node.v)) : null,
    source || node.ed ? el('span', { class: 'src' }, source, node.ed ? el('span', { class: 'mine' }, source ? ' · modificato da te' : 'modificato da te') : null) : null);
  box.append(el('div', { class: 'node-row' },
    kids.length ? el('button', { type: 'button', class: 'chev', 'aria-label': 'Apri o chiudi', onclick: toggle }, '▸') : el('span', { class: 'nochev' }),
    text,
    editButton(node.id)));
  if (open && kids.length) box.append(kidsOf(kids, focusId));
  return box;
}

function barFill(value) {
  const fill = el('i');
  fill.style.width = Math.max(0, Math.min(100, value)) + '%';
  return fill;
}

function kidsOf(kids, focusId) {
  return el('div', { class: 'kids' }, kids.map(kid => renderAny(kid, focusId)));
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
  return el('div', { class: 'tabblock' + (node.id === focusId ? ' node flash' : ''), 'data-id': node.id },
    el('div', { class: 'tabhead node-row' }, el('span', {}, node.t), editButton(node.id)),
    el('div', { class: 'tabwrap' }, el('table', {},
      el('thead', {}, el('tr', {}, (node.cols ?? []).map(col => el('th', {}, col)))),
      el('tbody', {}, body))),
    sourcesLine(node.s, fonti()) ? el('span', { class: 'src' }, sourcesLine(node.s, fonti())) : null);
}

function renderNumber(node, focusId) {
  return el('div', { class: 'node' + (node.id === focusId ? ' flash' : ''), 'data-id': node.id },
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

function renderAny(node, focusId) {
  switch (node.ty) {
    case 'tab': return renderTable(node, focusId);
    case 'num': return renderNumber(node, focusId);
    case 'qa': return renderQuestion(node, focusId);
    case 'proc': return renderProcedure(node, focusId);
    default: return renderPoint(node, focusId);
  }
}

export function renderSection(view, id, focusId) {
  const node = S.doc.nodes[id];
  if (!node || !S.tree.visible.has(id)) return renderMissing(view);
  if (focusId) for (const parent of breadcrumb(S.tree, focusId)) expanded.add(parent.id);

  const kids = childrenOf(S.tree, id);
  const expandable = kids.some(kid => childrenOf(S.tree, kid.id).length);
  const addTy = addTypeFor(kids);
  put(view, 
    el('div', { class: 'tabhead' }, el('h1', {}, node.t), editButton(id)),
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
    el('div', {}, kids.map(kid => renderAny(kid, focusId))),
    el('div', { class: 'tools' }, el('button', { type: 'button', id: 'add-node', class: 'btn', onclick: () => openNew(id, addTy.ty) }, '＋ ' + addTy.label)),
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

function resultCard(node, words) {
  const doubt = node.k === 'q';
  const path = breadcrumb(S.tree, node.id).map(p => plainText(p.t)).slice(0, 3).join(' › ');
  const text = node.ty === 'num' ? `${node.t}: ${node.val}` : entryText(node);
  const source = sourcesLine(node.s, fonti());
  return el('article', { class: 'res' + (doubt ? ' dubbio' : '') },
    el('button', { type: 'button', class: 'res-open', onclick: () => nav(targetOf(node)) },
      el('span', { class: 'res-kind' }, doubt ? '⚠ Da verificare' : (KINDS[node.ty] ?? 'Voce')),
      path ? el('span', { class: 'res-path' }, path) : null,
      el('b', {}, snippet(text, words, 190).map(part => (part.hit ? el('mark', {}, part.t) : part.t)))),
    el('div', { class: 'res-foot' },
      el('span', {}, source),
      node.ty === 'link' ? null : el('button', { type: 'button', class: 'edit', onclick: () => openEditor(node.id) }, '✎ Modifica')));
}

export function renderSearch(view, query) {
  const results = search(S.index, query, { synonyms: S.doc.meta?.sinonimi ?? [] });
  if (!results.length) {
    put(view, el('p', { class: 'sub' }, `Nessun risultato per «${query}». Prova con meno parole o con un'altra parola.`));
    return;
  }
  put(view, el('p', { class: 'muted' }, results.length >= 60 ? 'I primi 60 risultati' : `${results.length} risultati`));
  for (const result of results) {
    const node = S.doc.nodes[result.id];
    if (node) put(view, resultCard(node, result.words));
  }
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
  }, el('option', { value: '' }, 'Come il dispositivo'), el('option', { value: 'light' }, 'Chiaro'), el('option', { value: 'dark' }, 'Scuro'));
  theme.value = document.documentElement.dataset.theme ?? '';

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

export function applyTheme(value) {
  if (value) document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
}
