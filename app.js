(function () {
'use strict';

// ---------------------------------------------------------------- storage
const P_KEY = 'bjj-roadmap-progress-v1';   // { nodeId: 'learning' | 'done' | 'skip' }
const J_KEY = 'bjj-roadmap-journal-v1';    // { sessions: [...], auto: { nodeId: true } }
const U_KEY = 'bjj-roadmap-ui-v1';
const load = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch (e) { return f; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let progress = load(P_KEY, {});
let journal = load(J_KEY, null);
if (!journal || !Array.isArray(journal.sessions)) journal = { sessions: [], auto: {} };
journal.auto = journal.auto || {};
const ui = Object.assign({ tab: 'roadmap', belt: 'white', period: 30 }, load(U_KEY, {}));
const saveP = () => persist(P_KEY, progress);
const saveJ = () => persist(J_KEY, journal);
const saveUI = () => persist(U_KEY, { tab: ui.tab, belt: ui.belt, period: ui.period });

// ---------------------------------------------------------------- index
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

const BELTS = window.ROADMAP;
const NODES = new Map();
const ORDER = [];
const BY_TITLE = new Map();
BELTS.forEach((b, bi) => b.topics.forEach(t => {
  t.id = b.id + '/' + slug(t.t);
  NODES.set(t.id, { ...t, kind: 'topic', belt: b, bi });
  ORDER.push(t.id);
  t.kids.forEach(k => {
    k.id = t.id + '/' + slug(k.t);
    NODES.set(k.id, { ...k, kind: 'kid', belt: b, bi, parent: t.id });
    ORDER.push(k.id);
    if (!BY_TITLE.has(k.t)) BY_TITLE.set(k.t, k.id);
  });
}));
const kidsFirst = [...NODES.values()].filter(n => n.kind === 'kid').concat([...NODES.values()].filter(n => n.kind === 'topic'));
const parser = window.BJJParser.createParser(kidsFirst);
const SEARCH_TEXT = new Map(kidsFirst.map(n => [n.id, window.BJJParser.norm([n.t, ...(n.a || [])].join(' '))]));

const KINDS = {
  hit:    { label: 'Hit',      long: 'Hit live',              cls: 'k-hit' },
  caught: { label: 'Caught',   long: 'Caught by',             cls: 'k-caught' },
  escape: { label: 'Escaped',  long: 'Escaped',               cls: 'k-escape' },
  drill:  { label: 'Drilled',  long: 'Drilled',               cls: 'k-drill' },
  class:  { label: 'Class',    long: 'Technique of the day',  cls: 'k-class' },
};
const TYPES = [['gi', 'Gi'], ['nogi', 'No-gi'], ['open', 'Open mat'], ['comp', 'Comp']];
const FEELS = ['Rough', 'Meh', 'OK', 'Good', 'Great'];
const STATUS_LABEL = { learning: 'Learning', done: 'Done', skip: 'Skipped' };

// ---------------------------------------------------------------- dates
const pad2 = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => dstr(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const mondayOf = s => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dstr(d); };
const fmt = (s, o) => parseD(s).toLocaleDateString(undefined, o);
const fmtShort = s => fmt(s, { day: 'numeric', month: 'short' });
const fmtLong = s => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
const relDay = s => { const n = daysBetween(s, today()); return n === 0 ? 'today' : n === 1 ? 'yesterday' : fmtShort(s); };

// ---------------------------------------------------------------- derived stats
let STATS = new Map();
function computeStats() {
  STATS = new Map();
  for (const s of journal.sessions) for (const it of s.items) {
    let r = STATS.get(it.nodeId);
    if (!r) STATS.set(it.nodeId, r = { hit: 0, caught: 0, escape: 0, drill: 0, class: 0, last: null, lastClass: null });
    r[it.kind] = (r[it.kind] || 0) + it.count;
    if (!r.last || s.date > r.last) r.last = s.date;
    if (it.kind === 'class' && (!r.lastClass || s.date > r.lastClass)) r.lastClass = s.date;
  }
}
const stat = id => STATS.get(id) || { hit: 0, caught: 0, escape: 0, drill: 0, class: 0, last: null, lastClass: null };
const live = id => { const s = stat(id); return s.hit + s.escape; };

function tally(filter) {
  let done = 0, total = 0;
  for (const [id, n] of NODES) {
    if (n.kind !== 'kid' || !filter(n) || progress[id] === 'skip') continue;
    total++; if (progress[id] === 'done') done++;
  }
  return { done, total };
}

// ---------------------------------------------------------------- icons
const ICON = {
  chev: '<svg class="chev" width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ext: '<svg class="chev" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M4 1.5h7.5V9M11.5 1.5 1.5 11.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6l-7-3Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5v-13ZM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13Z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>',
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4 3.5 6.2v13.6L9 17.6l6 2.2 5.5-2.2V4L15 6.2 9 4Z"/></svg>',
};
const beltGfx = (id, cls = '') => `<span class="belt-gfx ${cls}" data-belt="${id}" data-gfx="${id}"><span class="bar"><i></i><i></i><i></i><i></i></span></span>`;
const seg = (name, options, value, label) => `<div class="seg" role="group" aria-label="${esc(label || name)}" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`;

function paintBelts() {
  BELTS.forEach(b => {
    const { done, total } = tally(n => n.belt.id === b.id);
    const stripes = total ? Math.floor(done / total * 4) : 0;
    $$(`[data-gfx="${b.id}"]`).forEach(g => {
      $$('i', g).forEach((i, ix) => i.classList.toggle('on', ix < stripes));
      g.setAttribute('aria-label', `${b.name}: ${done} of ${total} done`);
      g.setAttribute('role', 'img');
    });
  });
}

// ---------------------------------------------------------------- status changes
function setStatus(id, status) {
  if (!status || status === 'none') delete progress[id]; else progress[id] = status;
  delete journal.auto[id];
  saveP(); saveJ();
}
function cycleStatus(id) {
  const next = { undefined: 'learning', learning: 'done', done: undefined, skip: undefined }[progress[id]];
  setStatus(id, next);
  return next;
}
// Logging labels the roadmap: any practice marks it Learning, five live hits mark it Done.
// It only ever moves forward and never touches something you set to Skip or Done yourself.
function autoLabel(items) {
  const changes = [];
  for (const it of items) {
    if (it.kind === 'caught') continue;
    const id = it.nodeId, cur = progress[id];
    if (cur === 'skip' || cur === 'done') continue;
    if (live(id) >= 5) { progress[id] = 'done'; journal.auto[id] = true; changes.push([id, 'done']); }
    else if (!cur) { progress[id] = 'learning'; journal.auto[id] = true; changes.push([id, 'learning']); }
  }
  saveP();
  return changes;
}

// ---------------------------------------------------------------- sessions
const realSessions = () => journal.sessions.filter(s => !s.sample);
const hasSample = () => journal.sessions.some(s => s.sample);
function upsertSession(date, fields = {}) {
  let s = journal.sessions.find(x => x.date === date && !x.sample);
  if (!s) {
    s = { id: uid(), date, type: 'gi', minutes: 60, rounds: 0, feel: null, notes: '', items: [], said: [], created: Date.now() };
    journal.sessions.push(s);
  }
  Object.assign(s, fields);
  return s;
}
function addItems(s, items) {
  for (const it of items) {
    const same = s.items.find(x => x.nodeId === it.nodeId && x.kind === it.kind);
    if (same) same.count += it.count; else s.items.push({ id: uid(), nodeId: it.nodeId, kind: it.kind, count: it.count });
  }
}
function itemSummary(s, max = 3) {
  const parts = s.items.filter(i => i.kind !== 'class').map(i => `${NODES.get(i.nodeId)?.t || '?'}${i.count > 1 ? ' ×' + i.count : ''}${i.kind === 'caught' ? ' (caught)' : ''}`);
  if (!parts.length) return s.notes ? s.notes.split('\n')[0] : 'No techniques logged';
  return parts.slice(0, max).join(' · ') + (parts.length > max ? ` · +${parts.length - max} more` : '');
}

function commit() {
  saveJ(); computeStats(); renderAll();
}

// ---------------------------------------------------------------- toast
let toastTimer = 0;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) $('button', t).onclick = () => { undo(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 3200);
}

// ---------------------------------------------------------------- sheets
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stack = [];
function openSheet({ title = '', left, right, render, onClose, label }) {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `<div class="sheet-scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title)}"><div class="sheet-grab" aria-hidden="true"></div><header class="sheet-nav"><div class="sn-l"></div><h2>${esc(title)}</h2><div class="sn-r"></div></header><div class="sheet-body"></div></section>`;
  $('#sheets').append(layer);
  const sheet = { layer, el: $('.sheet', layer), body: $('.sheet-body', layer), onClose, returnFocus: document.activeElement };
  const mk = (cfg, where) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'nav-btn' + (cfg.strong ? ' strong' : ''); b.textContent = cfg.label;
    b.onclick = () => cfg.action(sheet);
    $(where, layer).append(b);
    return b;
  };
  if (left) sheet.leftBtn = mk(left, '.sn-l');
  sheet.rightBtn = mk(right || { label: 'Done', strong: true, action: () => closeSheet(sheet) }, '.sn-r');
  $('.sheet-scrim', layer).onclick = () => closeSheet(sheet);
  stack.push(sheet);
  document.documentElement.classList.add('has-sheet');
  sheet.render = () => render(sheet.body, sheet);
  sheet.render();
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));
  dragToDismiss(sheet);
  setTimeout(() => { const f = $('[data-autofocus]', sheet.el) || sheet.rightBtn; f && f.focus({ preventScroll: true }); }, reduced.matches ? 0 : 380);
  return sheet;
}
function closeSheet(sheet = stack[stack.length - 1]) {
  if (!sheet || !stack.includes(sheet)) return;
  stack.splice(stack.indexOf(sheet), 1);
  sheet.layer.classList.remove('open');
  sheet.el.style.transform = '';
  setTimeout(() => sheet.layer.remove(), reduced.matches ? 0 : 400);
  if (!stack.length) document.documentElement.classList.remove('has-sheet');
  sheet.onClose && sheet.onClose();
  if (sheet.returnFocus && document.contains(sheet.returnFocus)) sheet.returnFocus.focus({ preventScroll: true });
}
function dragToDismiss(sheet) {
  const handle = [$('.sheet-grab', sheet.el), $('.sheet-nav', sheet.el)];
  let startY = null, dy = 0, t0 = 0;
  const down = e => {
    if (e.target.closest('button')) return;
    startY = e.clientY; dy = 0; t0 = performance.now();
    sheet.el.classList.add('dragging');
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = e => { if (startY == null) return; dy = Math.max(0, e.clientY - startY); sheet.el.style.transform = `translateY(${dy}px)`; };
  const up = () => {
    if (startY == null) return;
    sheet.el.classList.remove('dragging');
    const fast = dy / (performance.now() - t0) > 0.6;
    if (dy > 120 || (fast && dy > 40)) closeSheet(sheet); else sheet.el.style.transform = '';
    startY = null;
  };
  handle.forEach(h => { h.addEventListener('pointerdown', down); h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); });
}
document.addEventListener('keydown', e => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { closeSheet(top); return; }
  if (e.key === 'Tab') {
    const f = $$('button, a[href], input, textarea, select, [tabindex="0"]', top.el).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});

