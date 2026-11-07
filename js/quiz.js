// Ripasso: domande del manuale più una domanda per ogni procedura.
import { childrenOf } from './doc.js';

function fromNode(node) {
  if (node.ty === 'qa') return { id: node.id, q: node.t, r: node.r };
  const lower = node.t.charAt(0).toLowerCase() + node.t.slice(1);
  const steps = (node.steps ?? []).map((step, i) => `${i + 1} ${step.t}`).join(' · ');
  const warning = node.warn?.length ? ` — ${node.warn[0]}` : '';
  return { id: node.id, q: `Come si fa: ${lower}? Elenca i passi.`, r: steps + warning };
}

export function questionsOf(doc, tree, ambitoId) {
  const out = [];
  const stack = [...(ambitoId ? childrenOf(tree, ambitoId) : childrenOf(tree, null))].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (node.ty === 'qa' || node.ty === 'proc') out.push(fromNode(node));
    stack.push(...[...childrenOf(tree, node.id)].reverse());
  }
  return out;
}

export function pickNext(list, statusOf, filter, currentId, rng = Math.random) {
  let pool;
  if (filter === 'rip') pool = list.filter(q => statusOf(q.id) === 'rip');
  else if (filter === 'nuove') pool = list.filter(q => !statusOf(q.id));
  else {
    const open = list.filter(q => statusOf(q.id) !== 'ok');
    pool = open.length ? open : list;
  }
  if (!pool.length) return null;
  const others = pool.filter(q => q.id !== currentId);
  const choices = others.length ? others : pool;
  return choices[Math.floor(rng() * choices.length)];
}

export function quizCounts(list, statusOf) {
  const counts = { ok: 0, rip: 0, nuove: 0 };
  for (const q of list) {
    const status = statusOf(q.id);
    if (status === 'ok') counts.ok++;
    else if (status === 'rip') counts.rip++;
    else counts.nuove++;
  }
  return counts;
}
