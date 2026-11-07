// Calcolatore guidato dai dati: campi, formule e listini arrivano dal documento cifrato.

const round = (value, digits = 6) => Number(value.toFixed(digits));

export function percentOf(price, values) {
  return round((price.sconti ?? []).reduce((sum, key) => sum + (values[key] || 0), 0));
}

function appliesTo(rule, row) {
  if (!rule.se) return true;
  return Object.entries(rule.se).every(([key, wanted]) => row[key] === wanted);
}

function priceOf(price, row, values) {
  const base = row.col?.[price.da];
  if (typeof base !== 'number') return null;
  const discounted = base * (1 - percentOf(price, values) / 100);
  const total = (price.meno ?? []).reduce(
    (sum, rule) => (appliesTo(rule, row) ? sum - (values[rule.campo] || 0) : sum),
    discounted,
  );
  return round(total);
}

export function compute(mode, row, values) {
  const prezzi = {};
  for (const price of mode.prezzi) {
    const value = priceOf(price, row, values);
    if (value === null) return null;
    prezzi[price.id] = value;
  }
  const main = mode.prezzi.find(p => p.id === mode.principale) ?? mode.prezzi[mode.prezzi.length - 1];
  const listino = row.col[main.da];
  const principale = prezzi[main.id];
  return { prezzi, listino, principale, scontoPct: round((1 - principale / listino) * 100, 4) };
}

// Dettaglio del prezzo: per ogni base (listino, nominativo…) le voci diverse da zero
// nell'ordine in cui si applicano, con il subtotale di ogni prezzo subito dopo le sue voci.
export function breakdown(mode, row, values) {
  const out = compute(mode, row, values);
  if (!out) return null;
  const blocks = [];
  let block = null;
  for (const price of mode.prezzi) {
    if (!block || block.da !== price.da) {
      const label = mode.mostra?.find(m => m.col === price.da)?.t ?? 'Listino';
      block = { da: price.da, seen: new Set(), base: { label, value: row.col[price.da] }, lines: [], subtotals: [], items: [] };
      blocks.push(block);
    }
    const addLine = line => {
      block.lines.push(line);
      block.items.push({ kind: 'line', ...line });
    };
    for (const key of price.sconti ?? []) {
      if (block.seen.has(key)) continue;
      block.seen.add(key);
      const pct = values[key] || 0;
      if (!pct) continue;
      addLine({ label: mode.campi.find(c => c.k === key)?.t ?? key, pct, eur: round(-block.base.value * pct / 100) });
    }
    for (const rule of price.meno ?? []) {
      const seenKey = 'meno:' + rule.campo;
      if (block.seen.has(seenKey) || !appliesTo(rule, row)) continue;
      block.seen.add(seenKey);
      const amount = values[rule.campo] || 0;
      if (!amount) continue;
      addLine({ label: mode.campi.find(c => c.k === rule.campo)?.t ?? rule.campo, pct: null, eur: -amount });
    }
    const subtotal = { label: price.t, pct: percentOf(price, values), value: out.prezzi[price.id] };
    block.subtotals.push(subtotal);
    block.items.push({ kind: 'subtotal', ...subtotal });
  }
  return {
    blocks: blocks.map(({ da, seen, ...rest }) => rest),
    netto: out.principale,
    scontoPct: out.scontoPct,
  };
}

export function bandValue(bands, pieces) {
  for (const [from, value] of bands) if (pieces >= from) return value;
  return 0;
}

export function formatEuro(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
}

export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return String(Math.round(value * 100) / 100).replace('.', ',') + '%';
}

const formatNumber = value => String(value).replace('.', ',');

export function conditionsText(mode, values, label = '') {
  const parts = mode.campi
    .filter(field => values[field.k])
    .map(field => field.t + ' ' + formatNumber(values[field.k]) + (field.u === '€' ? ' €' : '%'));
  return (label ? label + ': ' : '') + parts.join(' + ');
}

export function proposalLine({ codice, descr, listino, netto, cond }) {
  return { codice, descr, listino, netto, cond, q: 1, f: null };
}

export function proposalTotals(items) {
  const totals = { pezzi: 0, netto: 0, listino: 0, scontoPct: 0, margine: 0, haMargine: false };
  for (const item of items) {
    totals.pezzi += item.q;
    totals.netto += item.netto * item.q;
    totals.listino += item.listino * item.q;
    if (item.f !== null && item.f !== undefined) {
      totals.haMargine = true;
      totals.margine += (item.f - item.netto) * item.q;
    }
  }
  if (totals.listino) totals.scontoPct = round((1 - totals.netto / totals.listino) * 100, 4);
  return totals;
}

export function proposalText(items, { intestazione = '', chiusura = '' } = {}) {
  const totals = proposalTotals(items);
  const lines = [intestazione, ''];
  items.forEach((item, i) => {
    const sconto = item.listino ? formatPct((1 - item.netto / item.listino) * 100) : '—';
    const finale = item.f !== null && item.f !== undefined
      ? ` · prezzo finale ${formatEuro(item.f)}, margine ${formatEuro(item.f - item.netto)} a pezzo`
      : '';
    lines.push(`${i + 1}) ${item.codice} · ${item.descr} · ${item.q} pz × ${formatEuro(item.netto)} = ${formatEuro(item.netto * item.q)} (listino ${formatEuro(item.listino)}, sconto ${sconto})${finale}`);
    lines.push(`   Condizioni: ${item.cond}`);
  });
  const margine = totals.haMargine ? ` · margine ${formatEuro(totals.margine)}` : '';
  lines.push('', `Totale: ${totals.pezzi} pezzi · ${formatEuro(totals.netto)} netti · listino ${formatEuro(totals.listino)} · sconto medio ${formatPct(totals.scontoPct)}${margine}`);
  if (chiusura) lines.push(chiusura);
  return lines.join('\n');
}