// ---------------------------------------------------------------- roadmap
const wide = matchMedia('(min-width: 960px)');

function nodeSub(n) {
  const s = stat(n.id);
  const bits = [];
  if (s.lastClass && daysBetween(s.lastClass, today()) <= 7) bits.push(`<span class="badge-class">Technique of the day ${esc(relDay(s.lastClass))}</span>`);
  if (n.o) bits.push('Optional');
  if (n.g) bits.push('Gi');
  if (s.caught) bits.push(`Caught by it ${s.caught}×`);
  if (s.drill) bits.push(`Drilled ${s.drill}×`);
  return bits.join(' · ');
}
function nodeRow(n, extraSub) {
  const st = progress[n.id] || 'none';
  const sub = [extraSub, nodeSub(n)].filter(Boolean).join(' · ');
  const hits = live(n.id);
  return `<div class="row node-row" data-row="${n.id}" data-status="${st}">
    <button type="button" class="status" data-cycle="${n.id}" data-status="${st}" aria-label="${esc(n.t)}: ${st === 'none' ? 'not started' : STATUS_LABEL[st]}. Tap to change."><span class="dot"></span></button>
    <button type="button" class="row-main" data-open="${n.id}">
      <span class="rtext"><span class="rt">${esc(n.t)}</span>${sub ? `<span class="rs">${sub}</span>` : ''}</span>
      ${hits ? `<span class="count" aria-label="hit ${hits} times">${hits}</span>` : ''}${ICON.chev}
    </button>
  </div>`;
}

function renderRoadmap() {
  const q = window.BJJParser.norm($('#search').value || '');
  const b = BELTS.find(x => x.id === ui.belt) || BELTS[0];
  const body = $('#roadmap-body');
  $('#belt-seg').hidden = !!q;
  $('#belt-seg').innerHTML = seg('belt', BELTS.map(x => [x.id, x.name.replace(' belt', '')]), b.id, 'Belt');
  $('#roadmap-content').classList.toggle('wide', wide.matches && !q);

  if (q) {
    const hits = kidsFirst.filter(n => n.kind === 'kid' && SEARCH_TEXT.get(n.id).includes(q));
    body.innerHTML = hits.length
      ? `<div class="group-header">${hits.length} result${hits.length > 1 ? 's' : ''}</div><div class="group">${hits.map(n => nodeRow(n, `${n.belt.name} · ${NODES.get(n.parent).t}`)).join('')}</div>`
      : `<div class="group" style="margin-top:20px"><div class="empty"><b>No techniques found</b>Try another name, like “kimura” or “dlr”.</div></div>`;
    return;
  }

  const { done, total } = tally(n => n.belt.id === b.id);
  const card = `<div class="group" style="margin-top:16px"><div class="belt-card" data-belt="${b.id}">
      ${beltGfx(b.id)}
      <div><h3>${esc(b.name)}</h3><p>${esc(b.tag)}</p></div>
      <div class="belt-meta"><span>${esc(b.time)}</span><span><b>${done}</b> of ${total} done</span></div>
    </div></div>`;

  if (wide.matches) {
    body.innerHTML = card + `<div class="flow-legend"><span><i></i>Core</span><span><i class="opt"></i>Optional</span><span><i class="learn"></i>Learning</span><span><i class="done"></i>Done</span><span>Numbers show live hits from your log</span></div>
      <div class="flow" data-belt="${b.id}">${b.topics.map(t => {
        const half = Math.ceil(t.kids.length / 2);
        const kid = k => { const h = live(k.id); return `<button type="button" class="flow-kid${k.o ? ' opt' : ''}" data-open="${k.id}" data-status="${progress[k.id] || 'none'}"><span class="lbl">${esc(k.t)}</span>${k.g ? '<span class="gi">gi</span>' : ''}${h ? `<span class="n">${h}</span>` : ''}</button>`; };
        return `<div class="flow-row"><svg class="wires" aria-hidden="true"></svg>
          <div class="flow-col left">${t.kids.slice(0, half).map(kid).join('')}</div>
          <div class="flow-col mid"><button type="button" class="flow-topic" data-open="${t.id}">${esc(t.t)}</button></div>
          <div class="flow-col right">${t.kids.slice(half).map(kid).join('')}</div></div>`;
      }).join('')}</div>`;
    scheduleWires();
  } else {
    body.innerHTML = card + b.topics.map(t => {
      const tt = tally(n => n.parent === t.id);
      return `<button type="button" class="topic-head" data-open="${t.id}" data-belt="${b.id}"><span class="belt-dot"></span><span class="tt">${esc(t.t)}</span><span class="tc">${tt.done}/${tt.total}</span>${ICON.chev}</button>
        <div class="group">${t.kids.map(k => nodeRow(NODES.get(k.id))).join('')}</div>`;
    }).join('');
  }
  paintBelts();
}

