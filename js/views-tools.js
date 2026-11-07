// Strumenti: calcolatore del netto, proposta al cliente e ripasso.
import { el, put, clear, field, toast, armButton } from './ui.js';
import { getState, setState } from './doc.js';
import { compute, bandValue, breakdown, proposalLine, proposalTotals, proposalText, formatEuro, formatPct, conditionsText } from './calc.js';
import { icon } from './icons.js';
import { openSheet, closeSheet } from './sheet.js';
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
  if (!memory.has(mode.id)) memory.set(mode.id, { values: { ...mode.def }, channel: mode.canali[0]?.id ?? '', query: '', pieces: '', selected: null });
  return memory.get(mode.id);
}

let currentModeId = null;

function step(n, text, forId) {
  return el(forId ? 'label' : 'p', { class: 'step', for: forId }, el('b', {}, String(n)), ' · ' + text);
}

const minus = value => '−' + formatEuro(Math.abs(value));

export function renderCalc(view) {
  const calc = S.doc.calc;
  if (!calc?.modi?.length) {
    put(view, el('p', { class: 'sub' }, 'Calcolatore non disponibile.'));
    return;
  }
  currentModeId ??= calc.modi[0].id;
  const mode = calc.modi.find(m => m.id === currentModeId) ?? calc.modi[0];
  const state = modeState(mode);
  const count = (getState(S.doc, PROPOSAL_KEY) ?? []).length;

  const modeSelect = el('select', {
    id: 'c-mode',
    onchange: event => {
      currentModeId = event.target.value;
      clear(view);
      renderCalc(view);
    },
  }, calc.modi.map(m => el('option', { value: m.id }, m.t)));
  modeSelect.value = mode.id;

  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Canale' });
  for (const channel of mode.canali) {
    chips.append(el('button', {
      type: 'button',
      class: 'chan',
      'data-id': channel.id,
      'aria-pressed': channel.id === state.channel ? 'true' : 'false',
      onclick: () => {
        state.channel = channel.id;
        Object.assign(state.values, channel.val);
        for (const b of chips.children) b.setAttribute('aria-pressed', b.dataset.id === channel.id ? 'true' : 'false');
        drawList();
      },
    }, channel.t.split(' · ')[0]));
  }

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
      drawList();
    },
  }) : null;

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
      state.selected = null;
      drawList();
    },
  });

  function openConditions() {
    const params = el('div', { class: 'params' }, mode.campi.map(campo => field(`${campo.t} (${campo.u})`, el('input', {
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
    }), campo.nota)));
    openSheet({
      title: 'Condizioni applicate',
      body: [el('p', { class: 'note' }, 'Valgono per questo calcolo finché l\'app è aperta.'), params],
      actions: [el('button', { type: 'button', class: 'btn primary', id: 'c-cond-done', onclick: () => closeSheet() }, 'Fatto')],
    });
  }

  function drawList() {
    const rows = calc.listini[mode.listino] ?? [];
    const wanted = normalize(state.query).split(/\s+/).filter(Boolean);
    const matching = wanted.length ? rows.filter(row => wanted.every(word => normalize(row.cerca).includes(word))) : rows;
    clear(list);
    if (!matching.length) {
      list.append(el('p', { class: 'sub' }, 'Nessun articolo trovato.'));
      return;
    }
    const chosen = matching.length === 1 ? matching[0] : matching.find(row => row.codice === state.selected);
    if (chosen) {
      list.append(detailCard(mode, chosen, state, calc));
      if (matching.length > 1) {
        list.append(el('button', { type: 'button', class: 'btn', onclick: () => { state.selected = null; drawList(); } }, 'Torna all\'elenco'));
      }
      return;
    }
    list.append(el('p', { class: 'muted' }, `${matching.length} articoli · tocca per il dettaglio`));
    matching.slice(0, MAX_ROWS).forEach(row => list.append(compactItem(mode, row, state, () => {
      state.selected = row.codice;
      drawList();
      list.scrollIntoView({ block: 'start' });
    })));
    if (matching.length > MAX_ROWS) list.append(el('p', { class: 'muted' }, `Mostro i primi ${MAX_ROWS}: restringi la ricerca.`));
  }

  put(view,
    el('div', { class: 'sec-head' },
      el('div', { class: 'grow' }, el('h1', {}, 'Calcola il netto')),
      el('a', { id: 'c-prop', class: 'btn', href: '#/proposta' }, 'Proposta', count ? el('span', { class: 'count' }, String(count)) : null)),
    step(1, 'Tipo e canale'),
    field('Tipo', modeSelect),
    chips,
    band ? field(mode.fascia.t, band, `Aggiorna da solo «${mode.campi.find(c => c.k === mode.fascia.campo)?.t}»`) : null,
    step(2, 'Articolo', 'c-q'),
    search,
    step(3, 'Netto e dettaglio degli sconti'),
    list,
    el('button', { type: 'button', id: 'c-cond', class: 'wide-btn', onclick: openConditions }, el('span', {}, 'Cambia le condizioni'), icon('go', 16)),
  );
  drawList();
}

function compactItem(mode, row, state, choose) {
  const out = compute(mode, row, state.values);
  return el('button', { type: 'button', class: 'item', onclick: choose },
    el('span', { class: 'item-main' },
      el('b', {}, row.tit),
      el('span', { class: 'meta' }, [row.codice, row.sub].filter(Boolean).join(' · '))),
    el('span', { class: 'item-price' }, out ? formatEuro(out.principale) : '—'));
}

