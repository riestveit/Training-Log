/* Basecamp training log — zero-dependency app.
   Data: data/training.json (array of day records). Local edits live in localStorage
   until you push them to GitHub from the Data tab. */
'use strict';

// ───────────────────────── config ─────────────────────────
const SPORTS = [
  { key: 'run',    label: 'Running',   color: '#3987e5', dist: true },
  { key: 'bike',   label: 'Biking',    color: '#d95926', dist: true },
  { key: 'nordic', label: 'Nordic',    color: '#199e70', dist: true },
  { key: 'bc',     label: 'BC Skiing', color: '#c98500', dist: true },
  { key: 'other',  label: 'Other',     color: '#d55181', dist: true },
];
const SP = Object.fromEntries(SPORTS.map(s => [s.key, s]));
const FT_PER_FLAT_MI = 528;
const LS = { data: 'basecamp.data.v1', dirty: 'basecamp.dirty', gh: 'basecamp.gh' };
const FIELDS = ['sleep','run_min','run_mi','run_vert','bike_min','bike_mi','bike_vert','nordic_min','nordic_mi','nordic_vert','bc_min','bc_mi','bc_vert','other_min','other_mi','other_vert','sessions','workout','tl','rpf'];
const C = { seq: ['#232b36','#184f95','#256abf','#3987e5','#6da7ec','#9ec5f4'], sleep: '#9085e9', good: '#0ca30c', warn: '#c98500', crit: '#e66767', muted: '#8d8c84', text: '#f0efec' };

const state = {
  days: [],                    // sorted day records
  range: 'all',
  sports: new Set(SPORTS.map(s => s.key)),
  loadSrc: 'min',
  rollMetric: 'hours',
  tab: 'dash',
  calMonth: null,
  gh: Object.assign({ owner: '', repo: '', branch: 'main', path: 'data/training.json', token: '' }, readLS(LS.gh) || {}),
};

// ───────────────────────── utils ─────────────────────────
function readLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function delLS(k) { try { localStorage.removeItem(k); } catch {} }
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = s => new Date(s + 'T12:00:00');
const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const fmtD = d => `${MON[d.getMonth()]} ${d.getDate()}`;
const fmtDL = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const n0 = v => Math.round(v).toLocaleString();
const n1 = v => (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = v => v.toFixed(2);
const pace = mpm => { const t = Math.round(mpm * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => a.length ? sum(a) / a.length : 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const t = new Date(); t.setHours(12, 0, 0, 0); return t; };
const todayIso = () => iso(today());
const g = (r, k) => (r && +r[k]) || 0;
// ratio shown both ways, e.g. "1.24:1 · 1:0.81"
const ratio2 = v => (!isFinite(v) || v <= 0) ? '—' : `${n2(v)}:1 · 1:${n2(1 / v)}`;

function sportMin(r, key) { return g(r, key + '_min'); }
function dayMin(r, sports = state.sports) { let s = 0; for (const k of sports) s += sportMin(r, k); return s; }
function dayMi(r, sports = state.sports) { let s = 0; for (const k of sports) if (SP[k].dist) s += g(r, k + '_mi'); return s; }
function dayVert(r, sports = state.sports) { let s = 0; for (const k of sports) if (SP[k].dist) s += g(r, k + '_vert'); return s; }
function flatConv(r) { return g(r, 'run_mi') + g(r, 'run_vert') / FT_PER_FLAT_MI; }
function isActive(r) { return dayMin(r, SPORTS.map(s => s.key)) > 0; }

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200); }