function drawWires() {
  $$('.flow-row').forEach(row => {
    const svg = $('.wires', row);
    const rb = row.getBoundingClientRect();
    const tb = $('.flow-topic', row).getBoundingClientRect();
    const y1 = tb.top + tb.height / 2 - rb.top;
    let d = '';
    const curve = (x1, x2, y2) => { const mx = (x1 + x2) / 2; d += `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`; };
    $$('.flow-col.left .flow-kid', row).forEach(k => { const b = k.getBoundingClientRect(); curve(tb.left - rb.left, b.right - rb.left, b.top + b.height / 2 - rb.top); });
    $$('.flow-col.right .flow-kid', row).forEach(k => { const b = k.getBoundingClientRect(); curve(tb.right - rb.left, b.left - rb.left, b.top + b.height / 2 - rb.top); });
    svg.innerHTML = `<path d="${d}"/>`;
  });
}
let wireRaf = 0;
const scheduleWires = () => { cancelAnimationFrame(wireRaf); wireRaf = requestAnimationFrame(drawWires); };
new ResizeObserver(() => { if (wide.matches) scheduleWires(); }).observe(document.body);
wide.addEventListener('change', () => renderRoadmap());
$('#search').addEventListener('input', () => renderRoadmap());

// ---------------------------------------------------------------- node sheet
function openNode(id) {
  openSheet({ title: '', label: NODES.get(id).t, render: (body, sheet) => renderNode(body, sheet, id) });
}
function renderNode(body, sheet, id) {
  const n = NODES.get(id);
  const s = stat(id);
  const st = progress[id] || 'none';
  const topic = n.parent ? NODES.get(n.parent) : null;
  const tags = [n.kind === 'topic' ? 'Topic' : (n.o ? 'Optional' : 'Core'), n.s ? 'Submission' : null, n.g ? 'Gi only' : null].filter(Boolean).join(' · ');
  const statRows = [['hit', s.hit], ['escape', s.escape], ['caught', s.caught], ['drill', s.drill], ['class', s.class]].filter(([, v]) => v);
  const df = n.df && BY_TITLE.get(n.df);
  const q = encodeURIComponent(`bjj ${n.t}${n.g ? ' gi' : ''}`);
  body.innerHTML = `
    <div class="nd-head">${beltGfx(n.belt.id, 'sm')}<span>${esc(n.belt.name)}${topic ? ' · ' + esc(topic.t) : ''}</span></div>
    <h2 class="nd-title">${esc(n.t)}</h2>
    <p class="nd-tags">${tags}</p>
    <div class="group"><div class="cell-text">${esc(n.d)}</div></div>
    ${n.c ? `<div class="group"><div class="cell-text"><small>Coaching cue</small><b>${esc(n.c)}</b></div></div>` : ''}
    <div class="group-header">Status</div>
    <div class="pad">${seg('status', [['none', 'Not yet'], ['learning', 'Learning'], ['done', 'Done'], ['skip', 'Skip']], st, 'Status')}</div>
    ${journal.auto[id] ? `<p class="group-footer">Set automatically from your log${st === 'done' ? ' after five live hits' : ''}.</p>` : ''}
    <div class="group-header">Log it for today</div>
    <div class="pad quick">
      <button type="button" class="btn tinted small" data-quick="hit">+ Hit it live</button>
      <button type="button" class="btn tinted small" data-quick="caught">+ Got caught</button>
      <button type="button" class="btn tinted small" data-quick="drill">+ Drilled it</button>
      <button type="button" class="btn tinted small" data-quick="class">Technique of the day</button>
    </div>
    <div class="group-header">Your log</div>
    <div class="group">${statRows.length ? statRows.map(([k, v]) => `<div class="row"><span class="kind-dot ${KINDS[k].cls}"></span><span class="rtext rt">${KINDS[k].long}</span><span class="rv">${k === 'class' ? (v > 1 ? v + ' classes' : 'once') : v + '×'}</span></div>`).join('') + `<div class="row"><span class="rtext rt">Last logged</span><span class="rv">${esc(fmtLong(s.last))}</span></div>`
      : `<div class="empty" style="padding:18px 16px">Nothing logged yet.</div>`}</div>
    ${df ? `<div class="group-header">When it catches you</div><div class="group"><button type="button" class="row" data-open="${df}"><span class="rtext"><span class="rt">${esc(NODES.get(df).t)}</span><span class="rs">The defence to study</span></span>${ICON.chev}</button></div>` : ''}
    ${n.kind === 'topic' ? `<div class="group-header">In this topic</div><div class="group">${n.kids.map(k => nodeRow(NODES.get(k.id))).join('')}</div>` : ''}
    <div class="group" style="margin-top:20px"><a class="row link" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener"><span class="rtext rt">Search videos on YouTube</span>${ICON.ext}</a></div>`;
  paintBelts();

  $('[data-seg="status"]', body).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setStatus(id, b.dataset.v); computeStats(); renderAll(); sheet.render();
  });
  $$('[data-quick]', body).forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.quick;
    const s = upsertSession(today());
    const before = JSON.stringify(s.items);
    const prevStatus = progress[id], prevAuto = journal.auto[id];
    addItems(s, [{ nodeId: id, kind, count: 1 }]);
    computeStats();
    const changes = autoLabel([{ nodeId: id, kind }]);
    commit(); sheet.render();
    const what = kind === 'class' ? `${n.t} is today's technique of the day` : `Logged ${KINDS[kind].long.toLowerCase()} for ${n.t}`;
    toast(what + (changes.length ? `. Now ${STATUS_LABEL[changes[0][1]]}.` : '.'), () => {
      s.items = JSON.parse(before);
      if (!s.items.length && !s.notes && !s.said.length) journal.sessions.splice(journal.sessions.indexOf(s), 1);
      if (changes.length) { if (prevStatus) progress[id] = prevStatus; else delete progress[id]; if (prevAuto) journal.auto[id] = true; else delete journal.auto[id]; saveP(); }
      commit(); if (stack.includes(sheet)) sheet.render();
    });
  }));
}

// ---------------------------------------------------------------- picker
function openPicker(onPick, title = 'Choose technique') {
  openSheet({ title, left: { label: 'Cancel', action: s => closeSheet(s) }, right: { label: '', action: () => {} }, render: (body, sheet) => {
    sheet.rightBtn.hidden = true;
    body.innerHTML = `<label class="search" style="margin-top:4px"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m10.8 10.8 3.7 3.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input type="search" placeholder="Search techniques" data-autofocus aria-label="Search techniques"></label><div class="pick-list"></div>`;
    const list = $('.pick-list', body);
    const draw = () => {
      const q = window.BJJParser.norm($('input', body).value);
      list.innerHTML = BELTS.map(b => {
        const rows = b.topics.flatMap(t => [NODES.get(t.id), ...t.kids.map(k => NODES.get(k.id))]).filter(n => !q || SEARCH_TEXT.get(n.id).includes(q));
        return rows.length ? `<div class="group-header">${esc(b.name)}</div><div class="group">${rows.map(n => `<button type="button" class="row" data-pick="${n.id}"><span class="rtext"><span class="rt">${esc(n.t)}</span><span class="rs">${n.kind === 'topic' ? 'Whole topic' : esc(NODES.get(n.parent).t)}</span></span></button>`).join('')}</div>` : '';
      }).join('') || `<div class="group" style="margin-top:20px"><div class="empty">No techniques match.</div></div>`;
    };
    draw();
    $('input', body).addEventListener('input', draw);
    list.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { closeSheet(sheet); onPick(b.dataset.pick); } });
  } });
}

