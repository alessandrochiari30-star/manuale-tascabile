// Icone a linea, disegnate a mano e neutre: nessun riferimento ai contenuti.
const NS = 'http://www.w3.org/2000/svg';

const SHAPES = {
  home: [['path', { d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M20 20l-3.5-3.5' }]],
  cards: [['rect', { x: 4, y: 5, width: 13, height: 15, rx: 2 }], ['path', { d: 'M8 2h11a1 1 0 0 1 1 1v14' }]],
  calc: [['rect', { x: 5, y: 3, width: 14, height: 18, rx: 2 }], ['path', { d: 'M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2' }]],
  gear: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1' }]],
  back: [['path', { d: 'M15 6l-6 6 6 6' }]],
  go: [['path', { d: 'M9 6l6 6-6 6' }]],
  chevron: [['path', { d: 'M6 9l6 6 6-6' }]],
  pencil: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  alert: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 8v5M12 16.5v.5' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 7.5V12l3 2' }]],
  amb0: [['path', { d: 'M4 7h16M4 12h10M4 17h7' }], ['path', { d: 'M16 16l2 2 4-4' }]],
  amb1: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5' }], ['path', { d: 'M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.6.6 2.6 2.2 3 5' }]],
  amb2: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['circle', { cx: 12, cy: 12, r: 3.5 }]],
  amb3: [['path', { d: 'M4 19V10M10 19V5M16 19v-7M22 19H2' }]],
  amb4: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }], ['path', { d: 'M3 9h18M8 14h4' }]],
  amb5: [['path', { d: 'M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z' }]],
  amb6: [['path', { d: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z' }], ['path', { d: 'M4 21V5M9 8h6' }]],
};

export function icon(name, size = 20) {
  const svg = document.createElementNS(NS, 'svg');
  for (const [key, value] of Object.entries({
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(key, String(value));
  for (const [tag, attrs] of SHAPES[name] ?? SHAPES.go) {
    const part = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, String(value));
    svg.append(part);
  }
  return svg;
}
