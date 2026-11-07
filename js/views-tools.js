// Strumenti: calcolatore del netto, proposta al cliente e ripasso.
import { el, put, clear, field, toast, armButton } from './ui.js';
import { getState, setState } from './doc.js';
import { compute, bandValue, percentOf, proposalLine, proposalTotals, proposalText, formatEuro, formatPct, conditionsText } from './calc.js';
import { normalize } from './search.js';
import { questionsOf, pickNext, quizCounts } from './quiz.js';
import { childrenOf } from './doc.js';
import { S, commit } from './session.js';
import { inlineNodes } from './ui.js';

const MAX_ROWS = 40;
const PROPOSAL_KEY = 'proposta';

// Valori del calcolatore: restano finché l'app è aperta, per ogni modalità.
const memory = new Map();

function modeState(mode) {
  if (!memory.has(mode.id)) memory.set(mode.id, { values: { ...mode.def }, channel: mode.canali[0]?.id ?? '', query: '', pieces: '' });
  return memory.get(mode.id);
}

let currentModeId = null;

export function renderCalc(view) {
  const calc = S.doc.calc;
  if (!calc?.modi?.length) {
    put(view, el('p', { class: 'sub' }, 'Calcolatore non disponibile.'));
    return;
  }
  currentModeId ??= calc.modi[0].id;
  const mode = calc.modi.find(m => m.id === currentModeId) ?? calc.modi[0];
  const state = modeState(mode);

  const modeSelect = el('select', {
    id: 'c-mode',
    onchange: event => {
      currentModeId = event.target.value;
      clear(view);
      renderCalc(view);
    },
  }, calc.modi.map(m => el('option', { value: m.id }, m.t)));
  modeSelect.value = mode.id;

  const channelSelect = el('select', {
    id: 'c-chan',
    onchange: event => {
      state.channel = event.target.value;
      Object.assign(state.values, mode.canali.find(c => c.id === state.channel)?.val);
      syncFields();
      drawList();
    },
  }, mode.canali.map(c => el('option', { value: c.id }, c.t)));
  channelSelect.value = state.channel;

  const inputs = new Map();
  const params = el('div', { class: 'params' }, mode.campi.map(campo => {
    const input = el('input', {
      id: 'cf-' + campo.k,
      type: 'number',
      inputmode: 'decimal',
      min: '0',
      step: campo.u === '€' ? '1' : '0.1',
      value: state.values[campo.k] ?? 0,
      oninput: event => {
        state.values[campo.k] = parseFloat(String(event.target.value).replace(',', '.')) || 0;
        drawList();
      },
    });
    inputs.set(campo.k, input);
    return field(`${campo.t} (${campo.u})`, input, campo.nota);
  }));
  const syncFields = () => { for (const [key, input] of inputs) input.value = state.values[key] ?? 0; };

  const band = mode.fascia ? el('input', {
    id: 'c-band',
    type: 'number',
    inputmode: 'numeric',
    min: '0',
    value: state.pieces,
    oninput: event => {
      state.pieces = event.target.value;
      const pieces = parseInt(event.target.value, 10);
      if (Number.isNaN(pieces)) return;
      state.values[mode.fascia.campo] = bandValue(mode.fascia.soglie, pieces);
      syncFields();
      drawList();
    },
  }) : null;

  const summary = el('div', { id: 'c-summary', class: 'summary' });
  const list = el('div', { id: 'c-list' });
  const search = el('input', {
    id: 'c-q',
    type: 'search',
    class: 'input',
    placeholder: calc.titoloRicerca ?? 'Cerca articolo',
    value: state.query,
    autocomplete: 'off',
    oninput: event => {
      state.query = event.target.value;
      drawList();
    },
  });

  function drawList() {
    const rows = calc.listini[mode.listino] ?? [];
    const wanted = normalize(state.query).split(/\s+/).filter(Boolean);
    const matching = wanted.length ? rows.filter(row => wanted.every(word => normalize(row.cerca).includes(word))) : rows;

    const parts = mode.prezzi.map(price => [price.t, formatPct(percentOf(price, state.values))]);
    const extras = mode.prezzi.flatMap(price => price.meno ?? []).filter(rule => state.values[rule.campo]).map(rule => `− ${state.values[rule.campo]} €`);
    const average = matching.length ? matching.reduce((sum, row) => sum + (row.col[mode.prezzi.find(p => p.id === mode.principale).da] || 0), 0) / matching.length : 0;
    clear(summary);
    summary.append(...parts.map(([label, value]) => el('span', {}, label + ' ', el('b', {}, value))));
    if (extras.length) summary.append(el('span', {}, extras.join(' ')));
    summary.append(el('span', {}, `1% ≈ ${formatEuro(average / 100)}${calc.notaUnPct ? ' (' + calc.notaUnPct + ')' : ''}`));

    clear(list);
    list.append(el('p', { class: 'muted' }, `${matching.length} articoli`));
    if (!matching.length) list.append(el('p', { class: 'sub' }, 'Nessun articolo trovato.'));
    matching.slice(0, MAX_ROWS).forEach(row => list.append(itemCard(mode, row, state)));
    if (matching.length > MAX_ROWS) list.append(el('p', { class: 'muted' }, `Mostro i primi ${MAX_ROWS}: restringi la ricerca.`));
  }

  put(view,
    el('h1', {}, 'Calcola il netto'),
    field('Tipo', modeSelect),
    field('Canale', channelSelect),
    band ? field(mode.fascia.t, band, `Aggiorna da solo «${mode.campi.find(c => c.k === mode.fascia.campo)?.t}»`) : null,
    field('Articolo', search),
    summary,
    el('details', { class: 'qa' }, el('summary', {}, 'Modifica le condizioni'), el('div', { class: 'detail-body' }, params)),
    list,
    el('a', { class: 'row tool', href: '#/proposta' }, el('div', { class: 'grow' }, el('b', {}, 'Apri la proposta al cliente')), el('i', { class: 'go' }, '›')),
  );
  drawList();
}