// ───────────────────────── data layer ─────────────────────────
function normalize(arr) {
  const map = new Map();
  for (const r of arr) {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const o = { date: r.date };
    for (const f of FIELDS) { const v = +r[f]; if (v) o[f] = v; }
    if (r.notes) o.notes = String(r.notes);
    map.set(r.date, o);
  }
  return [...map.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}
const byDate = () => new Map(state.days.map(r => [r.date, r]));

function persist() { writeLS(LS.data, state.days); writeLS(LS.dirty, true); $('#dirtyFlag').hidden = false; }

async function loadData() {
  const local = readLS(LS.data);
  if (local && local.length) { state.days = normalize(local); $('#dirtyFlag').hidden = !readLS(LS.dirty); return 'local'; }
  try {
    const res = await fetch('data/training.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    state.days = normalize(await res.json());
    return 'repo';
  } catch (e) {
    if (window.SEED_DATA) { state.days = normalize(window.SEED_DATA); return 'seed'; }
    state.days = []; return 'empty';
  }
}

function upsertDay(rec) {
  const i = state.days.findIndex(r => r.date === rec.date);
  const empty = FIELDS.every(f => !rec[f]) && !rec.notes;
  if (empty) { if (i >= 0) state.days.splice(i, 1); }
  else if (i >= 0) state.days[i] = rec; else state.days.push(rec);
  state.days = normalize(state.days);
  persist();
}

// continuous day series for the selected range (fills gaps with empty days)
function rangeBounds() {
  if (!state.days.length) return [today(), today()];
  const first = D(state.days[0].date);
  const last = new Date(Math.max(D(state.days[state.days.length - 1].date), today()));
  let start = first;
  if (state.range === 'ytd') start = new Date(last.getFullYear(), 0, 1, 12);
  else if (state.range !== 'all') start = addDays(last, -(+state.range) + 1);
  if (start < first) start = first;
  return [start, last];
}
function series(start, end) {
  const m = byDate(); const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) { const k = iso(d); out.push(m.get(k) || { date: k, _empty: true }); }
  return out;
}
function weeks(days) {
  const w = new Map();
  for (const r of days) {
    const k = iso(monday(D(r.date)));
    if (!w.has(k)) w.set(k, { start: D(k), days: [] });
    w.get(k).days.push(r);
  }
  return [...w.values()];
}

// ───────────────────────── tooltip ─────────────────────────
const tip = {
  el: null,
  show(e, html) {
    const t = this.el; t.innerHTML = html; t.classList.add('on');
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  },
  hide() { this.el.classList.remove('on'); },
};
const tipRow = (label, val, color, kind) => `<div class="r"><span>${color ? `<i style="background:${color}${kind === 'line' ? ';height:2px;width:10px' : ''}"></i>` : ''}${esc(label)}</span><b style="margin:0">${val}</b></div>`;

// ───────────────────────── svg chart kit ─────────────────────────
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e); return e;
}
function frame(host, o = {}) {
  host.innerHTML = '';
  const h = o.h || +host.dataset.h || 240;
  const w = Math.max(280, host.clientWidth || 600);
  const m = Object.assign({ l: 44, r: 14, t: 14, b: 28 }, o.m || {});
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img' }, host);
  return { svg, w, h, m, iw: w - m.l - m.r, ih: h - m.t - m.b };
}
function emptyMsg(F, msg = 'No data in this range') { el('text', { x: F.w / 2, y: F.h / 2, 'text-anchor': 'middle', class: 'empty' }, F.svg).textContent = msg; }
function niceTicks(min, max, count = 5) {
  if (max === min) { max = min + 1; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag, step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}
const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0);
function yAxis(F, y, ticks, fmt = n0) {
  const gEl = el('g', { class: 'grid' }, F.svg);
  for (const t of ticks) {
    const yy = y(t);
    el('line', { x1: F.m.l, x2: F.w - F.m.r, y1: yy, y2: yy, class: t === 0 ? 'zero' : '' }, gEl);
    el('text', { x: F.m.l - 8, y: yy + 3.5, 'text-anchor': 'end' }, gEl).textContent = fmt(t);
  }
}
function xLabels(F, xs, labels, maxLabels) {
  const gEl = el('g', {}, F.svg);
  const every = Math.max(1, Math.ceil(labels.length / (maxLabels || Math.floor(F.iw / 62))));
  labels.forEach((l, i) => { if (i % every) return; el('text', { x: xs[i], y: F.h - F.m.b + 17, 'text-anchor': 'middle' }, gEl).textContent = l; });
}
function topRound(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function legendHTML(items) {
  return items.map(i => `<span><i class="${i.kind || ''}" style="${i.kind === 'dash' ? `border-color:${i.color}` : `background:${i.color}`}"></i>${esc(i.label)}</span>`).join('');
}

/* Stacked (or single) bars. opts: labels[], series[{label,color,vals[]}], fmt, tipTitle(i), top(i)->string, onClick(i), refs[{y,label,color}] */
function bars(host, o) {
  if (o.refs && o.refs.length) o = Object.assign({}, o, { m: Object.assign({ r: 58 }, o.m || {}) });
  const F = frame(host, o);
  const n = o.labels.length;
  if (!n) return emptyMsg(F);
  const totals = o.labels.map((_, i) => sum(o.series.map(s => Math.max(0, s.vals[i] || 0))));
  const negs = o.labels.map((_, i) => sum(o.series.map(s => Math.min(0, s.vals[i] || 0))));
  const refMax = Math.max(0, ...(o.refs || []).map(r => r.y));
  const nt = niceTicks(Math.min(0, ...negs), Math.max(...totals, refMax, o.minMax || 0) * (o.top ? 1.12 : 1) || 1, o.ticks || 4);
  const y = lin(nt.lo, nt.hi, F.m.t + F.ih, F.m.t);
  yAxis(F, y, nt.ticks, o.yfmt || o.fmt || n0);
  const band = F.iw / n, bw = Math.max(2, Math.min(band * (o.pad ?? 0.72), o.maxBar || 48));
  const xs = o.labels.map((_, i) => F.m.l + band * i + band / 2);
  const gBars = el('g', {}, F.svg);
  for (let i = 0; i < n; i++) {
    let base = y(0);
    const vis = o.series.map((s, si) => [si, s.vals[i] || 0]).filter(([, v]) => v !== 0);
    const lastPos = [...vis].reverse().find(([, v]) => v > 0);
    const x = xs[i] - bw / 2;
    vis.forEach(([si, v]) => {
      const s = o.series[si];
      if (v > 0) {
        const top = y(sumUpTo(o.series, i, si) + v);
        if (si === lastPos[0]) el('path', { d: topRound(x, top, bw, Math.max(0, base - top), Math.min(4, bw / 3)), fill: s.color }, gBars);
        else el('rect', { x, y: top + 2, width: bw, height: Math.max(0, base - top - 2), fill: s.color }, gBars); // 2px spacer above
        base = top;
      } else {
        el('rect', { x, y: y(0), width: bw, height: Math.max(0, y(v) - y(0)), fill: s.colorNeg || s.color, rx: 2 }, gBars);
      }
    });
    if (o.top) { const t = o.top(i); if (t) el('text', { x: xs[i], y: y(totals[i]) - 5, 'text-anchor': 'middle', class: 'lbl' }, gBars).textContent = t; }
  }
  for (const r of (o.refs || [])) {
    el('line', { x1: F.m.l, x2: F.w - F.m.r, y1: y(r.y), y2: y(r.y), stroke: r.color || C.muted, 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }, F.svg);
    el('text', { x: F.w - F.m.r + 6, y: y(r.y) + 4, class: 'lbl' }, F.svg).textContent = r.label;
  }
  xLabels(F, xs, o.labels, o.maxLabels);
  const hit = el('g', {}, F.svg);
  for (let i = 0; i < n; i++) {
    const r = el('rect', { x: F.m.l + band * i, y: F.m.t, width: band, height: F.ih, class: 'col-hit' }, hit);
    r.addEventListener('mousemove', e => {
      let html = `<b>${esc(o.tipTitle ? o.tipTitle(i) : o.labels[i])}</b>`;
      const rows = o.series.filter(s => s.vals[i]);
      for (const s of [...rows].reverse()) html += tipRow(s.label, (o.fmt || n1)(s.vals[i]), s.color);
      if (o.series.length > 1) html += tipRow('Total', (o.fmt || n1)(totals[i] + negs[i]));
      if (o.tipExtra) html += o.tipExtra(i);
      tip.show(e, html);
    });
    r.addEventListener('mouseleave', () => tip.hide());
    if (o.onClick) { r.style.cursor = 'pointer'; r.addEventListener('click', () => o.onClick(i)); }
  }
}
function sumUpTo(series, i, si) { let s = 0; for (let k = 0; k < si; k++) s += Math.max(0, series[k].vals[i] || 0); return s; }

/* Lines with crosshair. opts: xs: Date[], series[{label,color,vals[],width,dash,area,dots}], band{lo,hi}, refs, fmt, yMin, yMax */
function lines(host, o) {
  if (o.refs && o.refs.length) o = Object.assign({}, o, { m: Object.assign({}, o.m || {}, { r: Math.max(58, (o.m && o.m.r) || 0) }) });
  const F = frame(host, o);
  const n = o.xs.length;
  if (!n) return emptyMsg(F);
  const all = o.series.flatMap(s => s.vals.filter(v => v != null && isFinite(v)));
  if (!all.length) return emptyMsg(F, o.emptyText);
  let lo = o.yMin ?? Math.min(0, ...all), hi = o.yMax ?? Math.max(...all, ...(o.refs || []).map(r => r.y));
  if (o.band) hi = Math.max(hi, o.band.hi);
  const nt = niceTicks(lo, hi, o.ticks || 4);
  const y = lin(nt.lo, nt.hi, F.m.t + F.ih, F.m.t);
  const x = i => F.m.l + (n === 1 ? F.iw / 2 : i / (n - 1) * F.iw);
  yAxis(F, y, nt.ticks, o.yfmt || o.fmt || n0);
  if (o.band) el('rect', { x: F.m.l, width: F.iw, y: y(o.band.hi), height: y(o.band.lo) - y(o.band.hi), fill: 'rgba(12,163,12,.08)' }, F.svg);
  for (const r of (o.refs || [])) {
    el('line', { x1: F.m.l, x2: F.w - F.m.r, y1: y(r.y), y2: y(r.y), stroke: r.color || C.muted, 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }, F.svg);
    if (r.label) el('text', { x: F.w - F.m.r + 6, y: y(r.y) + 4, class: 'lbl' }, F.svg).textContent = r.label;
  }
  for (const s of o.series) {
    let d = '', pen = false;
    s.vals.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; });
    if (s.area) {
      const idx = s.vals.map((v, i) => v != null ? i : -1).filter(i => i >= 0);
      if (idx.length) {
        const a = d + `L${x(idx[idx.length - 1])},${y(Math.max(0, nt.lo))}L${x(idx[0])},${y(Math.max(0, nt.lo))}Z`;
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        const defs = el('defs', {}, F.svg); const lg = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': .35 }, lg); el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, lg);
        el('path', { d: a, fill: `url(#${gid})` }, F.svg);
      }
    }
    if (!s.noLine) el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, F.svg);
    if (s.dots) s.vals.forEach((v, i) => { if (v != null) el('circle', { cx: x(i), cy: y(v), r: 4, fill: s.color, stroke: '#1a1a19', 'stroke-width': 2 }, F.svg); });
  }
  if (o.endLabels) for (const s of o.series) {
    let i = s.vals.length - 1; while (i >= 0 && s.vals[i] == null) i--;
    if (i >= 0) el('text', { x: x(i) + 6, y: y(s.vals[i]) + 4, class: 'lbl' }, F.svg).textContent = (o.fmt || n0)(s.vals[i]);
  }
  xLabels(F, o.xs.map((_, i) => x(i)), o.xs.map(o.xfmt || fmtD), o.maxLabels);
  // crosshair
  const cross = el('line', { y1: F.m.t, y2: F.m.t + F.ih, stroke: '#6b6a64', 'stroke-width': 1, opacity: 0 }, F.svg);
  const dots = o.series.map(s => el('circle', { r: 4.5, fill: s.color, stroke: '#1a1a19', 'stroke-width': 2, opacity: 0 }, F.svg));
  const ov = el('rect', { x: F.m.l, y: F.m.t, width: F.iw, height: F.ih, fill: 'transparent' }, F.svg);
  ov.addEventListener('mousemove', e => {
    const bb = F.svg.getBoundingClientRect();
    const px = (e.clientX - bb.left) * (F.w / bb.width);
    const i = Math.max(0, Math.min(n - 1, Math.round((px - F.m.l) / (F.iw / Math.max(1, n - 1)))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
    let html = `<b>${esc(o.tipTitle ? o.tipTitle(i) : fmtDL(o.xs[i]))}</b>`;
    o.series.forEach((s, si) => {
      const v = s.vals[i];
      if (v == null || !isFinite(v)) { dots[si].setAttribute('opacity', 0); return; }
      dots[si].setAttribute('cx', x(i)); dots[si].setAttribute('cy', y(v)); dots[si].setAttribute('opacity', 1);
      html += tipRow(s.label, (s.fmt || o.fmt || n1)(v), s.color, 'line');
    });
    if (o.tipExtra) html += o.tipExtra(i);
    tip.show(e, html);
  });
  ov.addEventListener('mouseleave', () => { tip.hide(); cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); });
  if (o.onClick) { ov.style.cursor = 'pointer'; ov.addEventListener('click', e => { const bb = F.svg.getBoundingClientRect(); const px = (e.clientX - bb.left) * (F.w / bb.width); o.onClick(Math.max(0, Math.min(n - 1, Math.round((px - F.m.l) / (F.iw / Math.max(1, n - 1)))))); }); }
}

/* Scatter. pts[{x,y,r,color,tip,date}] */
function scatter(host, o) {
  const F = frame(host, Object.assign({ m: { l: 48, r: 16, t: 14, b: 40 } }, o));
  if (!o.pts.length) return emptyMsg(F, o.emptyText);
  const xt = niceTicks(o.xMin ?? Math.min(...o.pts.map(p => p.x)), o.xMax ?? Math.max(...o.pts.map(p => p.x)), 5);
  const yt = niceTicks(o.yMin ?? Math.min(0, ...o.pts.map(p => p.y)), Math.max(...o.pts.map(p => p.y)), 4);
  const x = lin(xt.lo, xt.hi, F.m.l, F.m.l + F.iw), y = lin(yt.lo, yt.hi, F.m.t + F.ih, F.m.t);
  yAxis(F, y, yt.ticks, o.yfmt || n0);
  const gx = el('g', {}, F.svg);
  for (const t of xt.ticks) el('text', { x: x(t), y: F.h - F.m.b + 16, 'text-anchor': 'middle' }, gx).textContent = (o.xfmt || n0)(t);
  el('text', { x: F.m.l + F.iw / 2, y: F.h - 4, 'text-anchor': 'middle', class: 'lbl' }, F.svg).textContent = o.xLabel;
  el('text', { x: 12, y: F.m.t + F.ih / 2, 'text-anchor': 'middle', class: 'lbl', transform: `rotate(-90 12 ${F.m.t + F.ih / 2})` }, F.svg).textContent = o.yLabel;
  if (o.trend && o.pts.length > 2) {
    const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y), mx = mean(xs), my = mean(ys);
    const b = sum(xs.map((v, i) => (v - mx) * (ys[i] - my))) / (sum(xs.map(v => (v - mx) ** 2)) || 1), a = my - b * mx;
    el('line', { x1: x(xt.lo), x2: x(xt.hi), y1: y(a + b * xt.lo), y2: y(a + b * xt.hi), stroke: C.muted, 'stroke-dasharray': '5 5', 'stroke-width': 1.5 }, F.svg);
    const r = sum(xs.map((v, i) => (v - mx) * (ys[i] - my))) / Math.sqrt(sum(xs.map(v => (v - mx) ** 2)) * sum(ys.map(v => (v - my) ** 2)) || 1);
    el('text', { x: F.w - F.m.r, y: F.m.t + 10, 'text-anchor': 'end', class: 'lbl' }, F.svg).textContent = `trend r = ${r.toFixed(2)}`;
  }
  const gp = el('g', {}, F.svg);
  for (const p of [...o.pts].sort((a, b) => (b.r || 5) - (a.r || 5))) {
    const c = el('circle', { cx: x(p.x), cy: y(p.y), r: p.r || 5, fill: p.color, 'fill-opacity': .78, stroke: '#1a1a19', 'stroke-width': 2, style: 'cursor:pointer' }, gp);
    c.addEventListener('mousemove', e => { c.setAttribute('fill-opacity', 1); tip.show(e, p.tip); });
    c.addEventListener('mouseleave', () => { c.setAttribute('fill-opacity', .78); tip.hide(); });
    if (p.date) c.addEventListener('click', () => openEntry(p.date));
  }
}

