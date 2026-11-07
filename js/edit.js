// Foglio di modifica: stessi campi da telefono e da PC. Ogni salvataggio marca la voce come «modificata».
import { el, clear, field, toast, armButton } from './ui.js';
import { editNode, addNode, removeNode, restoreNode, countDescendants } from './doc.js';
import { rowsToText, textToRows, stepsToText, textToSteps, listToText, textToList, sourcesToText, textToSources } from './forms.js';
import { S, commit } from './session.js';

const LABELS = { pt: 'punto', num: 'numero', qa: 'domanda', tab: 'tabella', proc: 'procedura', sec: 'sezione', amb: 'ambito' };

function area(id, value, rows = 4) { return el('textarea', { id, rows, value: value ?? '' }); }
function line(id, value) { return el('input', { id, value: value ?? '' }); }

function kindSelect(value) {
  const select = el('select', { id: 'f-k' },
    el('option', { value: '' }, 'Normale'),
    el('option', { value: 'key' }, 'Da sapere'),
    el('option', { value: 'q' }, 'Dubbio da verificare'),
    el('option', { value: 'n' }, 'Nota'));
  select.value = value ?? '';
  return select;
}

// Ogni tipo descrive i suoi campi e come rileggerli.
const FORMS = {
  pt: node => ({
    fields: [
      field('Testo', area('f-t', node.t, 5), 'Puoi usare **grassetto** e `sigla`.'),
      field('Tipo', kindSelect(node.k)),
      field('Fonti', line('f-s', sourcesToText(node.s))),
    ],
    read: () => ({ t: val('f-t'), k: val('f-k') || undefined, s: optionalList(textToSources(val('f-s'))) }),
  }),
  num: node => ({
    fields: [field('Che cosa', area('f-t', node.t, 2)), field('Valore', line('f-val', node.val)), field('Fonti', line('f-s', sourcesToText(node.s)))],
    read: () => ({ t: val('f-t'), val: val('f-val'), s: optionalList(textToSources(val('f-s'))) }),
  }),
  qa: node => ({
    fields: [field('Domanda', area('f-t', node.t, 2)), field('Risposta', area('f-r', node.r, 6))],
    read: () => ({ t: val('f-t'), r: val('f-r') }),
  }),
  sec: node => ({
    fields: [field('Titolo', area('f-t', node.t, 2)), field('Sottotitolo', line('f-sub', node.sub))],
    read: () => ({ t: val('f-t'), sub: val('f-sub') || undefined }),
  }),
  tab: node => ({
    fields: [
      field('Titolo', area('f-t', node.t, 2)),
      field('Colonne', line('f-cols', (node.cols ?? []).join(' | ')), 'Separate da |'),
      field('Righe', area('f-rows', rowsToText(node.rows), 10), 'Una per riga, celle separate da |'),
    ],
    read: () => {
      const cols = val('f-cols').split('|').map(c => c.trim());
      return { t: val('f-t'), cols, rows: textToRows(val('f-rows'), cols.length) };
    },
  }),
  proc: node => ({
    fields: [
      field('Titolo', area('f-t', node.t, 2)),
      field('Quando serve', area('f-q', node.q, 3)),
      field('Passi', area('f-steps', stepsToText(node.steps), 10), 'Uno per riga: Passo :: dettaglio @fonte'),
      field('Attenzioni', area('f-warn', listToText(node.warn), 3), 'Una per riga'),
      field('Strumenti', line('f-tools', node.tools)),
      field('Da verificare', area('f-verify', node.verify, 2)),
    ],
    read: () => ({
      t: val('f-t'),
      q: val('f-q'),
      steps: textToSteps(val('f-steps')),
      warn: textToList(val('f-warn')),
      tools: val('f-tools') || undefined,
      verify: val('f-verify') || undefined,
    }),
  }),
};

function val(id) { return document.getElementById(id).value.trim(); }
function optionalList(list) { return list.length ? list : undefined; }

function show(title, form, actions) {
  const sheet = document.getElementById('sheet');
  clear(sheet);
  const err = el('div', { class: 'err', hidden: true, role: 'alert' });
  sheet.append(el('h2', { id: 'sheet-title' }, title), ...form.fields, err, el('div', { class: 'sheet-actions' }, actions(err)));
  sheet.showModal();
  return sheet;
}

function saveAction(form, err, apply) {
  return el('button', {
    type: 'button',
    id: 'f-save',
    class: 'btn primary',
    onclick: async () => {
      const fields = form.read();
      if (!fields.t) {
        err.textContent = 'Il testo non può essere vuoto.';
        err.hidden = false;
        return;
      }
      document.getElementById('sheet').close();
      await commit(doc => apply(doc, fields)).catch(() => {});
    },
  }, 'Salva');
}

function cancelAction() {
  return el('button', { type: 'button', id: 'f-cancel', class: 'btn', onclick: () => document.getElementById('sheet').close() }, 'Annulla');
}

export function openEditor(id) {
  const node = S.doc.nodes[id];
  const build = FORMS[node.ty];
  if (!build) return;
  const form = build(node);
  show('Modifica ' + (LABELS[node.ty] ?? 'voce'), form, err => {
    const kids = countAllKids(id);
    const del = armButton(
      el('button', { type: 'button', id: 'f-del', class: 'btn danger' }, 'Elimina'),
      kids ? `Conferma: elimina con ${kids} sotto-voci` : 'Conferma: elimina',
      async () => {
        document.getElementById('sheet').close();
        await commit(doc => removeNode(doc, id)).catch(() => {});
        toast('Eliminato.', { label: 'Annulla', run: () => commit(doc => restoreNode(doc, id)).catch(() => {}) });
      },
    );
    const addChild = node.ty === 'pt'
      ? el('button', { type: 'button', class: 'btn', onclick: () => { document.getElementById('sheet').close(); openNew(id, 'pt'); } }, '＋ Sotto-punto')
      : null;
    return [saveAction(form, err, (doc, fields) => editNode(doc, id, { ...fields, ed: true })), cancelAction(), el('span', { class: 'spacer' }), addChild, del];
  });
}

function countAllKids(id) {
  let total = 0;
  const stack = [...(S.tree.kids.get(id) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    total++;
    stack.push(...(S.tree.kids.get(node.id) ?? []));
  }
  return total;
}

const BLANK = {
  pt: { t: '' },
  num: { t: '', val: '' },
  qa: { t: '', r: '' },
  proc: { t: '', q: '', steps: [], warn: [] },
};

export function openNew(parentId, ty) {
  const form = FORMS[ty](BLANK[ty]);
  show('Nuovo ' + (LABELS[ty] ?? 'voce'), form, err => [
    saveAction(form, err, (doc, fields) => addNode(doc, parentId, { ty, ...fields, ed: true })),
    cancelAction(),
  ]);
}

export { countDescendants };
