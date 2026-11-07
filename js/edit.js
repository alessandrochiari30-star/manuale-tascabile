// Foglio di modifica: stessi campi da telefono e da PC. Ogni salvataggio marca la voce come «modificata».
import { el, field, toast, armButton } from './ui.js';
import { editNode, addNode, removeNode, restoreNode, countDescendants } from './doc.js';
import { rowsToText, textToRows, stepsToText, textToSteps, listToText, textToList, sourcesToText, textToSources } from './forms.js';
import { S, commit } from './session.js';
import { openSheet, closeSheet } from './sheet.js';

const LABELS = { pt: 'punto', num: 'numero', qa: 'domanda', tab: 'tabella', proc: 'procedura', sec: 'sezione', amb: 'ambito' };

function area(id, value, rows = 4) { return el('textarea', { id, rows, value: value ?? '' }); }
function line(id, value) { return el('input', { id, value: value ?? '' }); }

// Tipo del punto in un tocco: 4 segmenti, uno acceso.
function kindPicker(value) {
  let current = value ?? '';
  const group = el('div', { id: 'f-kind', class: 'segmented', role: 'group', 'aria-label': 'Tipo del punto' });
  const options = [['', 'Normale'], ['key', 'Da sapere'], ['q', 'Dubbio'], ['n', 'Nota']];
  for (const [k, label] of options) {
    group.append(el('button', {
      type: 'button',
      'data-k': k,
      'aria-pressed': k === current ? 'true' : 'false',
      onclick: () => {
        current = k;
        for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.k === current ? 'true' : 'false');
      },
    }, label));
  }
  group.value = () => current;
  return group;
}

// Ogni tipo descrive i suoi campi e come rileggerli.
const FORMS = {
  pt: node => {
    const kind = kindPicker(node.k);
    return {
      fields: [
        field('Testo', area('f-t', node.t, 5), 'Puoi usare **grassetto** e `sigla`.'),
        el('div', { class: 'field' }, el('span', {}, 'Tipo'), kind),
        field('Fonti', line('f-s', sourcesToText(node.s))),
      ],
      read: () => ({ t: val('f-t'), k: kind.value() || undefined, s: optionalList(textToSources(val('f-s'))) }),
    };
  },
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
  const err = el('div', { class: 'err', hidden: true, role: 'alert' });
  return openSheet({ title, body: [...form.fields, err], actions: actions(err) });
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
      closeSheet();
      await commit(doc => apply(doc, fields)).catch(() => {});
    },
  }, 'Salva');
}

export function openEditor(id) {
  const node = S.doc.nodes[id];
  const build = FORMS[node.ty];
  if (!build) return;
  const form = build(node);
  show('Modifica ' + (LABELS[node.ty] ?? 'voce'), form, err => {
    const kids = countAllKids(id);
    const del = armButton(
      el('button', { type: 'button', id: 'f-del', class: 'btn danger text' }, 'Elimina'),
      kids ? `Conferma: elimina con ${kids} sotto-voci` : 'Conferma: elimina',
      async () => {
        closeSheet();
        await commit(doc => removeNode(doc, id)).catch(() => {});
        toast('Eliminato.', { label: 'Annulla', run: () => commit(doc => restoreNode(doc, id)).catch(() => {}) });
      },
    );
    const addChild = node.ty === 'pt'
      ? el('button', { type: 'button', class: 'btn text', onclick: () => { closeSheet(); setTimeout(() => openNew(id, 'pt'), 260); } }, '＋ Sotto-punto')
      : null;
    return [saveAction(form, err, (doc, fields) => editNode(doc, id, { ...fields, ed: true })), addChild, el('span', { class: 'spacer' }), del];
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
  ]);
}

export { countDescendants };