function itemCard(mode, row, state) {
  const out = compute(mode, row, state.values);
  const lines = out ? mode.mostra.map(cell => {
    const value = cell.prezzo ? out.prezzi[cell.prezzo] : row.col[cell.col];
    return el('div', { class: cell.forte ? 'strong' : undefined }, el('span', {}, cell.t), el('span', {}, formatEuro(value)));
  }) : [el('div', {}, el('span', {}, 'Prezzo non disponibile'))];
  return el('article', { class: 'item' },
    el('h3', {}, row.tit),
    el('div', { class: 'meta' }, [row.codice, row.sub].filter(Boolean).join(' · ')),
    row.gruppo ? el('div', { class: 'meta' }, row.gruppo) : null,
    row.tag?.length ? el('div', { class: 'tags' }, row.tag.map(tag => el('span', { class: 'tag' }, tag))) : null,
    el('div', { class: 'prices' }, lines),
    out ? el('p', { class: 'muted' }, 'Sconto effettivo ' + formatPct(out.scontoPct)) : null,
    out ? el('button', {
      type: 'button',
      class: 'btn add',
      onclick: () => {
        const channel = mode.canali.find(c => c.id === state.channel);
        const line = proposalLine({
          codice: row.codice,
          descr: `${row.tit} ${row.sub}${mode.proposta?.suffisso ?? ''}`.trim(),
          listino: out.listino,
          netto: out.principale,
          cond: conditionsText(mode, state.values, channel?.t.split(' · ')[0] ?? ''),
        });
        const items = [...(getState(S.doc, PROPOSAL_KEY) ?? []), line];
        commit(doc => setState(doc, PROPOSAL_KEY, items), { render: false }).catch(() => {});
        toast('Aggiunto alla proposta.');
      },
    }, '+ Proposta') : null);
}

export function renderProposal(view) {
  let items = [...(getState(S.doc, PROPOSAL_KEY) ?? [])];
  const save = () => commit(doc => setState(doc, PROPOSAL_KEY, items), { render: false }).catch(() => {});
  put(view, el('h1', {}, 'Proposta al cliente'));
  if (!items.length) {
    put(view, el('p', { class: 'sub' }, 'Nessun articolo. Aggiungili dal calcolatore: ogni riga conserva le condizioni con cui l\'hai inserita.'),
      el('a', { class: 'row tool', href: '#/calc' }, el('div', { class: 'grow' }, el('b', {}, 'Vai al calcolatore')), el('i', { class: 'go' }, '›')));
    return;
  }
  const total = el('p', { id: 'p-total', class: 'summary' });
  const redraw = () => {
    const t = proposalTotals(items);
    clear(total);
    total.append(el('span', {}, 'Totale netto ', el('b', {}, formatEuro(t.netto))), el('span', {}, `${t.pezzi} pezzi · listino ${formatEuro(t.listino)} · sconto medio ${formatPct(t.scontoPct)}`));
    if (t.haMargine) total.append(el('span', {}, 'Margine ' + formatEuro(t.margine)));
  };
  const rerender = () => {
    clear(view);
    renderProposal(view);
  };
  const lines = items.map((item, i) => {
    const lineTotal = el('span', { class: 'muted' });
    const drawLine = () => {
      lineTotal.textContent = `Totale riga ${formatEuro(item.netto * item.q)}` + (item.f !== null && item.f !== undefined ? ` · margine ${formatEuro(item.f - item.netto)} a pezzo` : '');
    };
    drawLine();
    return el('article', { class: 'pline' },
      el('b', {}, item.descr),
      el('div', { class: 'meta muted' }, `${item.codice} · ${item.cond}`),
      el('div', { class: 'meta muted' }, `Listino ${formatEuro(item.listino)} · netto ${formatEuro(item.netto)}`),
      el('div', { class: 'pline-grid' },
        field('Pezzi', el('input', {
          class: 'qty',
          type: 'number',
          min: '0',
          step: '1',
          inputmode: 'numeric',
          value: item.q,
          oninput: event => {
            const q = parseInt(event.target.value, 10);
            items[i] = item = { ...item, q: Number.isNaN(q) || q < 0 ? 0 : q };
            drawLine();
            redraw();
            save();
          },
        })),
        field('Prezzo finale €', el('input', {
          class: 'fin',
          type: 'number',
          min: '0',
          step: '0.01',
          inputmode: 'decimal',
          value: item.f ?? '',
          oninput: event => {
            const f = parseFloat(String(event.target.value).replace(',', '.'));
            items[i] = item = { ...item, f: Number.isNaN(f) ? null : f };
            drawLine();
            redraw();
            save();
          },
        }))),
      lineTotal,
      el('div', { class: 'tools' }, el('button', {
        type: 'button',
        class: 'btn danger',
        onclick: () => {
          items = items.filter((_, index) => index !== i);
          save();
          rerender();
        },
      }, 'Togli')));
  });
  const textArea = el('textarea', { id: 'p-text', readonly: true, placeholder: 'Il testo della proposta compare qui' });
  const copy = el('button', {
    type: 'button',
    id: 'p-copy',
    class: 'btn primary',
    onclick: async () => {
      const text = proposalText(items, S.doc.calc?.proposta ?? {});
      textArea.value = text;
      try {
        await navigator.clipboard.writeText(text);
        toast('Proposta copiata.');
      } catch {
        textArea.select();
        toast('Testo pronto: selezionalo e copialo.');
      }
    },
  }, 'Copia la proposta');
  const empty = armButton(el('button', { type: 'button', class: 'btn danger' }, 'Svuota'), 'Conferma: svuota', () => {
    items = [];
    save();
    rerender();
  });
  redraw();
  put(view, total, ...lines, el('div', { class: 'tools' }, copy, empty), textArea);
}

