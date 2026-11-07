// Costruisce il DOM solo con nodi e testo: nessun contenuto passa da innerHTML.
import { parseInline } from './inline.js';
import { sourceLabel } from './forms.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'open' || key === 'hidden' || key === 'selected') node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Come append, ma salta i vuoti e accetta elenchi: altrimenti comparirebbe la scritta «null».
export function put(parent, ...children) {
  append(parent, children);
  return parent;
}

export function clear(node) { node.replaceChildren(); }

export function inlineNodes(text) {
  return parseInline(text).map(part => {
    if (part.k === 'bold') return el('strong', {}, part.t);
    if (part.k === 'code') return el('code', {}, part.t);
    if (part.k === 'link') return el('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, part.t);
    return document.createTextNode(part.t);
  });
}

export function sourcesLine(sources, map) {
  if (!sources?.length) return null;
  return 'Fonti: ' + sources.map(code => sourceLabel(code, map)).join(', ');
}

let toastTimer = null;
export function toast(message, action) {
  const box = document.getElementById('toast');
  clear(box);
  box.append(el('span', {}, message));
  if (action) {
    box.append(el('button', { type: 'button', id: 'toast-undo', onclick: () => { hide(); action.run(); } }, action.label));
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  const hide = () => { box.hidden = true; clear(box); };
  toastTimer = setTimeout(hide, action ? 7000 : 2500);
}

export function field(label, control, hint) {
  return el('label', { class: 'field' }, el('span', {}, label), control, hint ? el('small', {}, hint) : null);
}

// Azione distruttiva in due tocchi, senza finestre di sistema che su telefono si perdono.
export function armButton(button, confirmLabel, onConfirm, ms = 6000) {
  const original = button.textContent;
  let armed = false;
  let timer = null;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add('armed');
      timer = setTimeout(() => {
        armed = false;
        button.textContent = original;
        button.classList.remove('armed');
      }, ms);
      return;
    }
    clearTimeout(timer);
    armed = false;
    button.textContent = original;
    button.classList.remove('armed');
    onConfirm();
  });
  return button;
}