function detailCard(mode, row, state, calc) {
  const detail = breakdown(mode, row, state.values);
  const head = [
    el('h3', {}, row.tit),
    el('div', { class: 'meta' }, [row.codice, row.sub].filter(Boolean).join(' · ')),
    row.gruppo ? el('div', { class: 'meta' }, row.gruppo) : null,
    row.tag?.length ? el('div', { class: 'tags' }, row.tag.map(tag => el('span', { class: 'tag' }, tag))) : null,
  ];
  if (!detail) return el('article', { class: 'item selected', 'data-code': row.codice }, head, el('p', { class: 'sub' }, 'Prezzo non disponibile per questo articolo.'));

  const blocks = detail.blocks.map(block => el('div', { class: 'bd' },
    el('div', { class: 'bd-base' }, el('span', {}, block.base.label), el('span', { class: 'val' }, formatEuro(block.base.value))),
    block.items.map(item => (item.kind === 'line'
      ? el('div', { class: 'bd-line' }, el('span', {}, item.label), el('span', { class: 'pct' }, item.pct === null ? 'a pezzo' : '−' + formatPct(item.pct)), el('span', { class: 'eur' }, minus(item.eur)))
      : el('div', { class: 'bd-sub' }, el('span', {}, item.label), el('span', { class: 'pct' }, '−' + formatPct(item.pct)), el('span', { class: 'val' }, formatEuro(item.value)))))));
  const firstBase = detail.blocks[0].base.value;

  return el('article', { class: 'item selected', 'data-code': row.codice },
    head,
    el('div', { class: 'big-net' }, el('span', { class: 'net' }, formatEuro(detail.netto)), el('span', { class: 'net-pill' }, '−' + formatPct(detail.scontoPct))),
    blocks,
    el('p', { class: 'note' }, 'Percentuali sommate e applicate alla base, poi gli importi a pezzo. Compaiono solo le voci diverse da zero.'),
    el('p', { class: 'note' }, `1% di questa base = ${formatEuro(firstBase / 100)}${calc.notaUnPct ? ' (' + calc.notaUnPct + ')' : ''}`),
    el('button', {
      type: 'button',
      class: 'btn primary add',
      onclick: () => {
        const out = compute(mode, row, state.values);
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
        const counter = document.querySelector('#c-prop .count') ?? document.getElementById('c-prop').appendChild(el('span', { class: 'count' }));
        counter.textContent = String(items.length);
        toast('Aggiunto alla proposta.');
      },
    }, icon('plus', 18), 'Aggiungi alla proposta'));
}

export function renderProposal(view) {
  let items = [...(getState(S.doc, PROPOSAL_KEY) ?? [])];
  const save = () => commit(doc => setState(doc, PROPOSAL_KEY, items), { render: false }).catch(() => {});
  put(view, el('h1', {}, 'Proposta al cliente'));
  if (!items.length) {
    put(view, el('p', { class: 'sub' }, 'Nessun articolo. Aggiungili dal calcolatore: ogni riga conserva le condizioni con cui l\'hai inserita.'),
      el('a', { class: 'row tool', href: '#/calc' }, el('div', { class: 'grow' }, el('b', {}, 'Vai al calcolatore')), icon('go', 18)));
    return;
  }
  const total = el('div', { id: 'p-total', class: 'total-card' });
  const redraw = () => {
    const t = proposalTotals(items);
    clear(total);
    put(total,
      el('span', { class: 'note' }, 'Totale netto'),
      el('b', { class: 'total-value' }, formatEuro(t.netto)),
      el('span', { class: 'note' }, `${t.pezzi} pezzi · listino ${formatEuro(t.listino)} · sconto medio ${formatPct(t.scontoPct)}`),
      t.haMargine ? el('span', { class: 'note' }, 'Margine ' + formatEuro(t.margine)) : null,
    );
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
    progressBar(counts, list.length),
    el('p', { id: 'q-counts', class: 'note' }, `${list.length} domande · ${counts.ok} sapute · ${counts.rip} da ripassare · ${counts.nuove} mai viste`),
  );
  if (!currentQuestion) {
    put(view, el('p', { class: 'sub' }, 'Nessuna domanda in questa selezione.'));
    return;
  }
  const question = currentQuestion;
  const answer = el('div', { id: 'q-answer', class: 'quiz-a enter', hidden: true }, inlineNodes(question.r));
  const mark = value => async () => {
    await commit(doc => setState(doc, 'quiz:' + question.id, value), { render: false }).catch(() => {});
    currentQuestion = pickNext(list, statusOf, quizFilter, question.id);
    redraw();
  };
  const verdict = el('div', { class: 'verdict enter', hidden: true },
    el('button', { type: 'button', id: 'q-rip', class: 'btn amber', onclick: mark('rip') }, 'Da ripassare'),
    el('button', { type: 'button', id: 'q-ok', class: 'btn primary', onclick: mark('ok') }, 'La sapevo'));
  const showBtn = el('button', {
    type: 'button',
    id: 'q-show',
    class: 'btn primary big',
    onclick: () => {
      answer.hidden = false;
      verdict.hidden = false;
      showBtn.hidden = true;
    },
  }, 'Mostra la risposta');
  put(view, el('section', { class: 'quiz-card' }, el('p', { class: 'quiz-q' }, question.q), answer), showBtn, verdict);
}

function progressBar(counts, total) {
  const ok = el('span', { class: 'p-ok' });
  const rip = el('span', { class: 'p-rip' });
  ok.style.width = (total ? (counts.ok / total) * 100 : 0) + '%';
  rip.style.width = (total ? (counts.rip / total) * 100 : 0) + '%';
  return el('div', { id: 'q-progress', class: 'progress', role: 'img', 'aria-label': `${counts.ok} sapute e ${counts.rip} da ripassare su ${total}` }, ok, rip);
}