// --- ripasso ---
let quizAmbito = '';
let quizFilter = 'tutte';
let currentQuestion = null;
const FILTERS = [['tutte', 'Tutte'], ['rip', 'Da ripassare'], ['nuove', 'Mai viste']];

export function renderQuiz(view) {
  const statusOf = id => getState(S.doc, 'quiz:' + id);
  const list = questionsOf(S.doc, S.tree, quizAmbito || null);
  const counts = quizCounts(list, statusOf);
  if (!currentQuestion || !list.some(q => q.id === currentQuestion.id) || (quizFilter === 'rip' && statusOf(currentQuestion.id) !== 'rip') || (quizFilter === 'nuove' && statusOf(currentQuestion.id))) {
    currentQuestion = pickNext(list, statusOf, quizFilter, null);
  }
  const redraw = () => {
    clear(view);
    renderQuiz(view);
  };
  const ambitoSelect = el('select', {
    id: 'q-ambito',
    onchange: event => {
      quizAmbito = event.target.value;
      currentQuestion = null;
      redraw();
    },
  }, el('option', { value: '' }, 'Tutti gli ambiti'), childrenOf(S.tree, null).map(a => el('option', { value: a.id }, a.t)));
  ambitoSelect.value = quizAmbito;
  const filterSelect = el('select', {
    id: 'q-filter',
    onchange: event => {
      quizFilter = event.target.value;
      currentQuestion = null;
      redraw();
    },
  }, FILTERS.map(([value, label]) => el('option', { value }, label)));
  filterSelect.value = quizFilter;

  put(view, 
    el('h1', {}, 'Ripasso'),
    el('div', { class: 'pline-grid' }, field('Ambito', ambitoSelect), field('Quali', filterSelect)),
    el('p', { id: 'q-counts', class: 'muted' }, `Domande: ${list.length} · Sapute: ${counts.ok} · Da ripassare: ${counts.rip} · Mai viste: ${counts.nuove}`),
  );
  if (!currentQuestion) {
    put(view, el('p', { class: 'sub' }, 'Nessuna domanda in questa selezione.'));
    return;
  }
  const question = currentQuestion;
  const answer = el('div', { id: 'q-answer', class: 'quiz-a', hidden: true }, inlineNodes(question.r));
  const mark = value => async () => {
    await commit(doc => setState(doc, 'quiz:' + question.id, value), { render: false }).catch(() => {});
    currentQuestion = pickNext(list, statusOf, quizFilter, question.id);
    redraw();
  };
  const verdict = el('div', { class: 'tools', hidden: true },
    el('button', { type: 'button', id: 'q-ok', class: 'btn primary', onclick: mark('ok') }, 'Saputa'),
    el('button', { type: 'button', id: 'q-rip', class: 'btn', onclick: mark('rip') }, 'Da ripassare'));
  const showBtn = el('button', {
    type: 'button',
    id: 'q-show',
    class: 'btn primary',
    onclick: () => {
      answer.hidden = false;
      verdict.hidden = false;
      showBtn.hidden = true;
    },
  }, 'Mostra la risposta');
  put(view, el('section', { class: 'card' }, el('p', { class: 'quiz-q' }, question.q), answer, showBtn, verdict));
}