// ---------------------------------------------------------------- log sheet
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function openLog(opts = {}) {
  const date0 = opts.date || today();
  const existing = journal.sessions.find(x => x.date === date0 && !x.sample);
  const last = realSessions().sort((a, b) => b.date.localeCompare(a.date))[0];
  const st = {
    date: date0, text: opts.text || '', overrides: {}, manual: [], resolved: {}, open: null,
    type: existing?.type || last?.type || 'gi', minutes: existing?.minutes ?? last?.minutes ?? 60,
    rounds: existing?.rounds ?? 0, feel: existing?.feel ?? null, notes: existing?.notes || '',
  };
  let rec = null;
  let B = null; // sheet body, set on first render
  const sheet = openSheet({
    title: 'Log training',
    left: { label: 'Cancel', action: s => closeSheet(s) },
    right: { label: 'Save', strong: true, action: () => save() },
    onClose: () => { try { rec && rec.stop(); } catch (e) {} },
    render: body => {
      B = body;
      body.innerHTML = `
        <div class="group log-input" style="margin-top:6px">
          <textarea class="field" id="log-text" data-autofocus rows="5" placeholder="What happened on the mat?" aria-label="What happened on the mat">${esc(st.text)}</textarea>
          ${SR ? `<button type="button" class="mic" id="log-mic" aria-label="Dictate">${ICON.mic}</button>` : ''}
        </div>
        <p class="group-footer">Say it how you'd text a friend: “hit knee on belly 3 times, omoplata'd 1 person, technique of the day was the knee cut”. Dictating works too: tap the mic on your keyboard.</p>
        <div id="log-preview"></div>
        <div class="group-header">Session</div>
        <div class="group">
          <div class="row"><span class="rtext rt">Date</span><input class="date-input" type="date" id="log-date" value="${st.date}" max="${today()}"></div>
          <div class="row" style="display:block">${seg('type', TYPES, st.type, 'Session type')}</div>
          <div class="row"><span class="rtext rt">Duration</span><span class="rv" id="v-min">${st.minutes} min</span><span class="stepper"><button type="button" data-step="minutes" data-d="-15" aria-label="Shorter">−</button><button type="button" data-step="minutes" data-d="15" aria-label="Longer">+</button></span></div>
          <div class="row"><span class="rtext rt">Rounds rolled</span><span class="rv" id="v-rounds">${st.rounds || '—'}</span><span class="stepper"><button type="button" data-step="rounds" data-d="-1" aria-label="Fewer rounds">−</button><button type="button" data-step="rounds" data-d="1" aria-label="More rounds">+</button></span></div>
        </div>
        <p class="group-footer" id="log-merge"></p>
        <div class="group-header">How did it feel?</div>
        <div class="pad">${seg('feel', FEELS.map((f, i) => [i + 1, f]), st.feel, 'How it felt')}</div>
        <div class="group-header">Notes</div>
        <div class="group"><textarea class="field" id="log-notes" rows="4" placeholder="Questions for your coach, what to work on next…" aria-label="Notes">${esc(st.notes)}</textarea></div>`;
      const ta = $('#log-text', body);
      let t = 0;
      ta.addEventListener('input', () => { st.text = ta.value; clearTimeout(t); t = setTimeout(preview, 120); });
      $('#log-notes', body).addEventListener('input', e => { st.notes = e.target.value; });
      $('#log-date', body).addEventListener('change', e => {
        if (!e.target.value) return;
        st.date = e.target.value;
        const ex = journal.sessions.find(x => x.date === st.date && !x.sample);
        if (ex) { st.type = ex.type; st.minutes = ex.minutes; st.rounds = ex.rounds; st.feel = ex.feel; st.notes = ex.notes; stack[stack.length - 1].render(); }
        else mergeNote();
      });
      $$('[data-step]', body).forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.step, d = +b.dataset.d;
        st[k] = Math.max(0, Math.min(k === 'minutes' ? 600 : 60, (st[k] || 0) + d));
        $('#v-min', body).textContent = st.minutes + ' min';
        $('#v-rounds', body).textContent = st.rounds || '—';
      }));
      body.addEventListener('click', e => {
        const sb = e.target.closest('[data-seg] button'); if (!sb) return;
        const group = sb.parentElement, name = group.dataset.seg;
        if (name === 'type') st.type = sb.dataset.v;
        else if (name === 'feel') st.feel = String(st.feel) === sb.dataset.v ? null : +sb.dataset.v;
        else return;
        $$('button', group).forEach(x => x.setAttribute('aria-pressed', String(name === 'type' ? x.dataset.v === st.type : +x.dataset.v === st.feel)));
      });
      const mic = $('#log-mic', body);
      if (mic) mic.addEventListener('click', () => {
        if (rec) { try { rec.stop(); } catch (e) {} return; }
        try {
          rec = new SR();
          rec.lang = navigator.language || 'en-US';
          rec.interimResults = true;
          const base = ta.value ? ta.value.replace(/\s*$/, '') + ', ' : '';
          rec.onresult = ev => { ta.value = base + [...ev.results].map(r => r[0].transcript).join(' '); st.text = ta.value; preview(); };
          rec.onerror = () => toast("Voice input isn't available here. Use the mic on your keyboard.");
          rec.onend = () => { rec = null; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Dictate'); };
          rec.start();
          mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop dictating');
        } catch (e) { rec = null; toast("Voice input isn't available here. Use the mic on your keyboard."); }
      });
      preview(); mergeNote();
    },
  });

  function mergeNote() {
    const ex = journal.sessions.find(x => x.date === st.date && !x.sample);
    const el = B && $('#log-merge', B);
    if (el) el.textContent = ex ? `Adds to your ${relDay(st.date) === 'today' ? 'session today' : 'session on ' + fmtLong(st.date)}.` : '';
  }

  function currentItems() {
    const { items, unmatched } = parser.parse(st.text);
    const out = [];
    for (const it of items) {
      const key = `${it.nodeId}|${it.kind}`;
      const ov = st.overrides[key] || {};
      if (ov.removed) continue;
      out.push({ key, nodeId: ov.nodeId || it.nodeId, kind: ov.kind || it.kind, count: ov.count ?? it.count, phrase: it.phrase });
    }
    st.manual.forEach((m, i) => { const ov = st.overrides['m' + i] || {}; if (!ov.removed) out.push({ key: 'm' + i, nodeId: ov.nodeId || m.nodeId, kind: ov.kind || m.kind, count: ov.count ?? m.count, manual: true }); });
    return { items: out, unmatched: unmatched.filter(u => !st.resolved[u]) };
  }

  function preview() {
    const el = B && $('#log-preview', B);
    if (!el) return;
    const { items, unmatched } = currentItems();
    const rows = items.map(it => {
      const n = NODES.get(it.nodeId);
      const k = KINDS[it.kind];
      const row = `<button type="button" class="row" data-edit="${it.key}" aria-expanded="${st.open === it.key}"><span class="kind-dot ${k.cls}"></span><span class="rtext"><span class="rt">${esc(n.t)}</span><span class="rs">${it.kind === 'class' ? 'Technique of the day' : `${k.long} ×${it.count}`}${it.phrase && window.BJJParser.norm(n.t) !== it.phrase ? ` · from “${esc(it.phrase)}”` : ''}</span></span>${ICON.chev}</button>`;
      if (st.open !== it.key) return row;
      return row + `<div class="row-edit">
        ${seg('kind', Object.entries(KINDS).map(([v, o]) => [v, o.label]), it.kind, 'What happened')}
        ${it.kind === 'class' ? '' : `<div class="edit-line"><span>${k.long} <b>${it.count}×</b></span><span class="stepper"><button type="button" data-cnt="-1" aria-label="One less">−</button><button type="button" data-cnt="1" aria-label="One more">+</button></span></div>`}
        <div class="edit-actions"><button type="button" class="btn tinted small" data-change>Change technique</button><button type="button" class="btn small" style="color:var(--red)" data-remove>Remove</button></div>
      </div>`;
    }).join('');
    const um = unmatched.map(u => `<div class="row unmatched"><span class="rtext"><span class="rt">“${esc(u)}”</span><span class="rs">Not a technique, kept in your notes</span></span><button type="button" class="btn tinted small" data-resolve="${esc(u)}">Pick one</button></div>`).join('');
    el.innerHTML = (items.length || unmatched.length ? `<div class="group-header"><span>${items.length ? `This will log ${items.length} item${items.length > 1 ? 's' : ''}` : 'Nothing recognised yet'}</span><span>Tap to fix</span></div>` : '<div class="group-header">Techniques</div>')
      + `<div class="group">${rows}${um}<button type="button" class="row link" data-add><span class="rtext rt">Add a technique</span></button></div>`;

    el.onclick = e => {
      const edit = e.target.closest('[data-edit]');
      if (edit) { st.open = st.open === edit.dataset.edit ? null : edit.dataset.edit; preview(); return; }
      const cur = items.find(x => x.key === st.open);
      const ov = cur && (st.overrides[cur.key] = st.overrides[cur.key] || {});
      const kb = e.target.closest('[data-seg="kind"] button');
      if (kb && cur) { ov.kind = kb.dataset.v; preview(); return; }
      const cb = e.target.closest('[data-cnt]');
      if (cb && cur) { ov.count = Math.max(1, Math.min(50, cur.count + +cb.dataset.cnt)); preview(); return; }
      if (e.target.closest('[data-remove]') && cur) { ov.removed = true; st.open = null; preview(); return; }
      if (e.target.closest('[data-change]') && cur) { openPicker(id => { ov.nodeId = id; preview(); }); return; }
      const rs = e.target.closest('[data-resolve]');
      if (rs) { const text = rs.dataset.resolve; openPicker(id => { st.resolved[text] = true; st.manual.push({ nodeId: id, kind: 'hit', count: 1 }); st.open = 'm' + (st.manual.length - 1); preview(); }); return; }
      if (e.target.closest('[data-add]')) openPicker(id => { st.manual.push({ nodeId: id, kind: 'hit', count: 1 }); st.open = 'm' + (st.manual.length - 1); preview(); });
    };
  }

  function save() {
    const { items } = currentItems();
    const text = st.text.trim();
    // an empty log still records that you trained that day
    const s = upsertSession(st.date, { type: st.type, minutes: st.minutes, rounds: st.rounds, feel: st.feel, notes: st.notes.trim() });
    addItems(s, items);
    if (text) s.said.push({ text, at: Date.now() });
    s.updated = Date.now();
    computeStats();
    const changes = autoLabel(items);
    commit();
    closeSheet(sheet);
    const n = items.length;
    let msg = n ? `Logged ${n} item${n > 1 ? 's' : ''}` : 'Session saved';
    if (changes.length === 1) msg += `. ${NODES.get(changes[0][0]).t} is now ${STATUS_LABEL[changes[0][1]]}`;
    else if (changes.length > 1) msg += `. ${changes.length} techniques moved forward on your roadmap`;
    toast(msg + '.');
  }
}

