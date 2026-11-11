/* Minimal SVG chart helpers for the labs: line charts with min/max envelope
 * downsampling (so one-tick jumps survive) and grouped bar charts. */
(function (root) {
  'use strict';
  const QF = root.QF;

  const THEMES = {
    light: { text: '#4f6a96', ink: '#19356f', grid: '#dbe6f5', axis: '#a9bddb', zero: '#8ea5c9', halo: '#ffffff' },
    dark: { text: '#cfe0ff', ink: '#ffffff', grid: '#ffffff26', axis: '#ffffff55', zero: '#ffffff80', halo: '#1f4fb4' },
  };
  const COLORS = { blue: '#2e5fc4', green: '#2fb36a', coral: '#e0644c', purple: '#7a5af5', amber: '#c98a12', slate: '#7d8fb0', mint: '#82e19c' };
  const EDGE_PX = 18; // x-tick labels this close to the right edge are right-aligned so they are not clipped

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, digits = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

  function niceTicks(lo, hi, count = 4) {
    const span = hi - lo || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  function extent(series, from, to) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      const a = s.from ?? from;
      const b = Math.min(s.to ?? to, s.ys.length);
      for (let i = a; i < b; i++) {
        const v = s.ys[i];
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!Number.isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }

  /** Polyline points for ys[from..to) with a min/max envelope per pixel column. */
  function pathPoints(ys, from, to, sx, sy, plotWidth) {
    const n = to - from;
    if (n <= 0) return '';
    const pts = [];
    if (n <= plotWidth * 2) {
      for (let i = from; i < to; i++) if (Number.isFinite(ys[i])) pts.push(`${sx(i).toFixed(1)},${sy(ys[i]).toFixed(1)}`);
      return pts.join(' ');
    }
    const per = n / plotWidth;
    for (let c = 0; c < plotWidth; c++) {
      const a = from + Math.floor(c * per);
      const b = Math.min(to, from + Math.floor((c + 1) * per));
      let lo = Infinity;
      let hi = -Infinity;
      let loAt = a;
      let hiAt = a;
      for (let i = a; i < b; i++) {
        if (ys[i] < lo) { lo = ys[i]; loAt = i; }
        if (ys[i] > hi) { hi = ys[i]; hiAt = i; }
      }
      if (!Number.isFinite(lo)) continue;
      const first = loAt <= hiAt ? [loAt, lo] : [hiAt, hi];
      const second = loAt <= hiAt ? [hiAt, hi] : [loAt, lo];
      pts.push(`${sx(first[0]).toFixed(1)},${sy(first[1]).toFixed(1)}`, `${sx(second[0]).toFixed(1)},${sy(second[1]).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  function markerShape(m, x, y) {
    const r = m.r || 4.5;
    const title = m.title ? `<title>${esc(m.title)}</title>` : '';
    if (m.shape === 'up') return `<path d="M${x},${y - r} L${+x + r},${+y + r} L${x - r},${+y + r}Z" fill="${m.color}">${title}</path>`;
    if (m.shape === 'down') return `<path d="M${x},${+y + r} L${+x + r},${y - r} L${x - r},${y - r}Z" fill="${m.color}">${title}</path>`;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.color}" stroke="${m.stroke || 'none'}">${title}</circle>`;
  }

  /**
   * Line chart. opts: { w, h, n (x extent in samples), series:[{ys, color, width, dash, from, to}],
   * y:[lo,hi], hlines:[{y,color,dash,label}], vlines:[{x,color,label,row}], bands:[{y0,y1,color}],
   * markers:[{x,y,color,shape,title}], xTicks:[{x,label}], yFormat, theme, cursor, yLabel }
   */
  let clipSeq = 0;

  function lines(opts) {
    const t = THEMES[opts.theme || 'light'];
    const halo = `stroke="${t.halo}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round"`;
    const w = opts.w || 900;
    const h = opts.h || 220;
    const pad = { l: 56, r: 14, t: 12, b: 24, ...(opts.pad || {}) };
    const n = opts.n;
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const [y0, y1] = opts.y || extent(opts.series, 0, n);
    const sx = (i) => pad.l + (n > 1 ? (i / (n - 1)) * pw : 0);
    const sy = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * ph;
    const yFormat = opts.yFormat || ((v) => fmt(v, Math.abs(y1 - y0) < 5 ? 2 : 0));
    const parts = [];
    const labels = [];
    for (const v of niceTicks(y0, y1, opts.yTickCount || 4)) {
      parts.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${t.grid}"/>`);
      parts.push(`<text x="${pad.l - 7}" y="${sy(v) + 4}" text-anchor="end" fill="${t.text}" font-size="11">${esc(yFormat(v))}</text>`);
    }
    for (const b of opts.bands || []) {
      const top = sy(Math.max(b.y0, b.y1));
      parts.push(`<rect x="${pad.l}" y="${top}" width="${pw}" height="${Math.abs(sy(b.y0) - sy(b.y1))}" fill="${b.color}"/>`);
    }
    for (const line of opts.hlines || []) {
      if (line.y < y0 || line.y > y1) continue;
      parts.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(line.y)}" y2="${sy(line.y)}" stroke="${line.color || t.zero}" stroke-dasharray="${line.dash || ''}" stroke-width="${line.width || 1.2}"/>`);
      if (line.label) labels.push(`<text x="${w - pad.r - 4}" y="${sy(line.y) - 5}" text-anchor="end" fill="${line.color || t.text}" font-size="11" font-weight="600" ${halo}>${esc(line.label)}</text>`);
    }
    for (const tick of opts.xTicks || []) {
      const x = sx(tick.x);
      const anchor = x > w - pad.r - EDGE_PX ? 'end' : 'middle';
      parts.push(`<text x="${anchor === 'end' ? w - 2 : x}" y="${h - 6}" text-anchor="${anchor}" fill="${t.text}" font-size="11">${esc(tick.label)}</text>`);
    }
    for (const v of opts.vlines || []) {
      parts.push(`<line x1="${sx(v.x)}" x2="${sx(v.x)}" y1="${pad.t}" y2="${pad.t + ph}" stroke="${v.color || t.axis}" stroke-dasharray="${v.dash || '3 3'}"/>`);
      const flip = sx(v.x) > pad.l + 0.7 * (w - pad.l - pad.r);
      if (v.label) labels.push(`<text x="${sx(v.x) + (flip ? -4 : 4)}" y="${pad.t + 11 + (v.row || 0) * 14}" text-anchor="${flip ? 'end' : 'start'}" fill="${v.color || t.text}" font-size="11" font-weight="600" ${halo}>${esc(v.label)}</text>`);
    }
    const clipId = `qf-plot-${++clipSeq}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${pad.l}" y="${pad.t - 2}" width="${pw}" height="${ph + 4}"/></clipPath>`);
    for (const s of opts.series) {
      const pts = pathPoints(s.ys, s.from ?? 0, Math.min(s.to ?? n, s.ys.length), sx, sy, Math.round(pw));
      if (pts) parts.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.8}" stroke-dasharray="${s.dash || ''}" stroke-linejoin="round" opacity="${s.opacity ?? 1}" clip-path="url(#${clipId})"/>`);
    }
    for (const m of opts.markers || []) {
      if (m.y < y0 || m.y > y1) continue;
      parts.push(markerShape(m, sx(m.x).toFixed(1), sy(m.y).toFixed(1)));
    }
    if (opts.cursor != null) {
      parts.push(`<line x1="${sx(opts.cursor)}" x2="${sx(opts.cursor)}" y1="${pad.t}" y2="${pad.t + ph}" stroke="${t.ink}" stroke-opacity=".35"/>`);
    }
    parts.push(`<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ph}" stroke="${t.axis}"/>`);
    if (opts.yLabel) labels.push(`<text x="${pad.l + 6}" y="${pad.t + 12}" fill="${t.ink}" font-size="11.5" font-weight="700" ${halo}>${esc(opts.yLabel)}</text>`);
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.label || opts.yLabel || 'chart')}">${parts.join('')}${labels.join('')}</svg>`;
  }

  /**
   * Grouped bar chart. opts: { w, h, categories:[label], groups:[{label,color,values}],
   * errors:[{lo,hi}] (single group only), y:[lo,hi], hlines, valueFormat, theme, subLabels }
   */
  function bars(opts) {
    const t = THEMES[opts.theme || 'light'];
    const w = opts.w || 900;
    const h = opts.h || 240;
    const pad = { l: 56, r: 12, t: 16, b: opts.subLabels ? 40 : 26, ...(opts.pad || {}) };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const all = opts.groups.flatMap((g) => g.values).concat((opts.errors || []).flatMap((e) => [e.lo, e.hi]), 0);
    const [y0, y1] = opts.y || [Math.min(...all) * 1.12, Math.max(...all) * 1.12];
    const sy = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * ph;
    const slot = pw / opts.categories.length;
    const barW = (slot * 0.72) / opts.groups.length;
    const valueFormat = opts.valueFormat || ((v) => fmt(v, 1));
    const parts = [];
    for (const v of niceTicks(y0, y1, 4)) {
      parts.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${t.grid}"/>`);
      parts.push(`<text x="${pad.l - 7}" y="${sy(v) + 4}" text-anchor="end" fill="${t.text}" font-size="11">${esc(fmt(v, Math.abs(y1 - y0) < 5 ? 2 : 0))}</text>`);
    }
    parts.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="${t.zero}"/>`);
    for (const line of opts.hlines || []) {
      parts.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(line.y)}" y2="${sy(line.y)}" stroke="${line.color}" stroke-dasharray="${line.dash || '4 3'}"/>`);
      if (line.label) parts.push(`<text x="${w - pad.r - 4}" y="${sy(line.y) - 5}" text-anchor="end" fill="${line.color}" font-size="11" font-weight="600">${esc(line.label)}</text>`);
    }
    opts.categories.forEach((label, c) => {
      const x0 = pad.l + c * slot + slot * 0.14;
      const e = opts.errors && opts.errors[c];
      opts.groups.forEach((g, k) => {
        const v = g.values[c];
        const x = x0 + k * barW;
        const top = sy(Math.max(v, 0));
        const height = Math.max(Math.abs(sy(v) - sy(0)), 0.5);
        parts.push(`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${g.color}"><title>${esc(`${g.label} · ${label}: ${valueFormat(v)}`)}</title></rect>`);
        // Value labels sit beyond the bar end, or beyond the whisker when one is drawn.
        const above = e ? Math.min(top, sy(e.hi)) : top;
        const below = e ? Math.max(top + height, sy(e.lo)) : top + height;
        if (opts.showValues) parts.push(`<text x="${x + barW / 2 - 1}" y="${v >= 0 ? above - 4 : below + 12}" text-anchor="middle" fill="${t.ink}" font-size="10.5" font-weight="600">${esc(valueFormat(v))}</text>`);
      });
      if (e) {
        const cx = x0 + barW / 2 - 1;
        parts.push(`<line x1="${cx}" x2="${cx}" y1="${sy(e.lo)}" y2="${sy(e.hi)}" stroke="${t.ink}" stroke-width="1.5"/>`);
      }
      parts.push(`<text x="${pad.l + c * slot + slot / 2}" y="${h - (opts.subLabels ? 22 : 7)}" text-anchor="middle" fill="${t.ink}" font-size="11">${esc(label)}</text>`);
      if (opts.subLabels) parts.push(`<text x="${pad.l + c * slot + slot / 2}" y="${h - 7}" text-anchor="middle" fill="${t.text}" font-size="10.5">${esc(opts.subLabels[c])}</text>`);
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.label || 'bar chart')}">${parts.join('')}</svg>`;
  }

  /** Tick-axis labels for a day of `n` samples, each `every` ticks apart. */
  const dayTicks = (n, every = 1) => [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: Math.round(f * (n - 1)), label: fmt(Math.round(f * n * every)) }));

  QF.chart = { lines, bars, dayTicks, niceTicks, COLORS, esc, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
