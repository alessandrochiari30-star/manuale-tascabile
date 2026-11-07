// Schermate prima dell'accesso: benvenuto, prima configurazione, collegamento e sblocco.
import { el, put, clear, field, secretForm } from './ui.js';
import { checkPassword, hasLink, WrongPassword, BadFile } from './vault.js';
import { firstSetup, connectWithLink, unlock, forgetDevice } from './session.js';
import { armButton } from './ui.js';
import { RemoteAuth, RemoteOffline } from './remote.js';

function explain(err) {
  if (err instanceof WrongPassword) return 'Password errata.';
  if (err instanceof RemoteOffline) return 'Nessuna connessione: per questo passaggio serve la rete.';
  if (err instanceof RemoteAuth) return 'Accesso rifiutato: controlla utente, repository e chiave di accesso.';
  if (err instanceof BadFile) return err.message;
  return err?.message || 'Operazione non riuscita.';
}

function errorBox() { return el('div', { class: 'err', hidden: true, role: 'alert' }); }
function showError(box, message) {
  box.textContent = message;
  box.hidden = false;
}

function busy(button, label, work) {
  return async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
      await work();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };
}

function passwordInput(id, autocomplete) {
  return el('input', { id, type: 'password', autocomplete, class: 'input' });
}

export function renderWelcome(view, onReady) {
  clear(view);
  const linkField = el('textarea', { id: 'w-link', rows: 3, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'Incolla qui il link' });
  if (hasLink(location.hash)) linkField.value = location.href;
  const linkPass = passwordInput('w-link-pass', 'current-password');
  const linkErr = errorBox();
  const linkGo = el('button', { type: 'button', id: 'w-link-go', class: 'btn primary' }, 'Collega');
  linkGo.addEventListener('click', busy(linkGo, 'Collegamento…', async () => {
    linkErr.hidden = true;
    const raw = linkField.value.trim();
    const at = raw.indexOf('#');
    const fragment = at >= 0 ? raw.slice(at) : '';
    if (!hasLink(fragment)) return showError(linkErr, 'Link non valido: copialo per intero dalle impostazioni dell\'altro dispositivo.');
    try {
      await connectWithLink(fragment, linkPass.value);
      history.replaceState(null, '', location.pathname);
      onReady();
    } catch (err) {
      showError(linkErr, explain(err));
    }
  }));

  const file = el('input', { id: 's-file', type: 'file', accept: '.json,application/json' });
  const pass = passwordInput('s-pass', 'new-password');
  const pass2 = passwordInput('s-pass2', 'new-password');
  const owner = el('input', { id: 's-owner', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const repo = el('input', { id: 's-repo', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const token = el('input', { id: 's-token', type: 'text', class: 'secret', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const setupErr = errorBox();
  const setupGo = el('button', { type: 'button', id: 's-go', class: 'btn primary' }, 'Cifra e carica');
  setupGo.addEventListener('click', busy(setupGo, 'Cifratura…', async () => {
    setupErr.hidden = true;
    if (!file.files?.length) return showError(setupErr, 'Scegli il file del manuale.');
    const verdict = checkPassword(pass.value);
    if (!verdict.ok) return showError(setupErr, verdict.msg);
    if (pass.value !== pass2.value) return showError(setupErr, 'Le due password non coincidono.');
    if (!owner.value.trim() || !repo.value.trim() || !token.value.trim()) return showError(setupErr, 'Compila utente, repository e chiave di accesso.');
    try {
      const seed = JSON.parse(await file.files[0].text());
      await firstSetup({ seed, password: pass.value, owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() });
      onReady();
    } catch (err) {
      showError(setupErr, err instanceof SyntaxError ? 'Il file scelto non è un manuale valido.' : explain(err));
    }
  }));

  put(view, el('div', { class: 'gate' },
    el('h1', {}, 'Manuale'),
    el('p', { class: 'sub' }, 'Contenuti privati: restano cifrati con la tua password, che non viene mai inviata a nessuno.'),
    el('section', { class: 'card' },
      el('h2', {}, 'Collega questo dispositivo'),
      el('p', { class: 'note' }, 'Su un dispositivo già configurato apri Impostazioni, crea il link e incollalo qui.'),
      secretForm(
        field('Link di collegamento', linkField),
        field('Password', linkPass),
        linkErr,
        linkGo)),
    el('section', { class: 'card' },
      el('h2', {}, 'Prima configurazione'),
      el('p', { class: 'note' }, 'Da fare una sola volta, dal PC. Il file resta sul PC: online arriva solo il risultato cifrato.'),
      secretForm(
        field('File del manuale', file),
        field('Scegli una password', pass, 'Almeno 12 caratteri. Se la dimentichi nessuno può recuperarla.'),
        field('Ripeti la password', pass2),
        field('Utente GitHub', owner),
        field('Repository privato', repo),
        field('Chiave di accesso', token, 'Limitata a quel solo repository, con permesso Contents in scrittura.'),
        setupErr,
        setupGo))));
}

export function renderUnlock(view, onReady) {
  clear(view);
  const pass = passwordInput('u-pass', 'current-password');
  const err = errorBox();
  const go = el('button', { type: 'submit', id: 'u-go', class: 'btn primary' }, 'Apri');
  const attempt = busy(go, 'Apertura…', async () => {
    err.hidden = true;
    try {
      await unlock(pass.value);
      onReady();
    } catch (e) {
      pass.value = '';
      showError(err, explain(e));
      pass.focus();
    }
  });
  go.addEventListener('click', event => { event.preventDefault(); attempt(); });
  pass.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); attempt(); } });
  const reset = armButton(el('button', { type: 'button', class: 'btn danger' }, 'Scollega questo dispositivo'), 'Conferma: le modifiche non inviate si perdono', () => forgetDevice());
  put(view, el('div', { class: 'gate' },
    el('h1', {}, 'Manuale'),
    el('p', { class: 'sub' }, 'Inserisci la password per aprire i contenuti.'),
    el('section', { class: 'card' }, secretForm(field('Password', pass), err, go)),
    reset));
  pass.focus();
}