// ---------------------------------------------------------------- session sheet
function openSession(id) {
  let confirmDelete = false;
  openSheet({ title: '', label: 'Session', render: (body, sheet) => {
    const s = journal.sessions.find(x => x.id === id);
    if (!s) { closeSheet(sheet); return; }
    const byKind = Object.keys(KINDS).map(k => [k, s.items.filter(i => i.kind === k)]).filter(([, l]) => l.length);
    body.innerHTML = `
      <h2 class="nd-title">${esc(fmtLong(s.date))}</h2>
      <p class="nd-tags">${s.sample ? 'Sample data · ' : ''}${esc(TYPES.find(t => t[0] === s.type)?.[1] || 'Training')}${s.minutes ? ` · ${s.minutes} min` : ''}${s.rounds ? ` · ${s.rounds} rounds` : ''}</p>
      <div class="pad">${seg('type', TYPES, s.type, 'Session type')}</div>
      <div class="group">
        <div class="row"><span class="rtext rt">Duration</span><span class="rv">${s.minutes} min</span><span class="stepper"><button type="button" data-step="minutes" data-d="-15" aria-label="Shorter">−</button><button type="button" data-step="minutes" data-d="15" aria-label="Longer">+</button></span></div>
        <div class="row"><span class="rtext rt">Rounds rolled</span><span class="rv">${s.rounds || '—'}</span><span class="stepper"><button type="button" data-step="rounds" data-d="-1" aria-label="Fewer rounds">−</button><button type="button" data-step="rounds" data-d="1" aria-label="More rounds">+</button></span></div>
      </div>
      <div class="group-header">How it felt</div>
      <div class="pad">${seg('feel', FEELS.map((f, i) => [i + 1, f]), s.feel, 'How it felt')}</div>
      ${byKind.map(([k, list]) => `<div class="group-header">${KINDS[k].long}</div><div class="group">${list.map(i => `<div class="row"><span class="kind-dot ${KINDS[k].cls}"></span><button type="button" class="row-main" data-open="${i.nodeId}"><span class="rtext rt">${esc(NODES.get(i.nodeId)?.t || 'Unknown')}</span>${k === 'class' ? '' : `<span class="rv">${i.count}×</span>`}</button><button type="button" class="nav-btn" style="color:var(--red)" data-del-item="${i.id}" aria-label="Remove ${esc(NODES.get(i.nodeId)?.t || '')}">Remove</button></div>`).join('')}</div>`).join('')}
      <div class="group" style="margin-top:20px"><button type="button" class="row link" data-add-more><span class="rtext rt">Log more for this day</span></button></div>
      ${s.said.length ? `<div class="group-header">What you said</div><div class="group">${s.said.map(x => `<p class="said">“${esc(x.text)}”</p>`).join('')}</div>` : ''}
      <div class="group-header">Notes</div>
      <div class="group"><textarea class="field" rows="5" data-notes placeholder="Add notes" aria-label="Notes">${esc(s.notes)}</textarea></div>
      <div class="group" style="margin-top:28px"><button type="button" class="row danger" data-delete><span class="rtext rt">${confirmDelete ? 'Tap again to delete this session' : 'Delete session'}</span></button></div>`;
    const set = (k, v) => { s[k] = v; s.updated = Date.now(); commit(); sheet.render(); };
    body.onclick = e => {
      const sb = e.target.closest('[data-seg] button');
      if (sb) { const name = sb.parentElement.dataset.seg; if (name === 'type') set('type', sb.dataset.v); if (name === 'feel') set('feel', String(s.feel) === sb.dataset.v ? null : +sb.dataset.v); return; }
      const st = e.target.closest('[data-step]');
      if (st) { const k = st.dataset.step; set(k, Math.max(0, Math.min(k === 'minutes' ? 600 : 60, (s[k] || 0) + +st.dataset.d))); return; }
      const di = e.target.closest('[data-del-item]');
      if (di) { s.items = s.items.filter(i => i.id !== di.dataset.delItem); commit(); sheet.render(); return; }
      if (e.target.closest('[data-add-more]')) { openLog({ date: s.date }); return; }
      if (e.target.closest('[data-delete]')) {
        if (!confirmDelete) { confirmDelete = true; sheet.render(); return; }
        journal.sessions = journal.sessions.filter(x => x.id !== id); commit(); closeSheet(sheet); toast('Session deleted.');
      }
    };
    $('[data-notes]', body).addEventListener('input', e => { s.notes = e.target.value; s.updated = Date.now(); saveJ(); });
    $('[data-notes]', body).addEventListener('blur', () => renderJournal());
  } });
}

// ---------------------------------------------------------------- journal
function weekStats(list) {
  const thisWeek = mondayOf(today());
  const wk = list.filter(s => s.date >= thisWeek && s.date <= today());
  return { n: wk.length, minutes: wk.reduce((a, s) => a + (s.minutes || 0), 0) };
}
function weekStreak(list) {
  const weeks = new Set(list.map(s => mondayOf(s.date)));
  let w = mondayOf(today());
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}
const hours = m => { const h = m / 60; return h >= 10 ? Math.round(h) : Math.round(h * 10) / 10; };

