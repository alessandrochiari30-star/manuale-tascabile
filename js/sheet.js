// Foglio che sale dal basso. Si chiude con la ✕, toccando lo sfondo, con Esc,
// trascinandolo giù oltre 80 px o con il tasto Indietro del telefono.
import { el, clear } from './ui.js';
import { icon } from './icons.js';
import { reducedMotion } from './motion.js';

const DRAG_CLOSE = 80;
const dialog = () => document.getElementById('sheet');
let ownsHistory = false;
let closing = false;

export function openSheet({ title, body, actions }) {
  const d = dialog();
  clear(d);
  d.classList.remove('closing');
  d.style.transform = '';
  closing = false;
  const grip = el('div', { id: 'sheet-grip', class: 'grip', 'aria-hidden': 'true' }, el('span'));
  d.append(
    grip,
    el('div', { class: 'sheet-head' },
      el('h2', { id: 'sheet-title' }, title),
      el('button', { type: 'button', id: 'sheet-close', class: 'round', 'aria-label': 'Chiudi', onclick: () => closeSheet() }, icon('close', 16))),
    ...body,
    el('div', { class: 'sheet-actions' }, actions),
  );
  enableDrag(grip, d);
  d.showModal();
  // Una voce nella cronologia: «Indietro» chiude il foglio invece di lasciare la schermata.
  history.pushState({ sheet: true }, '', location.href);
  ownsHistory = true;
  return d;
}

export function closeSheet({ fromHistory = false } = {}) {
  const d = dialog();
  if (!d.open || closing) return;
  closing = true;
  if (ownsHistory && !fromHistory) history.back();
  ownsHistory = false;
  const finish = () => {
    d.classList.remove('closing');
    d.style.transform = '';
    d.close();
    closing = false;
  };
  if (reducedMotion()) return finish();
  d.classList.add('closing');
  setTimeout(finish, 200);
}

function enableDrag(grip, d) {
  let startY = null;
  grip.addEventListener('pointerdown', event => {
    startY = event.clientY;
    grip.setPointerCapture(event.pointerId);
    d.classList.add('dragging');
  });
  grip.addEventListener('pointermove', event => {
    if (startY === null) return;
    d.style.transform = `translateY(${Math.max(0, event.clientY - startY)}px)`;
  });
  const end = event => {
    if (startY === null) return;
    const moved = event.clientY - startY;
    startY = null;
    d.classList.remove('dragging');
    if (moved > DRAG_CLOSE) closeSheet();
    else d.style.transform = '';
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

// Esc e tocco sullo sfondo passano dalla stessa chiusura, così la cronologia resta in ordine.
const d = dialog();
d.addEventListener('cancel', event => {
  event.preventDefault();
  closeSheet();
});
d.addEventListener('click', event => {
  if (event.target !== d) return;
  const box = d.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) closeSheet();
});
window.addEventListener('popstate', () => {
  if (d.open && ownsHistory) {
    ownsHistory = false;
    closeSheet({ fromHistory: true });
  }
});