/* Donut */
function donut(host, o) {
  const F = frame(host, { m: { l: 0, r: 0, t: 0, b: 0 } });
  const tot = sum(o.items.map(i => i.val));
  if (!tot) return emptyMsg(F);
  const cx = Math.min(F.w * 0.36, F.h / 2 + 10), cy = F.h / 2, R = Math.min(F.h / 2 - 8, cx - 8), r0 = R * 0.64;
  let a0 = -Math.PI / 2;
  const gap = o.items.filter(i => i.val).length > 1 ? 0.025 : 0;
  for (const it of o.items) {
    if (!it.val) continue;
    const a1 = a0 + it.val / tot * Math.PI * 2;
    const s = a0 + gap / 2, e = a1 - gap / 2, large = e - s > Math.PI ? 1 : 0;
    const p = `M${cx + R * Math.cos(s)},${cy + R * Math.sin(s)}A${R},${R} 0 ${large} 1 ${cx + R * Math.cos(e)},${cy + R * Math.sin(e)}L${cx + r0 * Math.cos(e)},${cy + r0 * Math.sin(e)}A${r0},${r0} 0 ${large} 0 ${cx + r0 * Math.cos(s)},${cy + r0 * Math.sin(s)}Z`;
    const path = el('path', { d: p, fill: it.color, style: 'cursor:default' }, F.svg);
    path.addEventListener('mousemove', ev => tip.show(ev, `<b>${esc(it.label)}</b>${tipRow('Hours', n1(it.val))}${tipRow('Share', Math.round(it.val / tot * 100) + '%')}`));
    path.addEventListener('mouseleave', () => tip.hide());
    a0 = a1;
  }
  el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', style: 'font-size:24px;font-weight:700;fill:#f0efec' }, F.svg).textContent = n0(tot);
  el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle' }, F.svg).textContent = o.centerSub || 'hours';
  // direct-labelled legend
  const lx = cx + R + 22; let ly = cy - (o.items.length * 34) / 2 + 14;
  for (const it of o.items) {
    el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 3, fill: it.color }, F.svg);
    el('text', { x: lx + 16, y: ly, style: 'fill:#c3c2b7;font-size:12px' }, F.svg).textContent = it.label;
    el('text', { x: lx + 16, y: ly + 15, class: 'lbl' }, F.svg).textContent = `${n1(it.val)} h · ${Math.round(it.val / tot * 100)}%`;
    ly += 34;
  }
}