function renderJournal() {
  const body = $('#journal-body');
  const list = [...journal.sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const sample = hasSample() ? `<div class="group" style="margin-bottom:20px"><div class="banner"><span>You're looking at sample data.</span><button type="button" class="nav-btn" style="color:var(--red);min-height:0;padding:0" data-clear-sample>Clear sample</button></div></div>` : '';
  if (!list.length) {
    body.innerHTML = `<div class="group"><div class="empty"><b>No sessions yet</b>After training, tap Log and say what happened. Your journal and insights build from there.</div>
      <div style="display:grid;gap:10px;padding:0 16px 18px"><button type="button" class="btn filled" data-action="log">Log a session</button><button type="button" class="btn tinted" data-load-sample>Try it with sample data</button></div></div>`;
    return;
  }
  const w = weekStats(list);
  let html = sample + `<div class="group"><div class="stats3">
      <div><small>This week</small><b>${w.n}</b><small>${w.n === 1 ? 'session' : 'sessions'}</small></div>
      <div><small>Mat time</small><b>${hours(w.minutes)} h</b><small>this week</small></div>
      <div><small>Streak</small><b>${weekStreak(list)}</b><small>weeks</small></div>
    </div></div>`;
  let month = '';
  let open = false;
  for (const s of list) {
    const m = fmt(s.date, { month: 'long', year: 'numeric' });
    if (m !== month) { if (open) html += '</div>'; html += `<div class="group-header">${esc(m)}</div><div class="group">`; month = m; open = true; }
    const totd = s.items.find(i => i.kind === 'class');
    const meta = [TYPES.find(t => t[0] === s.type)?.[1], s.minutes ? s.minutes + ' min' : null, s.feel ? FEELS[s.feel - 1] : null].filter(Boolean).join(' · ');
    html += `<button type="button" class="row session-row" style="--inset:72px" data-session="${s.id}">
      <span class="date-box"><small>${esc(fmt(s.date, { weekday: 'short' }))}</small><b>${parseD(s.date).getDate()}</b></span>
      <span class="rtext"><span class="rt">${esc(meta)}</span><span class="rs">${esc(itemSummary(s))}</span>${totd ? `<span class="rs totd">Technique of the day: ${esc(NODES.get(totd.nodeId)?.t)}</span>` : ''}</span>${ICON.chev}</button>`;
  }
  if (open) html += '</div>';
  body.innerHTML = html;
}

// ---------------------------------------------------------------- insights
function periodBounds() {
  const end = today();
  if (ui.period === 'all') {
    const first = journal.sessions.reduce((a, s) => (!a || s.date < a ? s.date : a), null) || end;
    return { start: first, end, days: daysBetween(first, end) + 1, label: 'all your sessions', prev: null };
  }
  const days = +ui.period;
  const start = addDays(end, -(days - 1));
  return { start, end, days, label: `the last ${days} days`, prev: { start: addDays(start, -days), end: addDays(start, -1) } };
}
function aggregate(sessions) {
  const by = new Map();
  for (const s of sessions) for (const it of s.items) {
    let r = by.get(it.nodeId); if (!r) by.set(it.nodeId, r = { id: it.nodeId, hit: 0, caught: 0, escape: 0, drill: 0, class: 0 });
    r[it.kind] += it.count;
  }
  return [...by.values()];
}
const inRange = (s, a, b) => s.date >= a && s.date <= b;
const perWeek = (n, days) => Math.round(n / Math.max(1, days / 7) * 10) / 10;
const tw = n => n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;

function buildInsights(P, inP, prevP) {
  const out = [];
  const agg = aggregate(inP);
  const name = id => NODES.get(id).t;
  // leak
  const leak = agg.filter(r => r.caught >= 2).sort((a, b) => b.caught - a.caught)[0];
  if (leak) {
    const df = NODES.get(leak.id).df && BY_TITLE.get(NODES.get(leak.id).df);
    out.push({ icon: 'shield', c: 'var(--c-red)', title: NODES.get(leak.id).s ? `${name(leak.id)} has caught you ${tw(leak.caught)}` : `${name(leak.id)} got past you ${tw(leak.caught)}`, body: df ? `Spend a few rounds on ${name(df)} this week.` : 'Ask your coach to walk you through the defence.', open: df || leak.id });
  }
  // best weapon
  const subs = agg.filter(r => NODES.get(r.id).s && r.hit >= 2).sort((a, b) => b.hit - a.hit)[0];
  const any = agg.filter(r => r.hit + r.escape >= 3).sort((a, b) => (b.hit + b.escape) - (a.hit + a.escape))[0];
  if (subs) out.push({ icon: 'target', c: 'var(--c-green)', title: `${name(subs.id)} is your best finish`, body: `${subs.hit} finishes in ${P.label}.`, open: subs.id });
  else if (any) out.push({ icon: 'target', c: 'var(--c-green)', title: `${name(any.id)} is working`, body: `You hit it ${tw(any.hit + any.escape)} in ${P.label}.`, open: any.id });
  // class carry-over
  const classes = inP.flatMap(s => s.items.filter(i => i.kind === 'class').map(i => ({ id: i.nodeId, date: s.date }))).sort((a, b) => b.date.localeCompare(a.date));
  if (classes[0]) {
    const c = classes[0];
    const since = inP.filter(s => s.date >= c.date).reduce((a, s) => a + s.items.filter(i => i.nodeId === c.id && (i.kind === 'hit' || i.kind === 'escape')).reduce((x, i) => x + i.count, 0), 0);
    out.push(since
      ? { icon: 'book', c: 'var(--c-orange)', title: `${name(c.id)} is sticking`, body: `Technique of the day ${relDay(c.date) === 'today' ? 'today' : 'on ' + fmtShort(c.date)}, and you've hit it ${tw(since)} since.`, open: c.id }
      : { icon: 'book', c: 'var(--c-orange)', title: `Try ${name(c.id)} live`, body: relDay(c.date) === 'today' ? "Today's technique of the day. Go for it in your next rolls while it's fresh." : `It was technique of the day on ${fmtShort(c.date)}. You haven't landed it in rolling since.`, open: c.id });
  }
  // consistency
  const pw = perWeek(inP.length, P.days);
  if (prevP && prevP.length) {
    const pp = perWeek(prevP.length, P.days);
    if (pw !== pp) out.push({ icon: 'cal', c: 'var(--c-blue)', title: `Training ${pw} times a week`, body: `${pw > pp ? 'Up' : 'Down'} from ${pp} in the ${P.days} days before.` });
  } else if (inP.length >= 3) out.push({ icon: 'cal', c: 'var(--c-blue)', title: `Training ${pw} times a week`, body: `${inP.length} sessions in ${P.label}.` });
  // gap
  const lastDate = journal.sessions.reduce((a, s) => (!a || s.date > a ? s.date : a), null);
  if (lastDate && daysBetween(lastDate, today()) >= 7) out.push({ icon: 'clock', c: 'var(--c-gray)', title: `${daysBetween(lastDate, today())} days since your last session`, body: 'Log the next one to restart your streak.' });
  // blind spot + next up, in the belt you're working through
  const belt = BELTS.find(b => b.topics.some(t => t.kids.some(k => !k.o && progress[k.id] !== 'done' && progress[k.id] !== 'skip'))) || BELTS[BELTS.length - 1];
  const touched = new Set(agg.map(r => NODES.get(r.id).parent || r.id));
  const blind = belt.topics.find(t => !touched.has(t.id) && t.kids.some(k => !k.o && progress[k.id] !== 'done'));
  if (blind && inP.length >= 3) out.push({ icon: 'map', c: 'var(--c-indigo)', title: `Nothing from ${blind.t.toLowerCase()} lately`, body: `No ${blind.t.toLowerCase()} in ${P.label}. It's core ${belt.name.toLowerCase()} material.`, open: blind.id });
  const next = belt.topics.flatMap(t => t.kids).find(k => !k.o && !progress[k.id]);
  if (next) out.push({ icon: 'arrow', c: 'var(--c-teal)', title: `Next on your roadmap: ${next.t}`, body: `${NODES.get(NODES.get(next.id).parent).t} · ${belt.name}`, open: next.id });
  // feel
  const feelAvg = l => { const f = l.filter(s => s.feel); return f.length >= 3 ? f.reduce((a, s) => a + s.feel, 0) / f.length : null; };
  const fa = feelAvg(inP), fb = prevP ? feelAvg(prevP) : null;
  if (fa && fb && Math.abs(fa - fb) >= 0.4) out.push({ icon: 'heart', c: 'var(--c-purple)', title: fa > fb ? 'Sessions are feeling better' : 'Sessions are feeling harder', body: `Average feel ${FEELS[Math.round(fa) - 1].toLowerCase()} lately, ${FEELS[Math.round(fb) - 1].toLowerCase()} before.` });
  // gi / no-gi
  const gi = inP.filter(s => s.type === 'gi').length, ng = inP.filter(s => s.type === 'nogi').length;
  if (gi && ng) out.push({ icon: 'split', c: 'var(--c-gray)', title: `${Math.round(gi / (gi + ng) * 100)}% of your classes were gi`, body: `${gi} gi and ${ng} no-gi in ${P.label}.` });
  return out.slice(0, 6);
}

function heatmap() {
  const weeks = 18;
  const thisMon = mondayOf(today());
  const start = addDays(thisMon, -7 * (weeks - 1));
  const byDay = new Map();
  for (const s of journal.sessions) if (s.date >= start) {
    const r = byDay.get(s.date) || { min: 0, list: [] };
    r.min += s.minutes || 60; r.list.push(s); byDay.set(s.date, r);
  }
  let months = '<span></span>';
  let prevM = -1;
  for (let w = 0; w < weeks; w++) {
    const d = parseD(addDays(start, 7 * w));
    months += `<span class="m">${d.getMonth() !== prevM ? esc(d.toLocaleDateString(undefined, { month: 'short' })) : ''}</span>`;
    prevM = d.getMonth();
  }
  let cells = '';
  const dayNames = ['M', '', 'W', '', 'F', '', ''];
  for (let r = 0; r < 7; r++) {
    cells += `<span class="d">${dayNames[r]}</span>`;
    for (let w = 0; w < weeks; w++) {
      const ds = addDays(start, 7 * w + r);
      const v = byDay.get(ds);
      const lvl = !v ? 0 : v.min <= 45 ? 1 : v.min <= 75 ? 2 : v.min <= 105 ? 3 : 4;
      const future = ds > today();
      const tip = future ? '' : v ? `${fmt(ds, { weekday: 'short', day: 'numeric', month: 'short' })} · ${v.list.map(s => TYPES.find(t => t[0] === s.type)?.[1]).join(' + ')} · ${v.min} min` : `${fmt(ds, { weekday: 'short', day: 'numeric', month: 'short' })} · rest day`;
      cells += `<span class="c${future ? ' future' : ''}${ds === today() ? ' today' : ''}" data-l="${lvl}"${tip ? ` data-tip="${esc(tip)}"` : ''}${v ? ` data-day="${ds}"` : ''}></span>`;
    }
  }
  return `<div class="heat" role="img" aria-label="Training calendar, last ${weeks} weeks">${months}${cells}</div>
    <div class="heat-legend"><span>Tap a day for details</span><span class="scale">Less <i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i> More</span></div>`;
}

function bars(rows, color, unit) {
  const max = Math.max(...rows.map(r => r.v), 1);
  return `<div class="group bars">${rows.map(r => `<button type="button" class="row" data-open="${r.id}" aria-label="${esc(NODES.get(r.id).t)}: ${r.v} ${unit}"><span class="rt">${esc(NODES.get(r.id).t)}</span><span class="rv">${r.v}</span><span class="bar"><i style="width:${Math.max(4, r.v / max * 100)}%;--bc:${color}"></i></span></button>`).join('')}</div>`;
}

function renderInsights() {
  const body = $('#insights-body');
  const P = periodBounds();
  const inP = journal.sessions.filter(s => inRange(s, P.start, P.end));
  const prevP = P.prev ? journal.sessions.filter(s => inRange(s, P.prev.start, P.prev.end)) : null;
  const periodSeg = `<div class="pad">${seg('period', [[30, '30 days'], [90, '90 days'], ['all', 'All time']], ui.period, 'Period')}</div>`;
  const dataGroup = `<div class="group-header">Your data</div><div class="group">
      <button type="button" class="row link" data-export><span class="rtext rt">Export a backup</span></button>
      <button type="button" class="row link" data-import><span class="rtext rt">Restore from a backup</span></button>
      ${hasSample() ? '<button type="button" class="row link" data-clear-sample><span class="rtext rt">Clear sample data</span></button>' : '<button type="button" class="row link" data-load-sample><span class="rtext rt">Load sample data</span></button>'}
      <button type="button" class="row danger" data-reset><span class="rtext rt">${resetArmed ? 'Tap again to erase everything' : 'Erase all progress and sessions'}</span></button>
    </div><p class="group-footer">Everything is stored on this device only. Export a backup before you switch phones.</p><div id="import-confirm"></div>`;
  const beltsGroup = `<div class="group-header">Roadmap</div><div class="group">${BELTS.map(b => { const t = tally(n => n.belt.id === b.id); return `<div class="row belt-row">${beltGfx(b.id)}<span class="rtext rt">${esc(b.name)}</span><span class="rv">${t.done}/${t.total}</span></div>`; }).join('')}</div>`;

  if (!journal.sessions.length) {
    body.innerHTML = `<div class="group"><div class="empty"><b>Insights appear as you log</b>Log a few sessions and this page shows what you finish with, what catches you and how consistent you've been.</div>
      <div style="display:grid;gap:10px;padding:0 16px 18px"><button type="button" class="btn filled" data-action="log">Log a session</button><button type="button" class="btn tinted" data-load-sample>Preview with sample data</button></div></div>` + beltsGroup + dataGroup;
    paintBelts();
    return;
  }

  const minutes = inP.reduce((a, s) => a + (s.minutes || 0), 0);
  const agg = aggregate(inP);
  const finishes = agg.filter(r => NODES.get(r.id).s).reduce((a, r) => a + r.hit, 0);
  const caught = agg.reduce((a, r) => a + r.caught, 0);
  const streak = weekStreak(journal.sessions);
  const ins = buildInsights(P, inP, prevP);
  const topHits = agg.filter(r => r.hit + r.escape).map(r => ({ id: r.id, v: r.hit + r.escape })).sort((a, b) => b.v - a.v).slice(0, 6);
  const topCaught = agg.filter(r => r.caught).map(r => ({ id: r.id, v: r.caught })).sort((a, b) => b.v - a.v).slice(0, 5);
  const classes = inP.flatMap(s => s.items.filter(i => i.kind === 'class').map(i => ({ id: i.nodeId, date: s.date }))).sort((a, b) => b.date.localeCompare(a.date)).filter((c, i, a) => a.findIndex(x => x.id === c.id) === i).slice(0, 5);

  body.innerHTML = (hasSample() ? `<div class="group" style="margin-bottom:16px"><div class="banner"><span>You're looking at sample data.</span><button type="button" class="nav-btn" style="color:var(--red);min-height:0;padding:0" data-clear-sample>Clear sample</button></div></div>` : '')
    + periodSeg
    + `<div class="tiles" style="margin-top:16px">
      <div class="tile"><small>Sessions</small><b>${inP.length}</b><span class="sub">${perWeek(inP.length, P.days)} a week</span></div>
      <div class="tile"><small>Mat time</small><b>${hours(minutes)}<span>h</span></b><span class="sub">${inP.length ? Math.round(minutes / inP.length) : 0} min average</span></div>
      <div class="tile"><small>Week streak</small><b>${streak}</b><span class="sub">${streak === 1 ? 'week' : 'weeks'} in a row</span></div>
      <div class="tile"><small>Finishes</small><b>${finishes}</b><span class="sub">caught ${tw(caught)}</span></div>
    </div>`
    + `<div class="group-header">Training calendar</div><div class="group heat-card">${heatmap()}</div>`
    + (ins.length ? `<div class="group-header">What stands out</div><div class="group">${ins.map(i => `<${i.open ? `button type="button" data-open="${i.open}"` : 'div'} class="row ins" style="--inset:58px;align-items:flex-start"><span class="ins-icon" style="--ic:${i.c}">${ICON[i.icon]}</span><span class="rtext"><span class="rt">${esc(i.title)}</span><span class="rs">${esc(i.body)}</span></span>${i.open ? ICON.chev : ''}</${i.open ? 'button' : 'div'}>`).join('')}</div>` : '')
    + (topHits.length ? `<div class="group-header">What you hit most</div>${bars(topHits, 'var(--c-green)', 'times')}` : '')
    + (topCaught.length ? `<div class="group-header">What catches you</div>${bars(topCaught, 'var(--c-red)', 'times')}` : '')
    + (classes.length ? `<div class="group-header">Recent techniques of the day</div><div class="group">${classes.map(c => { const s = stat(c.id); return `<button type="button" class="row" data-open="${c.id}"><span class="kind-dot k-class"></span><span class="rtext"><span class="rt">${esc(NODES.get(c.id).t)}</span><span class="rs">${esc(fmtShort(c.date))} · hit live ${tw(s.hit)}</span></span>${ICON.chev}</button>`; }).join('')}</div>` : '')
    + beltsGroup + dataGroup;
  paintBelts();
}

// heatmap tooltip
document.addEventListener('pointerover', e => {
  const c = e.target.closest('.heat .c[data-tip]');
  const card = c && c.closest('.heat-card');
  $$('.tip').forEach(t => t.remove());
  if (!c) return;
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.textContent = c.dataset.tip;
  const cb = card.getBoundingClientRect(), r = c.getBoundingClientRect();
  tip.style.left = Math.min(cb.width - 90, Math.max(90, r.left - cb.left + r.width / 2)) + 'px';
  tip.style.top = (r.top - cb.top) + 'px';
  card.append(tip);
});

// ---------------------------------------------------------------- sample data
function sampleData() {
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const T = t => BY_TITLE.get(t);
  const hitsPool = ['Knee on belly', 'Side control pressure', 'Armbar from guard', 'Triangle choke', 'Kimura from guard', 'Americana', 'Knee cut', 'Toreando', 'Back control', 'Rear naked choke', 'Hip bump sweep', 'Scissor sweep', 'Mount', 'Omoplata'];
  const caughtPool = ['Rear naked choke', 'Rear naked choke', 'Triangle choke', 'Guillotine', 'Arm triangle', 'Knee cut'];
  const classPool = ['Knee cut', 'Hip bump sweep', 'Triangle choke', 'Mount escape: trap and roll', 'Double leg', 'Butterfly guard', 'Omoplata', 'Back escape', 'Toreando', 'Americana'];
  const notes = ['Felt slow on the feet. Ask coach about grips.', 'Good rounds with the blue belts. Kept my elbows tight.', 'Knee cut finally clicking: control the far arm first.', 'Gassed in round 4. More sleep this week.', ''];
  const sessions = [];
  for (let back = 62; back >= 0; back--) {
    const date = addDays(today(), -back);
    const dow = parseD(date).getDay();
    if (![1, 3, 5, 6].includes(dow) || rnd() < 0.3) continue;
    const type = dow === 3 ? 'nogi' : dow === 6 ? 'open' : 'gi';
    const items = [];
    const add = (t, kind, count) => { const id = T(t); if (!id) return; const same = items.find(i => i.nodeId === id && i.kind === kind); if (same) same.count += count; else items.push({ id: uid(), nodeId: id, kind, count }); };
    if (type !== 'open') add(pick(classPool), 'class', 1);
    for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) add(pick(hitsPool), 'hit', 1 + Math.floor(rnd() * 3));
    if (rnd() < 0.6) add(pick(caughtPool), 'caught', 1 + Math.floor(rnd() * 2));
    if (rnd() < 0.4) add(pick(['Mount', 'Side control']), 'escape', 1 + Math.floor(rnd() * 2));
    if (rnd() < 0.3) add(pick(classPool), 'drill', 10);
    sessions.push({ id: uid(), sample: true, date, type, minutes: pick([60, 75, 90, 90]), rounds: 3 + Math.floor(rnd() * 4), feel: 2 + Math.floor(rnd() * 4), notes: pick(notes), items, said: [], created: Date.now() });
  }
  return sessions;
}

