// Trasforma ogni voce del documento nel testo su cui lavora la ricerca.
import { buildTree } from './doc.js';
import { plainText } from './inline.js';

const BOOST = { sec: 1.4, link: 1.5, proc: 1.2, num: 1.1 };

export function entryText(node) {
  switch (node.ty) {
    case 'sec':
    case 'link':
      return [node.t, node.sub].filter(Boolean).join(' ');
    case 'num':
      return `${node.t} ${node.val ?? ''}`;
    case 'qa':
      return `${node.t} ${plainText(node.r)}`;
    case 'tab':
      return [node.t, ...(node.cols ?? []), ...(node.rows ?? []).flat()].join(' ');
    case 'proc':
      return [
        node.t, node.q, node.tools, node.verify,
        ...(node.steps ?? []).flatMap(step => [step.t, step.d]),
        ...(node.warn ?? []),
      ].filter(Boolean).map(plainText).join(' ');
    default:
      return plainText(node.t);
  }
}

export function searchEntries(doc) {
  const tree = buildTree(doc);
  const out = [];
  for (const node of Object.values(doc.nodes)) {
    if (node.ty === 'amb' || !tree.visible.has(node.id)) continue;
    const boost = node.k === 'key' ? 1.25 : (BOOST[node.ty] ?? 1);
    out.push({ id: node.id, title: plainText(node.t), text: entryText(node), boost });
  }
  return out;
}