/* Calendar heatmap */
function heatmap(host, days) {
  host.innerHTML = '';
  if (!days.length) { const F = frame(host, { h: 80 }); return emptyMsg(F); }
  const start = monday(D(days[0].date));
  const cols = Math.ceil(((D(days[days.length - 1].date) - start) / 864e5 + 1) / 7);
  const avail = Math.max(300, host.clientWidth || 800) - 40;
  const cell = Math.max(11, Math.min(30, Math.floor(avail / cols) - 3)), gap = 3;
  const w = 36 + cols * (cell + gap), h = 22 + 7 * (cell + gap) + 30;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` }, host);
  const vals = days.map(r => dayMin(r) / 60), max = Math.max(...vals, 0.5);
  const steps = C.seq;
  const color = v => v <= 0 ? '#242423' : steps[Math.min(steps.length - 1, 1 + Math.floor(v / max * (steps.length - 1) * 0.999))];
  DOW.forEach((d, i) => { if (i % 2 === 0) el('text', { x: 0, y: 22 + i * (cell + gap) + cell - 2 }, svg).textContent = d; });
  let lastMonth = -1;
  const td = todayIso();
  days.forEach((r, i) => {
    const d = D(r.date), col = Math.floor((d - start) / 864e5 / 7), row = (d.getDay() + 6) % 7;
    const x = 36 + col * (cell + gap), y = 22 + row * (cell + gap);
    if (d.getMonth() !== lastMonth && row === 0 || (i === 0)) { if (d.getMonth() !== lastMonth) { el('text', { x, y: 12 }, svg).textContent = MON[d.getMonth()]; lastMonth = d.getMonth(); } }
    const rect = el('rect', { x, y, width: cell, height: cell, rx: 3, fill: color(vals[i]), stroke: r.date === td ? '#f0efec' : 'none', 'stroke-width': 1.5, style: 'cursor:pointer' }, svg);
    rect.addEventListener('mousemove', e => tip.show(e, dayTip(r)));
    rect.addEventListener('mouseleave', () => tip.hide());
    rect.addEventListener('click', () => openEntry(r.date));
  });
  // scale legend
  const ly = h - 12; let lx = Math.max(70, w - 6 * 16 - 70);
  el('text', { x: lx - 6, y: ly + 9, 'text-anchor': 'end' }, svg).textContent = 'rest';
  ['#242423', ...steps.slice(1)].forEach((c, i) => el('rect', { x: lx + i * 16, y: ly, width: 12, height: 12, rx: 3, fill: c }, svg));
  el('text', { x: lx + 6 * 16 + 4, y: ly + 9 }, svg).textContent = `${n1(max)} h`;
}

function dayTip(r) {
  const d = D(r.date);
  let html = `<b>${fmtDL(d)}</b>`;
  for (const s of SPORTS) {
    const m = sportMin(r, s.key); if (!m) continue;
    let v = hm(m / 60);
    if (s.dist && g(r, s.key + '_mi')) v += ` · ${n1(g(r, s.key + '_mi'))} mi`;
    if (s.dist && g(r, s.key + '_vert')) v += ` · ${n0(g(r, s.key + '_vert'))} ft`;
    html += tipRow(s.label, v, s.color);
  }
  if (g(r, 'sleep')) html += tipRow('Sleep', hm(r.sleep), C.sleep);
  if (g(r, 'tl')) html += tipRow('TL', n0(r.tl));
  if (g(r, 'rpf')) html += tipRow('Feel', r.rpf + '/10');
  if (!isActive(r) && !r.notes) html += `<div class="n">rest day</div>`;
  if (r.notes) html += `<div class="n">${esc(r.notes)}</div>`;
  return html;
}

function sparkline(vals, color, w = 70, h = 26) {
  if (vals.length < 2) return '';
  const mx = Math.max(...vals, 1e-9), mn = Math.min(...vals, 0);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - (v - mn) / (mx - mn || 1) * h).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" height="${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// ───────────────────────── analytics ─────────────────────────
function loadOf(r) { return state.loadSrc === 'tl' ? g(r, 'tl') : dayMin(r); }
function pmc() {
  // full history so the EWMAs are warmed up, then cut to range
  if (!state.days.length) return [];
  const all = series(D(state.days[0].date), rangeBounds()[1]);
  let ctl = 0, atl = 0; const out = [];
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  const loads = all.map(loadOf);
  all.forEach((r, i) => {
    const L = loads[i];
    const tsb = ctl - atl;
    ctl += (L - ctl) * kC; atl += (L - atl) * kA;
    const a7 = sum(loads.slice(Math.max(0, i - 6), i + 1)) / 7;
    const c28 = sum(loads.slice(Math.max(0, i - 27), i + 1)) / 28;
    out.push({ r, L, ctl, atl, tsb, acwr: i >= 27 && c28 > 0 ? a7 / c28 : null });
  });
  const [s] = rangeBounds();
  return out.filter(p => D(p.r.date) >= s);
}

function streaks(days) {
  let cur = 0, best = 0, run = 0;
  for (const r of days) { if (isActive(r)) { run++; best = Math.max(best, run); } else run = 0; }
  // current streak counting back from last logged day (ignoring an unlogged today)
  const m = byDate(); let d = today();
  if (!m.get(iso(d)) || !isActive(m.get(iso(d)))) d = addDays(d, -1);
  while (m.get(iso(d)) && isActive(m.get(iso(d)))) { cur++; d = addDays(d, -1); }
  return { cur, best };
}

// ───────────────────────── views ─────────────────────────
function kpiHTML(k, v, unit, d, spark) {
  return `<div class="kpi"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div>${d ? `<div class="d">${d}</div>` : ''}${spark || ''}</div>`;
}
function delta(curr, prev, unit = '') {
  if (!prev) return `<span>—</span> vs prior`;
  const p = (curr - prev) / prev * 100;
  return `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> vs prior period`;
}

function ctx() {
  const [s, e] = rangeBounds();
  const days = series(s, e);
  const len = days.length;
  const prev = series(addDays(s, -len), addDays(s, -1)).filter(r => state.days.length && r.date >= state.days[0].date);
  return { s, e, days, prev, wk: weeks(days) };
}

function renderDash() {
  const { days, prev, wk } = ctx();
  const H = days.map(r => dayMin(r) / 60), hrs = sum(H);
  const mi = sum(days.map(r => dayMi(r))), vert = sum(days.map(r => dayVert(r)));
  const pH = sum(prev.map(r => dayMin(r) / 60)), pMi = sum(prev.map(r => dayMi(r))), pV = sum(prev.map(r => dayVert(r)));
  const active = days.filter(isActive).length;
  const slp = days.map(r => g(r, 'sleep')).filter(Boolean);
  const st = streaks(days);
  const wkH = wk.map(w => sum(w.days.map(r => dayMin(r) / 60)));
  const wkMi = wk.map(w => sum(w.days.map(r => dayMi(r))));
  const wkV = wk.map(w => sum(w.days.map(r => dayVert(r))));
  $('#kpis').innerHTML =
    kpiHTML('Training time', n1(hrs), 'h', delta(hrs, pH), sparkline(wkH, SP.run.color)) +
    kpiHTML('Avg / week', n1(hrs / (days.length / 7 || 1)), 'h', `over ${n1(days.length / 7)} weeks · ${n1(mi / (days.length / 7 || 1))} mi/wk`) +
    kpiHTML('Distance', n0(mi), 'mi', delta(mi, pMi), sparkline(wkMi, SP.bike.color)) +
    kpiHTML('Vert', n0(vert), 'ft', delta(vert, pV), sparkline(wkV, SP.nordic.color)) +
    kpiHTML('Active days', active, `/ ${days.length}`, `${Math.round(active / (days.length || 1) * 100)}% of days`) +
    kpiHTML('Streak', st.cur, 'days', `best in range: ${st.best}`) +
    kpiHTML('Avg sleep', slp.length ? hm(mean(slp)) : '—', '', `${slp.filter(v => v >= 8).length} of ${slp.length} nights ≥ 8h`);

  const sportList = SPORTS.filter(s => state.sports.has(s.key));
  bars($('#c-weekly'), {
    labels: wk.map(w => fmtD(w.start)),
    series: sportList.map(s => ({ label: s.label, color: s.color, vals: wk.map(w => sum(w.days.map(r => sportMin(r, s.key) / 60))) })),
    fmt: n1, yfmt: v => v + 'h',
    tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
    tipExtra: i => { const sl = wk[i].days.map(r => g(r, 'sleep')).filter(Boolean); return sl.length ? tipRow('Avg sleep', hm(mean(sl)), C.sleep) : ''; },
    top: i => wkH[i] >= 0.05 && wk.length <= 30 ? n1(wkH[i]) : '',
    onClick: i => { state.calMonth = new Date(wk[i].start); switchTab('calendar'); },
  });

  renderRolling();
  heatmap($('#c-heat'), days);

  const mix = sportList.map(s => ({ label: s.label, color: s.color, val: sum(days.map(r => sportMin(r, s.key) / 60)) })).filter(i => i.val > 0);
  donut($('#c-donut'), { items: mix });

  let cm = 0, cv = 0;
  const cumMi = days.map(r => (cm += dayMi(r))), cumV = days.map(r => (cv += dayVert(r)));
  const xs = days.map(r => D(r.date));
  lines($('#c-cumMi'), { xs, series: [{ label: 'Miles', color: SP.run.color, vals: cumMi, area: true }], fmt: n0, endLabels: true, m: { r: 44 } });
  lines($('#c-cumVert'), { xs, series: [{ label: 'Vert (ft)', color: SP.nordic.color, vals: cumV, area: true }], fmt: n0, yfmt: v => v >= 1000 ? (v / 1000) + 'k' : v, endLabels: true, m: { r: 54 } });

  // monthly
  const months = new Map();
  for (const r of days) { const k = r.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(r); }
  const mk = [...months.keys()];
  bars($('#c-monthly'), {
    labels: mk.map(k => MON[+k.slice(5) - 1] + (mk.length > 12 ? " '" + k.slice(2, 4) : '')),
    series: sportList.map(s => ({ label: s.label, color: s.color, vals: mk.map(k => sum(months.get(k).map(r => sportMin(r, s.key) / 60))) })),
    fmt: n1, yfmt: v => v + 'h', maxBar: 56,
    top: i => { const v = sum(months.get(mk[i]).map(r => dayMin(r) / 60)); return v < 10 ? n1(v) : n0(v); },
    tipExtra: i => { const ms = months.get(mk[i]); return tipRow('Miles', n0(sum(ms.map(r => dayMi(r))))) + tipRow('Vert ft', n0(sum(ms.map(r => dayVert(r))))); },
  });

  // PRs
  const logged = days.filter(r => !r._empty);
  const best = (f) => logged.reduce((b, r) => f(r) > (b ? f(b) : 0) ? r : b, null);
  const lr = best(r => g(r, 'run_mi')), lv = best(r => dayVert(r)), ld = best(r => dayMin(r)), lfc = best(flatConv);
  const bw = wk.reduce((b, w, i) => wkH[i] > (b ? b.h : 0) ? { w, h: wkH[i] } : b, null);
  const bwm = wk.reduce((b, w, i) => { const v = sum(w.days.map(r => g(r, 'run_mi'))); return v > (b ? b.v : 0) ? { w, v } : b; }, null);
  const pr = (k, v, u, r, sub) => `<div class="pr" ${r ? `data-date="${r}"` : ''}><div class="k">${k}</div><div class="v">${v}<small> ${u}</small></div><div class="d">${esc(sub || '')}</div></div>`;
  $('#prs').innerHTML =
    (lr ? pr('Longest run', n1(g(lr, 'run_mi')), 'mi', lr.date, fmtD(D(lr.date)) + (lr.notes ? ' · ' + lr.notes : '')) : '') +
    (lv ? pr('Most vert', n0(dayVert(lv)), 'ft', lv.date, fmtD(D(lv.date)) + (lv.notes ? ' · ' + lv.notes : '')) : '') +
    (ld ? pr('Biggest day', hm(dayMin(ld) / 60), 'h:mm', ld.date, fmtD(D(ld.date)) + (ld.notes ? ' · ' + ld.notes : '')) : '') +
    (lfc ? pr('Biggest flat-conv.', n1(flatConv(lfc)), 'mi', lfc.date, fmtD(D(lfc.date))) : '') +
    (bw ? pr('Biggest week', n1(bw.h), 'h', null, 'week of ' + fmtD(bw.w.start)) : '') +
    (bwm ? pr('Biggest run week', n1(bwm.v), 'mi', null, 'week of ' + fmtD(bwm.w.start)) : '') +
    pr('Longest streak', st.best, 'days', null, 'consecutive active days') +
    pr('Rest days', days.length - logged.filter(isActive).length, 'days', null, 'in this range');
  $$('#prs .pr[data-date]').forEach(p => p.onclick = () => openEntry(p.dataset.date));

  renderThisWeek();
}

// Rolling 7-day window: computed on full history so the first days of a range aren't starved
function renderRolling() {
  const host = $('#c-roll');
  if (!state.days.length) { emptyMsg(frame(host)); return; }
  const [s, e] = rangeBounds();
  const all = series(D(state.days[0].date), e);
  const M = {
    hours: { f: r => dayMin(r) / 60, unit: 'h', fmt: n1, word: 'hours' },
    run:   { f: r => g(r, 'run_mi'), unit: 'mi', fmt: n1, word: 'run miles' },
    fc:    { f: flatConv, unit: 'mi', fmt: n1, word: 'flat-conv. miles' },
    vert:  { f: r => dayVert(r), unit: 'ft', fmt: n0, word: 'vert ft' },
    sleep: { f: r => g(r, 'sleep'), unit: 'h', fmt: hm, word: 'sleep hours', avg: true },
  }[state.rollMetric];
  const v = all.map(M.f);
  // sleep: rolling 7-night average per night (skips unlogged nights); everything else: rolling 7-day total
  const win = (i, n) => v.slice(Math.max(0, i - n + 1), i + 1);
  const r7 = v.map((_, i) => {
    if (i < 6) return null;
    if (M.avg) { const w = win(i, 7).filter(Boolean); return w.length ? mean(w) : null; }
    return sum(win(i, 7));
  });
  const r28 = v.map((_, i) => {
    if (i < 27) return null;
    if (M.avg) { const w = win(i, 28).filter(Boolean); return w.length ? mean(w) : null; }
    return sum(win(i, 28)) / 4; // 28-day total expressed per week
  });
  const i0 = all.findIndex(r => D(r.date) >= s);
  const days = all.slice(i0), a7 = r7.slice(i0), a28 = r28.slice(i0), raw = v.slice(i0);
  const lbl7 = M.avg ? '7-night avg' : 'Rolling 7-day total', lbl28 = M.avg ? '28-night avg' : '28-day avg per week';
  $('#rollLegend').innerHTML = legendHTML([{ label: lbl7, color: SP.run.color, kind: 'line' }, { label: lbl28, color: SP.bc.color, kind: 'line' }]);
  lines(host, {
    xs: days.map(r => D(r.date)),
    series: [
      { label: lbl7, color: SP.run.color, vals: a7, area: true, width: 2.5 },
      { label: lbl28, color: SP.bc.color, vals: a28, width: 2 },
    ],
    fmt: M.fmt, yfmt: v => M.unit === 'ft' && v >= 1000 ? v / 1000 + 'k' : (M.avg ? v + 'h' : v),
    yMin: M.avg ? undefined : 0,
    refs: M.avg ? [{ y: 8, label: '8h' }] : [],
    tipTitle: i => `7 days ending ${fmtDL(D(days[i].date))}`,
    tipExtra: i => {
      const j = i0 + i; let h = tipRow('That day', raw[i] ? M.fmt(raw[i]) + ' ' + M.unit : 'rest');
      const out = j >= 7 ? v[j - 7] : 0;
      if (!M.avg && j >= 7) h += tipRow('Dropped out of window', out ? M.fmt(out) : '0');
      if (a7[i] != null && a28[i]) h += `<div class="n">7-day vs 28-day: ${ratio2(a7[i] / a28[i])}</div>`;
      return h;
    },
    onClick: i => openEntry(days[i].date),
  });
  // headline stats
  const valid = a7.map((x, i) => [x, i]).filter(([x]) => x != null);
  if (!valid.length) { $('#rollStats').innerHTML = ''; return; }
  const [cur] = valid[valid.length - 1];
  const wkAgo = a7[a7.length - 8], pk = valid.reduce((b, p) => p[0] > b[0] ? p : b), lo = valid.reduce((b, p) => p[0] < b[0] ? p : b);
  const chg = wkAgo ? (cur - wkAgo) / wkAgo * 100 : null;
  const c28 = a28[a28.length - 1];
  $('#rollStats').innerHTML =
    `<span><b>${M.fmt(cur)}</b>${M.unit} right now</span>` +
    (chg != null ? `<span><b class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(0)}%</b>vs 7 days ago</span>` : '') +
    (c28 ? `<span><b>${ratio2(cur / c28)}</b>7-day vs 28-day trend</span>` : '') +
    `<span><b>${M.fmt(pk[0])}</b>peak · ${fmtD(D(days[pk[1]].date))}</span>` +
    `<span><b>${M.fmt(lo[0])}</b>low · ${fmtD(D(days[lo[1]].date))}</span>`;
}

function renderThisWeek() {
  const ws = monday(today()); const m = byDate();
  const wd = [...Array(7)].map((_, i) => { const d = addDays(ws, i); return { d, r: m.get(iso(d)) || { date: iso(d) } }; });
  const all = SPORTS.map(s => s.key);
  const hrs = sum(wd.map(x => dayMin(x.r, all) / 60));
  const mi = sum(wd.map(x => dayMi(x.r, all))), vt = sum(wd.map(x => dayVert(x.r, all)));
  const fc = sum(wd.map(x => flatConv(x.r)));
  $('#weekLabel').textContent = `${fmtD(ws)} – ${fmtD(addDays(ws, 6))}`;
  const per = SPORTS.map(s => ({ s, h: sum(wd.map(x => sportMin(x.r, s.key) / 60)) })).filter(x => x.h > 0);
  $('#weekRing').innerHTML = `<div class="wk-big">${n1(hrs)}<small>h</small></div>
    <div class="wk-sub">${n1(mi)} mi · ${n0(vt)} ft${fc ? ` · ${n1(fc)} flat-conv.` : ''}</div>
    <div class="wk-split">${per.map(x => `<div title="${x.s.label}" style="flex:${x.h};background:${x.s.color}"></div>`).join('') || '<div style="flex:1;background:#2c2c2a"></div>'}</div>
    <div class="ring-cap">${per.map(x => `<span><i style="background:${x.s.color}"></i>${x.s.label} ${n1(x.h)}h</span>`).join('') || '<span>no training yet</span>'}</div>`;
  const maxD = Math.max(1, ...wd.map(x => dayMin(x.r, SPORTS.map(s => s.key))));
  const td = todayIso();
  $('#weekDays').innerHTML = wd.map(x => {
    const segs = SPORTS.filter(s => sportMin(x.r, s.key)).map(s => `<div style="height:${sportMin(x.r, s.key) / maxD * 44}px;background:${s.color}"></div>`).join('');
    return `<div class="wd ${x.r.date === td ? 'today' : ''} ${x.r.date > td ? 'future' : ''}" data-date="${x.r.date}"><b>${DOW[(x.d.getDay() + 6) % 7][0]}</b><div class="bar">${segs}</div></div>`;
  }).join('');
  $$('#weekDays .wd').forEach(w => {
    w.onclick = () => openEntry(w.dataset.date);
    w.onmousemove = e => tip.show(e, dayTip(m.get(w.dataset.date) || { date: w.dataset.date }));
    w.onmouseleave = () => tip.hide();
  });
}

function renderRun() {
  const { days, prev, wk } = ctx();
  const runs = days.filter(r => g(r, 'run_min') > 0);
  const mi = sum(runs.map(r => g(r, 'run_mi'))), vert = sum(runs.map(r => g(r, 'run_vert')));
  const fc = mi + vert / FT_PER_FLAT_MI, mins = sum(runs.map(r => g(r, 'run_min')));
  const pfc = sum(prev.map(flatConv));
  const withMi = runs.filter(r => g(r, 'run_mi') > 0);
  const avgPace = withMi.length ? sum(withMi.map(r => g(r, 'run_min'))) / sum(withMi.map(r => g(r, 'run_mi'))) : 0;
  const wkFc = wk.map(w => sum(w.days.map(flatConv)));
  $('#runKpis').innerHTML =
    kpiHTML('Flat conversion', n1(fc), 'mi', delta(fc, pfc), sparkline(wkFc, SP.run.color)) +
    kpiHTML('Run miles', n1(mi), 'mi', `${runs.length} runs · ${n1(mi / (runs.length || 1))} mi avg`) +
    kpiHTML('Run vert', n0(vert), 'ft', `${n0(vert / (mi || 1))} ft per mile`) +
    kpiHTML('Time on feet', hm(mins / 60), 'h:mm', `${n1(mins / 60 / Math.max(1, wk.length))} h / week`) +
    kpiHTML('Avg pace', avgPace ? pace(avgPace) : '—', '/mi', 'moving, incl. climbing') +
    kpiHTML('Vert share', fc ? Math.round(vert / FT_PER_FLAT_MI / fc * 100) + '%' : '—', '', 'of flat-conv. from climbing');

  $('#runLegend').innerHTML = legendHTML([{ label: 'Run miles', color: SP.run.color }, { label: 'Vert-equivalent miles', color: '#9085e9' }]);
  const wMi = wk.map(w => sum(w.days.map(r => g(r, 'run_mi')))), wVe = wk.map(w => sum(w.days.map(r => g(r, 'run_vert'))) / FT_PER_FLAT_MI);
  bars($('#c-runWeekly'), {
    labels: wk.map(w => fmtD(w.start)),
    series: [{ label: 'Run miles', color: SP.run.color, vals: wMi }, { label: 'Vert-equiv. miles', color: '#9085e9', vals: wVe }],
    fmt: n1, tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
    top: i => wkFc[i] > 0.1 && wk.length <= 30 ? n1(wkFc[i]) : '',
    tipExtra: i => tipRow('Vert ft', n0(wVe[i] * FT_PER_FLAT_MI)),
  });
  bars($('#c-runVert'), {
    labels: wk.map(w => fmtD(w.start)),
    series: [{ label: 'Run vert (ft)', color: '#9085e9', vals: wk.map(w => sum(w.days.map(r => g(r, 'run_vert')))) }],
    fmt: n0, yfmt: v => v >= 1000 ? v / 1000 + 'k' : v, tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
  });
  const longest = wk.map(w => Math.max(0, ...w.days.map(r => g(r, 'run_mi'))));
  lines($('#c-longRun'), {
    xs: wk.map(w => w.start), series: [{ label: 'Longest run', color: SP.run.color, vals: longest.map(v => v || null), dots: true }],
    fmt: n1, tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
    tipExtra: i => { const r = wk[i].days.reduce((b, r) => g(r, 'run_mi') > g(b, 'run_mi') ? r : b, {}); return r.notes ? `<div class="n">${esc(r.notes)}</div>` : ''; },
  });
  const pts = withMi.filter(r => g(r, 'run_min') / g(r, 'run_mi') < 40).map(r => {
    const p = g(r, 'run_min') / g(r, 'run_mi'), vpm = g(r, 'run_vert') / g(r, 'run_mi');
    return { x: vpm, y: p, r: 4 + Math.sqrt(g(r, 'run_min')) * 0.9, color: SP.run.color, date: r.date,
      tip: `<b>${fmtDL(D(r.date))}</b>${tipRow('Distance', n1(g(r, 'run_mi')) + ' mi')}${tipRow('Vert', n0(g(r, 'run_vert')) + ' ft')}${tipRow('Pace', pace(p) + ' /mi')}${tipRow('Steepness', n0(vpm) + ' ft/mi')}${r.notes ? `<div class="n">${esc(r.notes)}</div>` : ''}` };
  });
  scatter($('#c-runScatter'), { pts, xLabel: 'climb (ft per mile)', yLabel: 'pace (min per mile)', xMin: 0, yfmt: v => v + "'", trend: true, emptyText: 'No runs with distance in range' });
  const buckets = [[0, 3], [3, 5], [5, 7], [7, 10], [10, 13], [13, 20], [20, 99]];
  bars($('#c-runHist'), {
    labels: buckets.map(([a, b]) => b === 99 ? `${a}+` : `${a}–${b}`),
    series: [{ label: 'Runs', color: SP.run.color, vals: buckets.map(([a, b]) => withMi.filter(r => g(r, 'run_mi') >= a && g(r, 'run_mi') < b).length) }],
    fmt: n0, tipTitle: i => `${buckets[i][1] === 99 ? buckets[i][0] + '+' : buckets[i][0] + '–' + buckets[i][1]} miles`, maxBar: 60, top: i => '', ticks: 4,
  });
  const top = [...runs].sort((a, b) => flatConv(b) - flatConv(a)).slice(0, 12);
  $('#runTop').innerHTML = top.length ? `<table><thead><tr><th>#</th><th>Date</th><th>Time</th><th>Miles</th><th>Vert ft</th><th>ft/mi</th><th>Flat conv.</th><th class="note">Notes</th></tr></thead><tbody>${
    top.map((r, i) => `<tr data-date="${r.date}"><td class="rank">${i + 1}</td><td>${fmtD(D(r.date))}</td><td>${hm(g(r, 'run_min') / 60)}</td><td>${n1(g(r, 'run_mi'))}</td><td>${n0(g(r, 'run_vert'))}</td><td>${g(r, 'run_mi') ? n0(g(r, 'run_vert') / g(r, 'run_mi')) : '—'}</td><td><b>${n1(flatConv(r))}</b></td><td class="note">${esc(r.notes || '')}</td></tr>`).join('')
  }</tbody></table>` : '<p class="hint">No runs in this range.</p>';
  $$('#runTop tbody tr').forEach(tr => tr.onclick = () => openEntry(tr.dataset.date));
}

function renderLoad() {
  const P = pmc();
  const { days, wk } = ctx();
  const last = P[P.length - 1] || { ctl: 0, atl: 0, tsb: 0, acwr: null };
  const unit = state.loadSrc === 'tl' ? 'TL' : 'min';
  const formState = last.tsb < -25 ? ['Overreaching', 'crit'] : last.tsb < -10 ? ['Building', 'warn'] : last.tsb < 5 ? ['Balanced', 'good'] : ['Fresh', 'good'];
  const ac = last.acwr;
  const acState = ac == null ? '' : ac > 1.5 ? '⚠ spike — high injury risk zone' : ac > 1.3 ? 'above sweet spot' : ac >= 0.8 ? '✓ in the 0.8–1.3 sweet spot' : 'below — detraining';
  const wkH = wk.map(w => sum(w.days.map(r => dayMin(r) / 60)));
  const thisW = wkH[wkH.length - 1] || 0, prev4 = mean(wkH.slice(-5, -1).filter((_, i, a) => true));
  $('#loadKpis').innerHTML =
    kpiHTML('Fitness', n0(last.ctl), unit + '/day', '42-day weighted avg', sparkline(P.map(p => p.ctl), SP.run.color)) +
    kpiHTML('Fatigue', n0(last.atl), unit + '/day', '7-day weighted avg', sparkline(P.map(p => p.atl), SP.bike.color)) +
    kpiHTML('Form', (last.tsb > 0 ? '+' : '') + n0(last.tsb), '', `<span style="color:var(--${formState[1]})">● ${formState[0]}</span>`, sparkline(P.map(p => p.tsb), SP.nordic.color)) +
    kpiHTML('Acute : chronic', ac == null ? '—' : n2(ac), '', ac == null ? 'needs 28 days' : `${ratio2(ac)}<br>${acState}`) +
    kpiHTML('This week vs last 4', prev4 ? n2(thisW / prev4) : '—', '', prev4 ? ratio2(thisW / prev4) : 'not enough weeks');

  $('#pmcLegend').innerHTML = legendHTML([{ label: 'Fitness', color: SP.run.color, kind: 'line' }, { label: 'Fatigue', color: SP.bike.color, kind: 'line' }, { label: 'Form', color: SP.nordic.color, kind: 'line' }]);
  const xs = P.map(p => D(p.r.date));
  lines($('#c-pmc'), {
    xs, series: [
      { label: 'Fitness', color: SP.run.color, vals: P.map(p => p.ctl), width: 2.5, area: true },
      { label: 'Fatigue', color: SP.bike.color, vals: P.map(p => p.atl) },
      { label: 'Form', color: SP.nordic.color, vals: P.map(p => p.tsb) },
    ], fmt: n0, tipExtra: i => tipRow('Load that day', n0(P[i].L) + ' ' + unit) + (P[i].r.notes ? `<div class="n">${esc(P[i].r.notes)}</div>` : ''),
    onClick: i => openEntry(P[i].r.date), endLabels: true, m: { r: 40 },
  });
  lines($('#c-acwr'), {
    xs, series: [{ label: 'A:C ratio', color: C.text, vals: P.map(p => p.acwr) }],
    band: { lo: 0.8, hi: 1.3 }, refs: [{ y: 1.5, label: '1.5 spike', color: C.crit }], fmt: n2, yfmt: v => v.toFixed(1), yMin: 0,
    tipExtra: i => P[i].acwr ? `<div class="n">${ratio2(P[i].acwr)}</div>` : '', emptyText: 'Needs 28+ days of history',
  });
  $('#dailyLoadSub').textContent = state.loadSrc === 'tl' ? 'logged training load (TL)' : 'training minutes';
  bars($('#c-dailyLoad'), {
    labels: P.map(p => fmtD(D(p.r.date))), series: [{ label: unit, color: SP.run.color, vals: P.map(p => p.L) }],
    fmt: n0, pad: 0.8, tipTitle: i => fmtDL(D(P[i].r.date)), tipExtra: i => P[i].r.notes ? `<div class="n">${esc(P[i].r.notes)}</div>` : '', onClick: i => openEntry(P[i].r.date),
  });
  const ramp = wkH.map((h, i) => i && wkH[i - 1] ? (h - wkH[i - 1]) / wkH[i - 1] * 100 : 0);
  bars($('#c-ramp'), {
    labels: wk.map(w => fmtD(w.start)),
    series: [{ label: 'Change', color: C.good, colorNeg: C.crit, vals: ramp.map(v => Math.max(-100, Math.min(200, v))) }],
    fmt: v => (v > 0 ? '+' : '') + n0(v) + '%', yfmt: v => v + '%', tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
    tipExtra: i => tipRow('Hours', n1(wkH[i])) + (i ? tipRow('Prev week', n1(wkH[i - 1])) : ''),
  });
  const sportList = SPORTS.filter(s => state.sports.has(s.key));
  const byDow = DOW.map((_, di) => days.filter(r => (D(r.date).getDay() + 6) % 7 === di));
  bars($('#c-dow'), {
    labels: DOW, series: sportList.map(s => ({ label: s.label, color: s.color, vals: byDow.map(ds => mean(ds.map(r => sportMin(r, s.key) / 60))) })),
    fmt: n2, yfmt: v => v + 'h', maxBar: 54, top: i => n1(mean(byDow[i].map(r => dayMin(r) / 60))),
    tipExtra: i => tipRow('Rest rate', Math.round(byDow[i].filter(r => !isActive(r)).length / (byDow[i].length || 1) * 100) + '%'),
  });
}

function renderRecovery() {
  const { days, prev, wk } = ctx();
  const sl = days.map(r => g(r, 'sleep') || null);
  const v = sl.filter(Boolean), pv = prev.map(r => g(r, 'sleep')).filter(Boolean);
  const avg7 = sl.map((_, i) => { const w = sl.slice(Math.max(0, i - 6), i + 1).filter(Boolean); return w.length ? mean(w) : null; });
  const sd = v.length ? Math.sqrt(mean(v.map(x => (x - mean(v)) ** 2))) : 0;
  const debt = sum(v.map(x => 8 - x));
  const rp = days.map(r => g(r, 'rpf')).filter(Boolean);
  $('#recKpis').innerHTML =
    kpiHTML('Avg sleep', v.length ? hm(mean(v)) : '—', 'h:mm', pv.length ? delta(mean(v), mean(pv)) : '', sparkline(avg7.filter(Boolean), C.sleep)) +
    kpiHTML('Consistency', v.length ? '±' + n0(sd * 60) : '—', 'min', 'std. deviation night to night') +
    kpiHTML('Sleep vs 8h', v.length ? (debt > 0 ? '−' : '+') + n1(Math.abs(debt)) : '—', 'h', debt > 0 ? 'total short of 8h/night' : 'total over 8h/night') +
    kpiHTML('Best night', v.length ? hm(Math.max(...v)) : '—', '', v.length ? `worst ${hm(Math.min(...v))}` : '') +
    kpiHTML('Avg feel', rp.length ? n1(mean(rp)) : '—', '/10', `${rp.length} days logged`);

  const xs = days.map(r => D(r.date));
  // sleep bars + avg line drawn together in the same unit (hours) → single axis
  const host = $('#c-sleep');
  bars(host, {
    labels: xs.map(fmtD), series: [{ label: 'Sleep', color: '#4b4580', vals: sl.map(x => x || 0) }],
    fmt: hm, yfmt: v => v + 'h', pad: 0.78, minMax: 10, refs: [{ y: 8, label: '8h', color: C.muted }],
    tipTitle: i => fmtDL(xs[i]), tipExtra: i => (avg7[i] ? tipRow('7-night avg', hm(avg7[i]), C.sleep) : '') + (days[i].notes ? `<div class="n">${esc(days[i].notes)}</div>` : ''),
    onClick: i => openEntry(days[i].date),
  });
  // overlay the 7-night average onto the same scale
  overlayLine(host, avg7, C.sleep, Math.max(10, ...v));

  const sb = [[0, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 24]];
  bars($('#c-sleepHist'), {
    labels: sb.map(([a, b]) => b === 24 ? `${a}h+` : a === 0 ? `<${b}h` : `${a}–${b}h`),
    series: [{ label: 'Nights', color: C.sleep, vals: sb.map(([a, b]) => v.filter(x => x >= a && x < b).length) }], fmt: n0, maxBar: 60,
  });
  const pts = days.filter(r => g(r, 'sleep') > 2).map(r => ({
    x: g(r, 'sleep'), y: dayMin(r) / 60, r: 6, color: C.sleep, date: r.date, tip: dayTip(r),
  }));
  scatter($('#c-sleepScatter'), { pts, xLabel: 'sleep (h)', yLabel: 'training (h)', xfmt: v => v + 'h', yfmt: v => v + 'h', trend: true });
  lines($('#c-rpf'), {
    xs, series: [{ label: 'Feel', color: SP.bc.color, vals: days.map(r => g(r, 'rpf') || null), dots: true, noLine: true }],
    yMin: 0, yMax: 10, fmt: v => v + '/10', yfmt: v => v, emptyText: 'Log RPF on the Log day tab to see this',
    tipExtra: i => days[i].notes ? `<div class="n">${esc(days[i].notes)}</div>` : '',
  });
  bars($('#c-rest'), {
    labels: wk.map(w => fmtD(w.start)),
    series: [
      { label: 'Active days', color: SP.nordic.color, vals: wk.map(w => w.days.filter(isActive).length) },
      { label: 'Rest days', color: '#4a4a45', vals: wk.map(w => w.days.filter(r => !isActive(r)).length) },
    ], fmt: n0, tipTitle: i => `Week of ${fmtD(wk[i].start)}`,
  });
}

function overlayLine(host, vals, color, maxHint) {
  const svg = host.querySelector('svg'); if (!svg) return;
  // re-derive the bar chart scale (same niceTicks call as bars())
  const H = +svg.getAttribute('height'), W = +svg.getAttribute('width');
  const m = { l: 44, r: 58, t: 14, b: 28 };
  const nt = niceTicks(0, maxHint, 4);
  const y = lin(nt.lo, nt.hi, H - m.b, m.t);
  const n = vals.length, band = (W - m.l - m.r) / n;
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (m.l + band * i + band / 2).toFixed(1) + ',' + y(v).toFixed(1); pen = true; });
  const p = el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'pointer-events': 'none' });
  svg.insertBefore(p, svg.lastChild);
}

function renderCalendar() {
  if (!state.calMonth) { const t = today(); state.calMonth = new Date(t.getFullYear(), t.getMonth(), 1, 12); }
  const m0 = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth(), 1, 12);
  $('#calTitle').textContent = m0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const start = monday(m0), m = byDate(), td = todayIso();
  let html = DOW.map(d => `<div class="dh">${d}</div>`).join('') + '<div class="dh">Week</div>';
  let d = new Date(start); let mHrs = 0, mMi = 0, mV = 0, mAct = 0;
  for (let w = 0; w < 6; w++) {
    if (w > 0 && d.getMonth() !== m0.getMonth() && d > m0) break;
    let wH = 0, wMi = 0, wV = 0;
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) {
      const k = iso(d), r = m.get(k) || { date: k };
      const inM = d.getMonth() === m0.getMonth();
      const acts = SPORTS.filter(s => sportMin(r, s.key)).map(s => {
        let t = hm(sportMin(r, s.key) / 60);
        if (s.dist && g(r, s.key + '_mi')) t = `${n1(g(r, s.key + '_mi'))}mi`;
        if (s.dist && g(r, s.key + '_vert') >= 100) t += ` ↑${g(r, s.key + '_vert') >= 1000 ? n1(g(r, s.key + '_vert') / 1000) + 'k' : n0(g(r, s.key + '_vert'))}`;
        return `<div class="act"><i style="background:${s.color}"></i><span>${t}</span></div>`;
      }).join('');
      wH += dayMin(r) / 60; wMi += dayMi(r); wV += dayVert(r);
      if (inM) { mHrs += dayMin(r) / 60; mMi += dayMi(r); mV += dayVert(r); if (isActive(r)) mAct++; }
      html += `<div class="cday ${inM ? '' : 'out'} ${k === td ? 'today' : ''}" data-date="${k}"><div class="n">${d.getDate()}${g(r, 'sleep') ? `<span>☾${hm(r.sleep)}</span>` : ''}</div><div class="acts">${acts}</div>${r.notes ? `<div class="note">${esc(r.notes)}</div>` : ''}</div>`;
    }
    html += addDays(d, -7) > today() ? '<div class="cweek"></div>' : `<div class="cweek"><b>${n1(wH)}h</b><span>${n1(wMi)} mi</span><span>${n0(wV)} ft</span></div>`;
  }
  $('#cal').innerHTML = html;
  $('#calFoot').innerHTML = `<b>${m0.toLocaleDateString(undefined, { month: 'long' })}:</b> ${n1(mHrs)} h · ${n1(mMi)} mi · ${n0(mV)} ft · ${mAct} active days — click any day to edit it`;
  $$('#cal .cday').forEach(c => {
    c.onclick = () => openEntry(c.dataset.date);
    c.onmousemove = e => tip.show(e, dayTip(m.get(c.dataset.date) || { date: c.dataset.date }));
    c.onmouseleave = () => tip.hide();
  });
}

function renderJournal() {
  const q = $('#jSearch').value.trim().toLowerCase();
  const [s, e] = rangeBounds();
  const list = state.days.filter(r => D(r.date) >= s && D(r.date) <= e && (r.notes || isActive(r)))
    .filter(r => !q || (r.notes || '').toLowerCase().includes(q)).reverse();
  $('#jCount').textContent = `${list.length} days${q ? ` matching “${q}”` : ''}`;
  let html = '', lastM = '';
  const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
  for (const r of list) {
    const d = D(r.date), mk = r.date.slice(0, 7);
    if (mk !== lastM) { html += `<div class="jm">${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>`; lastM = mk; }
    const tags = SPORTS.filter(sp => sportMin(r, sp.key)).map(sp => `<span class="tag"><i style="background:${sp.color}"></i>${sp.label} ${hm(sportMin(r, sp.key) / 60)}${sp.dist && g(r, sp.key + '_mi') ? ` · ${n1(g(r, sp.key + '_mi'))} mi` : ''}${sp.dist && g(r, sp.key + '_vert') ? ` · ${n0(g(r, sp.key + '_vert'))} ft` : ''}</span>`).join('')
      + (g(r, 'sleep') ? `<span class="tag">☾ ${hm(r.sleep)}</span>` : '') + (g(r, 'rpf') ? `<span class="tag">feel ${r.rpf}/10</span>` : '') + (g(r, 'tl') ? `<span class="tag">TL ${n0(r.tl)}</span>` : '');
    let note = esc(r.notes || '');
    if (re) note = note.replace(re, m => `<mark>${m}</mark>`);
    html += `<div class="je" data-date="${r.date}"><div class="dt"><b>${d.getDate()}</b><span>${DOW[(d.getDay() + 6) % 7]}</span></div><div><div class="tags">${tags || '<span class="tag">rest</span>'}</div>${note ? `<div class="tx">${note}</div>` : ''}</div></div>`;
  }
  $('#journal').innerHTML = html || '<p class="hint">Nothing here yet.</p>';
  $$('#journal .je').forEach(j => j.onclick = () => openEntry(j.dataset.date));
}

// ───────────────────────── entry form ─────────────────────────
function buildSportFields() {
  $('#sportFields').innerHTML = SPORTS.filter(s => s.dist).map(s => `
    <fieldset><legend><i style="background:${s.color}"></i>${s.label}</legend>
      <div class="row">
        <label>Minutes<input type="number" data-f="${s.key}_min" min="0" step="1" inputmode="numeric"></label>
        <label>Miles<input type="number" data-f="${s.key}_mi" min="0" step="0.01" inputmode="decimal"></label>
        <label>Vert ft<input type="number" data-f="${s.key}_vert" min="0" step="1" inputmode="numeric"></label>
      </div>
    </fieldset>`).join('');
}
function fillEntry(date) {
  const r = byDate().get(date) || { date };
  $('#eDate').value = date;
  $$('#sportFields input').forEach(i => i.value = g(r, i.dataset.f) || '');
  const sl = g(r, 'sleep');
  $('#eSleepH').value = sl ? Math.floor(Math.round(sl * 60) / 60) : '';
  $('#eSleepM').value = sl ? Math.round(sl * 60) % 60 : '';
  $('#eSessions').value = g(r, 'sessions') || '';
  $('#eWorkout').value = g(r, 'workout') || '';
  $('#eTl').value = g(r, 'tl') || '';
  $('#eRpf').value = g(r, 'rpf') || 0;
  $('#eNotes').value = r.notes || '';
  const exists = byDate().has(date);
  const st = $('#eStatus'); st.textContent = exists ? 'editing logged day' : 'new day'; st.className = 'pill ' + (exists ? 'ok' : 'new');
  liveEntry();
}
function readEntry() {
  const rec = { date: $('#eDate').value };
  $$('#sportFields input').forEach(i => { const v = parseFloat(i.value); if (v) rec[i.dataset.f] = v; });
  const sh = parseFloat($('#eSleepH').value) || 0, sm = parseFloat($('#eSleepM').value) || 0;
  if (sh || sm) rec.sleep = +(sh + sm / 60).toFixed(3);
  const map = { sessions: '#eSessions', workout: '#eWorkout', tl: '#eTl', rpf: '#eRpf' };
  for (const k in map) { const v = parseFloat($(map[k]).value); if (v) rec[k] = v; }
  const n = $('#eNotes').value.trim(); if (n) rec.notes = n;
  return rec;
}
function liveEntry() {
  const r = readEntry();
  $('#eRpfOut').textContent = r.rpf ? r.rpf + '/10' : '—';
  const all = SPORTS.map(s => s.key);
  const parts = [`<span class="tag">total ${hm(dayMin(r, all) / 60)}</span>`];
  if (dayMi(r, all)) parts.push(`<span class="tag">${n1(dayMi(r, all))} mi</span>`);
  if (dayVert(r, all)) parts.push(`<span class="tag">${n0(dayVert(r, all))} ft</span>`);
  if (g(r, 'run_mi')) {
    parts.push(`<span class="tag"><i style="background:${SP.run.color}"></i>flat conv. ${n1(flatConv(r))} mi</span>`);
    if (g(r, 'run_min')) parts.push(`<span class="tag">run pace ${pace(g(r, 'run_min') / g(r, 'run_mi'))}/mi</span>`);
    parts.push(`<span class="tag">${n0(g(r, 'run_vert') / g(r, 'run_mi'))} ft/mi</span>`);
  }
  if (g(r, 'bike_mi') && g(r, 'bike_min')) parts.push(`<span class="tag"><i style="background:${SP.bike.color}"></i>${n1(g(r, 'bike_mi') / (g(r, 'bike_min') / 60))} mph</span>`);
  $('#eLive').innerHTML = parts.join('');
}
function openEntry(date) { switchTab('entry'); fillEntry(date); }
function saveEntry(next) {
  const rec = readEntry();
  if (!rec.date) return toast('Pick a date');
  upsertDay(rec);
  toast(`Saved ${fmtD(D(rec.date))}`);
  if (next) fillEntry(iso(addDays(D(rec.date), 1))); else fillEntry(rec.date);
  renderChrome();
}

// ───────────────────────── import / export / github ─────────────────────────
const CSV_COLS = ['date', ...FIELDS, 'notes'];
function toCSV(days) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [CSV_COLS.join(','), ...days.map(r => CSV_COLS.map(c => q(r[c] ?? '')).join(','))].join('\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...body] = rows; if (!h) return [];
  return body.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k.trim(), r[i]])));
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importText(name, text) {
  let arr;
  try { arr = /\.csv$/i.test(name) ? parseCSV(text) : JSON.parse(text); } catch (e) { return toast('Could not read that file'); }
  const inc = normalize(arr); if (!inc.length) return toast('No valid days found');
  const m = byDate(); for (const r of inc) m.set(r.date, r);
  state.days = normalize([...m.values()]); persist(); renderAll(); toast(`Imported ${inc.length} days`);
}
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
function ghCfg() {
  const c = { owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim(), branch: $('#ghBranch').value.trim() || 'main', path: $('#ghPath').value.trim() || 'data/training.json', token: $('#ghToken').value.trim() };
  state.gh = c; writeLS(LS.gh, c); return c;
}
function ghStatus(t, cls = '') { const s = $('#ghStatus'); s.textContent = t; s.className = 'pill ' + cls; }
async function ghReq(c, method = 'GET', body) {
  const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}` + (method === 'GET' ? `?ref=${encodeURIComponent(c.branch)}` : '');
  const res = await fetch(url, { method, headers: Object.assign({ Accept: 'application/vnd.github+json' }, c.token ? { Authorization: `Bearer ${c.token}` } : {}, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (!res.ok && !(method === 'GET' && res.status === 404)) { const j = await res.json().catch(() => ({})); throw new Error(`${res.status} ${j.message || ''}`); }
  return res.status === 404 ? null : res.json();
}
async function ghPush() {
  const c = ghCfg(); if (!c.owner || !c.repo || !c.token) return ghStatus('fill owner, repo & token', 'err');
  try {
    ghStatus('pushing…');
    const cur = await ghReq(c);
    const content = JSON.stringify(state.days, null, 0).replace(/\},\{/g, '},\n{');
    await ghReq(c, 'PUT', { message: `Training log update ${todayIso()}`, content: b64(content), branch: c.branch, sha: cur && cur.sha });
    writeLS(LS.dirty, false); $('#dirtyFlag').hidden = true;
    ghStatus('pushed ✓ — site updates in ~1 min', 'ok'); toast('Pushed to GitHub');
  } catch (e) { ghStatus(e.message, 'err'); }
}
async function ghPull() {
  const c = ghCfg(); if (!c.owner || !c.repo) return ghStatus('fill owner & repo', 'err');
  try {
    ghStatus('pulling…');
    const cur = await ghReq(c); if (!cur) return ghStatus('file not found', 'err');
    state.days = normalize(JSON.parse(unb64(cur.content)));
    writeLS(LS.data, state.days); writeLS(LS.dirty, false); $('#dirtyFlag').hidden = true;
    renderAll(); ghStatus(`pulled ${state.days.length} days ✓`, 'ok');
  } catch (e) { ghStatus(e.message, 'err'); }
}

function renderAllTable() {
  const rows = [...state.days].reverse();
  const cell = (v, f = n1) => v ? `<td>${f(v)}</td>` : '<td class="z">·</td>';
  $('#allTable').innerHTML = `<table><thead><tr><th>Date</th><th>Sleep</th>${SPORTS.filter(s => s.dist).map(s => `<th>${s.label} min</th><th>mi</th><th>vert</th>`).join('')}<th>TL</th><th>RPF</th><th class="note">Notes</th></tr></thead><tbody>${
    rows.map(r => `<tr data-date="${r.date}"><td>${r.date}</td>${cell(g(r, 'sleep'), hm)}${SPORTS.filter(s => s.dist).map(s => cell(g(r, s.key + '_min'), n0) + cell(g(r, s.key + '_mi')) + cell(g(r, s.key + '_vert'), n0)).join('')}${cell(g(r, 'tl'), n0)}${cell(g(r, 'rpf'), n0)}<td class="note">${esc(r.notes || '')}</td></tr>`).join('')
  }</tbody></table>`;
  $$('#allTable tbody tr').forEach(tr => tr.onclick = () => openEntry(tr.dataset.date));
}

// ───────────────────────── shell ─────────────────────────
const RENDER = { dash: renderDash, run: renderRun, load: renderLoad, recovery: renderRecovery, calendar: renderCalendar, journal: renderJournal, data: renderAllTable, entry: () => {} };
function renderChrome() {
  const n = state.days.length;
  $('#brandSub').textContent = n ? `${n} days logged · ${fmtD(D(state.days[0].date))} → ${fmtD(D(state.days[n - 1].date))}` : 'no data yet';
  $('#footInfo').textContent = `${n} days`;
}
function renderAll() { renderChrome(); (RENDER[state.tab] || (() => {}))(); }
function switchTab(t) {
  state.tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
  $('#filters').style.display = (t === 'entry' || t === 'data' || t === 'calendar') ? 'none' : '';
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  tip.hide();
  requestAnimationFrame(() => (RENDER[t] || (() => {}))());
}

function bind() {
  tip.el = $('#tip');
  $$('#tabs button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'entry' && !$('#eDate').value) fillEntry(todayIso()); switchTab(b.dataset.tab); });
  $$('#rangeSeg button').forEach(b => b.onclick = () => { state.range = b.dataset.r; $$('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b)); renderAll(); });
  $('#sportChips').innerHTML = SPORTS.map(s => `<span class="chip" data-k="${s.key}"><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  $$('#sportChips .chip').forEach(c => c.onclick = () => {
    const k = c.dataset.k;
    if (state.sports.has(k)) { if (state.sports.size > 1) state.sports.delete(k); } else state.sports.add(k);
    $$('#sportChips .chip').forEach(x => x.classList.toggle('off', !state.sports.has(x.dataset.k)));
    renderLegends(); renderAll();
  });
  $$('#rollMetric button').forEach(b => b.onclick = () => { state.rollMetric = b.dataset.m; $$('#rollMetric button').forEach(x => x.classList.toggle('on', x === b)); renderRolling(); });
  $$('#loadSrc button').forEach(b => b.onclick = () => { state.loadSrc = b.dataset.l; $$('#loadSrc button').forEach(x => x.classList.toggle('on', x === b)); renderLoad(); });
  $('#calPrev').onclick = () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1, 12); renderCalendar(); };
  $('#calNext').onclick = () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1, 12); renderCalendar(); };
  $('#jSearch').oninput = renderJournal;

  buildSportFields();
  $('#entryForm').oninput = liveEntry;
  $('#entryForm').onsubmit = e => { e.preventDefault(); saveEntry(false); };
  $('#eSaveNext').onclick = () => saveEntry(true);
  $('#eDate').onchange = () => fillEntry($('#eDate').value);
  $('#ePrev').onclick = () => fillEntry(iso(addDays(D($('#eDate').value || todayIso()), -1)));
  $('#eNext').onclick = () => fillEntry(iso(addDays(D($('#eDate').value || todayIso()), 1)));
  $('#eToday').onclick = () => fillEntry(todayIso());
  $('#eDelete').onclick = () => {
    const d = $('#eDate').value; if (!byDate().has(d)) return toast('Nothing logged on that day');
    if (!confirm(`Clear everything logged on ${d}?`)) return;
    upsertDay({ date: d }); fillEntry(d); renderChrome(); toast('Day cleared');
  };

  $('#expJson').onclick = () => download(`training-${todayIso()}.json`, JSON.stringify(state.days, null, 1), 'application/json');
  $('#expCsv').onclick = () => download(`training-${todayIso()}.csv`, toCSV(state.days), 'text/csv');
  $('#impFile').onchange = async e => { const f = e.target.files[0]; if (f) importText(f.name, await f.text()); e.target.value = ''; };
  const drop = $('#drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importText(f.name, await f.text()); };
  $('#resetRepo').onclick = async () => {
    if (!confirm('Throw away edits saved in this browser and reload data/training.json from the site?')) return;
    delLS(LS.data); delLS(LS.dirty); await loadData(); renderAll(); toast('Reloaded repo data');
  };
  // GitHub — prefill owner/repo when hosted on *.github.io
  if (!state.gh.owner && /\.github\.io$/.test(location.hostname)) {
    state.gh.owner = location.hostname.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    state.gh.repo = seg && !seg.includes('.') ? seg : `${state.gh.owner}.github.io`;
  }
  for (const k of ['owner', 'repo', 'branch', 'path', 'token']) $('#gh' + k[0].toUpperCase() + k.slice(1)).value = state.gh[k] || '';
  $('#ghPush').onclick = ghPush; $('#ghPull').onclick = ghPull;

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => (RENDER[state.tab] || (() => {}))(), 150); });
  addEventListener('keydown', e => { if (e.key === 'n' && !/input|textarea|select/i.test(document.activeElement.tagName)) { fillEntry(todayIso()); switchTab('entry'); } });
  renderLegends();
}
function renderLegends() {
  const html = legendHTML(SPORTS.filter(s => state.sports.has(s.key)));
  $$('[data-legend="sports"]').forEach(l => l.innerHTML = html);
}

(async function init() {
  bind();
  const src = await loadData();
  if (src === 'empty') toast('No data found — start logging!');
  renderChrome();
  const h = location.hash.slice(1);
  if (h === 'entry') fillEntry(todayIso());
  switchTab(RENDER[h] ? h : 'dash');
})();