// ---------------------------------------------------------------- data management
let resetArmed = false, resetTimer = 0;
function exportData() {
  const data = JSON.stringify({ app: 'bjj-roadmap', version: 1, exported: new Date().toISOString(), progress, journal }, null, 2);
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `bjj-roadmap-backup-${today()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {}
  if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => toast('Backup downloaded and copied to the clipboard.'), () => toast('Backup downloaded.'));
  else toast('Backup downloaded.');
}
$('#import-file').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  f.text().then(txt => {
    let d;
    try { d = JSON.parse(txt); } catch (err) { toast("That file isn't a backup from this app."); return; }
    if (!d || d.app !== 'bjj-roadmap' || !d.journal || !Array.isArray(d.journal.sessions)) { toast("That file isn't a backup from this app."); return; }
    const box = $('#import-confirm');
    box.innerHTML = `<div class="group" style="margin-top:16px"><div class="cell-text">Replace everything on this device with the backup from ${esc(new Date(d.exported).toLocaleDateString())}? It has ${d.journal.sessions.length} sessions.</div><div style="display:flex;gap:10px;padding:0 16px 14px"><button type="button" class="btn filled small" data-import-yes>Replace</button><button type="button" class="btn tinted small" data-import-no>Cancel</button></div></div>`;
    $('[data-import-yes]', box).onclick = () => { progress = d.progress || {}; journal = d.journal; journal.auto = journal.auto || {}; saveP(); commit(); toast('Backup restored.'); };
    $('[data-import-no]', box).onclick = () => { box.innerHTML = ''; };
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
});

// ---------------------------------------------------------------- global clicks
document.addEventListener('click', e => {
  const t = e.target;
  const cyc = t.closest('[data-cycle]');
  if (cyc) {
    const id = cyc.dataset.cycle;
    const next = cycleStatus(id);
    renderAll();
    const top = stack[stack.length - 1]; if (top) top.render();
    toast(`${NODES.get(id).t}: ${next ? STATUS_LABEL[next] : 'not started'}.`);
    return;
  }
  const open = t.closest('[data-open]');
  if (open) { openNode(open.dataset.open); return; }
  const sess = t.closest('[data-session]');
  if (sess) { openSession(sess.dataset.session); return; }
  const tab = t.closest('.tab[data-tab]');
  if (tab) { switchTab(tab.dataset.tab); return; }
  if (t.closest('[data-action="log"]')) { openLog(); return; }
  const segb = t.closest('[data-seg="belt"] button, [data-seg="period"] button');
  if (segb) {
    const name = segb.parentElement.dataset.seg;
    if (name === 'belt') { ui.belt = segb.dataset.v; renderRoadmap(); }
    else { ui.period = segb.dataset.v === 'all' ? 'all' : +segb.dataset.v; renderInsights(); }
    saveUI(); return;
  }
  if (t.closest('[data-load-sample]')) { journal.sessions.push(...sampleData()); commit(); toast('Sample data loaded. Clear it any time.'); return; }
  if (t.closest('[data-clear-sample]')) { journal.sessions = journal.sessions.filter(s => !s.sample); commit(); toast('Sample data cleared.'); return; }
  if (t.closest('[data-export]')) { exportData(); return; }
  if (t.closest('[data-import]')) { $('#import-file').click(); return; }
  if (t.closest('[data-reset]')) {
    if (!resetArmed) { resetArmed = true; renderInsights(); clearTimeout(resetTimer); resetTimer = setTimeout(() => { resetArmed = false; renderInsights(); }, 4000); return; }
    resetArmed = false; clearTimeout(resetTimer);
    progress = {}; journal = { sessions: [], auto: {} }; saveP(); commit(); toast('Everything erased.');
  }
});

// ---------------------------------------------------------------- tabs + nav bars
const scrollPos = {};
function switchTab(name) {
  if (name === ui.tab) { window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }); return; }
  scrollPos[ui.tab] = window.scrollY;
  ui.tab = name; saveUI();
  showTab();
  window.scrollTo(0, scrollPos[name] || 0);
}
function showTab() {
  $$('.screen').forEach(s => { s.hidden = s.dataset.tab !== ui.tab; });
  $$('.tab[data-tab]').forEach(b => { if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (ui.tab === 'roadmap' && wide.matches) scheduleWires();
  updateNav();
}
function updateNav() {
  const scr = $(`.screen[data-tab="${ui.tab}"]`);
  if (!scr) return;
  const nav = $('.navbar', scr), lt = $('.large-title', scr);
  nav.classList.toggle('compact', lt.getBoundingClientRect().bottom <= nav.getBoundingClientRect().bottom);
}
let navRaf = 0;
addEventListener('scroll', () => { cancelAnimationFrame(navRaf); navRaf = requestAnimationFrame(updateNav); }, { passive: true });

function renderAll() { renderRoadmap(); renderJournal(); renderInsights(); }

// ---------------------------------------------------------------- boot
computeStats();
renderAll();
showTab();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => wide.matches && scheduleWires());
})();
