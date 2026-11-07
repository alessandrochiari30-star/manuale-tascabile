// Movimento: breve, mai d'intralcio, spento se il telefono chiede di ridurre le animazioni.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

export function reducedMotion() { return reduced.matches; }

const quiet = promise => promise?.catch?.(() => {});

export function transition(update, direction = 'forward') {
  document.documentElement.dataset.dir = direction;
  if (reducedMotion() || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  const vt = document.startViewTransition(update);
  // Una transizione interrotta da un tocco veloce non è un errore.
  quiet(vt.ready);
  quiet(vt.finished);
  vt.updateCallbackDone?.catch(err => { console.error(err); });
}

export function stagger(elements, stepMs = 35) {
  elements.forEach((element, i) => {
    element.style.setProperty('--i', String(i));
    element.style.setProperty('--step', stepMs + 'ms');
    element.classList.add('enter');
  });
}
