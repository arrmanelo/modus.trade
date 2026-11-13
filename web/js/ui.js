/* Модус Сигнал — базовые UI-утилиты (без зависимостей) */
(function () {
  'use strict';
  const MS = (window.MS = window.MS || {});
  MS.views = MS.views || {};
  MS.state = MS.state || { boot: null, me: null, counts: {}, nowBase: 0, fetchedAt: 0 };

  // ---------- DOM ----------
  function add(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false || c === true) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  function h(tag, attrs) {
    const kids = Array.prototype.slice.call(arguments, 2);
    const el = document.createElement(tag);
    let value;
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'trustedHtml') el.innerHTML = v; // ТОЛЬКО для статичных констант в коде; пользовательские данные — только текстом
        else if (k === 'html') throw new Error('h(): атрибут html запрещён, используйте текст');
        else if (k === 'value') value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    add(el, kids);
    if (value !== undefined) el.value = value;
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el) { const kids = Array.prototype.slice.call(arguments, 1); clear(el); add(el, kids); return el; }

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    up: '<path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    signal: '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/>',
    board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    feed: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  };
  function icon(name, size) {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + (ICONS[name] || '') + '</svg>';
    return t.content.firstChild;
  }

  // ---------- форматирование ----------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  function fDate(ts) { if (!ts) return '—'; const d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function fShort(ts) { const d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); }
  function fTime(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fDT(ts) { return ts ? fDate(ts) + ', ' + fTime(ts) : '—'; }
  function plural(n, a, b, c) { const m = Math.abs(n) % 100, k = m % 10; if (m > 10 && m < 20) return c; if (k > 1 && k < 5) return b; if (k === 1) return a; return c; }
  function num(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d }); }
  function pct(x) { return x == null || isNaN(x) ? '—' : Math.round(x * 100) + '%'; }
  function hours(hh) { if (hh == null || isNaN(hh)) return '—'; if (hh < 48) return num(hh, 1) + ' ч'; return num(hh / 24, 1) + ' дн.'; }
  function span(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return m + ' мин';
    const hh = Math.round(m / 60);
    if (hh < 36) return hh + ' ' + plural(hh, 'час', 'часа', 'часов');
    const d = Math.round(hh / 24);
    return d + ' ' + plural(d, 'день', 'дня', 'дней');
  }
  function rel(ts) {
    if (!ts) return '—';
    const diff = MS.now() - ts;
    if (diff < 0) return 'через ' + span(diff);
    if (diff < 60000) return 'только что';
    if (diff < 86400000 * 7) return span(diff) + ' назад';
    return fDate(ts);
  }
  function dueText(due) {
    if (!due) return '';
    const diff = due - MS.now();
    return diff >= 0 ? 'осталось ' + span(diff) : 'просрочено на ' + span(diff);
  }
  function toInputDate(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromInputDate(s) { if (!s) return null; const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 18, 0, 0).getTime(); }
  function size(b) { if (b < 1024) return b + ' Б'; if (b < 1048576) return Math.round(b / 1024) + ' КБ'; return num(b / 1048576, 1) + ' МБ'; }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

  // ---------- справочники ----------
  MS.now = function () { const s = MS.state; return s.nowBase ? s.nowBase + (Date.now() - s.fetchedAt) : Date.now(); };
  function find(list, id) { return (list || []).find((x) => x.id === id) || null; }
  MS.user = (id) => find(MS.state.boot && MS.state.boot.users, id);
  MS.cat = (id) => find(MS.state.boot && MS.state.boot.categories, id);
  MS.group = (id) => find(MS.state.boot && MS.state.boot.groups, id);
  MS.dept = (id) => find(MS.state.boot && MS.state.boot.departments, id);
  MS.deptName = (id) => (id === 'anon' ? 'Анонимно' : (MS.dept(id) || {}).name || '—');
  MS.catName = (id) => (MS.cat(id) || {}).name || '—';
  MS.groupName = (id) => (MS.group(id) || {}).name || '—';
  MS.label = (map, key) => { const b = MS.state.boot; const m = b && b[map]; const v = m && m[key]; return (v && (v.label || v)) || key; };

  const AV_COLORS = ['#5E9FE8', '#E0A93B', '#5DAE80', '#B07FD0', '#DE8A48', '#D9739C', '#43A9B9', '#E06B5E'];
  function avatar(name, small) {
    const n = name || '?';
    let hsh = 0; for (let i = 0; i < n.length; i++) hsh = (hsh * 31 + n.charCodeAt(i)) >>> 0;
    const ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return h('span', { class: 'avatar' + (small ? ' sm' : ''), style: { background: n === 'Анонимно' ? '#9B9A97' : AV_COLORS[hsh % AV_COLORS.length] }, 'aria-hidden': 'true' }, n === 'Анонимно' ? '?' : ini);
  }

  // ---------- бейджи ----------
  const TYPE_TONE = { problem: 't-orange', idea: 't-blue', praise: 't-green' };
  const TYPE_ICON = { problem: 'alert', idea: 'bulb', praise: 'heart' };
  const STATUS_TONE = { new: 't-blue', review: 't-purple', clarify: 't-orange', progress: 't-yellow', done: 't-green', rejected: 't-red', closed: 't-gray' };
  function statusBadge(s) { return h('span', { class: 'badge ' + (STATUS_TONE[s] || 't-gray') }, h('span', { class: 'dot' }), MS.label('statuses', s)); }
  function typeBadge(t) { return h('span', { class: 'badge ' + (TYPE_TONE[t] || '') }, icon(TYPE_ICON[t] || 'info', 14), MS.label('types', t)); }
  function prioBadge(p) { return h('span', { class: 'badge ' + (p === 'high' ? 't-red' : 't-gray'), title: 'Приоритет' }, (p === 'high' ? '▲ ' : p === 'low' ? '▽ ' : '') + MS.label('priorities', p)); }
  const SLA_LABEL = { first: 'первый ответ', decision: 'решение', implementation: 'реализация', paused: 'ждём автора' };
  function deadlineChip(a) {
    if (a.mergedInto) return h('span', { class: 'badge t-gray' }, icon('merge', 13), 'объединено');
    if (a.overdue) return h('span', { class: 'badge t-red', title: 'Срок: ' + fDT(a.overdue.due) }, icon('clock', 13), 'Просрочено: ' + SLA_LABEL[a.overdue.kind]);
    const d = a.deadline;
    if (!d) return null;
    if (d.kind === 'paused') return h('span', { class: 'badge t-orange' }, icon('clock', 13), 'Пауза: ждём автора');
    if (!d.due) return null;
    const left = d.due - MS.now();
    return h('span', { class: 'badge ' + (left < 86400000 ? 't-orange' : 't-gray'), title: fDT(d.due) }, icon('clock', 13), SLA_LABEL[d.kind] + ' до ' + fShort(d.due));
  }

  // ---------- toast / modal ----------
  let toastBox;
  function toast(text, kind) {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast' + (kind === 'err' ? ' err' : '') }, text);
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3200);
  }
  function modal(opts) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
      const close = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const err = h('div', { class: 'callout red hidden' });
      const okBtn = h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), type: 'submit' }, opts.ok || 'Сохранить');
      const form = h('form', { class: 'modal', onsubmit: async (e) => {
        e.preventDefault();
        if (!opts.onOk) return close(true);
        okBtn.disabled = true;
        try { const r = await opts.onOk(); if (r !== false) close(r === undefined ? true : r); }
        catch (ex) { err.textContent = ex.message || String(ex); err.classList.remove('hidden'); }
        finally { okBtn.disabled = false; }
      } },
      h('div', { class: 'row between nw' }, h('h2', null, opts.title || ''), h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Закрыть', onclick: () => close(null) }, icon('x'))),
      opts.body || null, err,
      opts.hideActions ? null : h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, opts.cancel || 'Отмена'), okBtn));
      ov.appendChild(form);
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      const f = form.querySelector('textarea, input, select'); (f || okBtn).focus();
    });
  }
  function field(label, control, hint, required) {
    return h('div', { class: 'field' }, label ? h('label', { class: required ? 'req' : null }, label) : null, control, hint ? h('div', { class: 'hint' }, hint) : null);
  }
  function select(options, value, attrs) {
    return h('select', Object.assign({ class: 'input' }, attrs || {}), options.map((o) => o.group
      ? h('optgroup', { label: o.group }, o.items.map((i) => h('option', { value: i.value, selected: String(i.value) === String(value) }, i.label)))
      : h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  }
  function seg(options, value, onChange) {
    const box = h('div', { class: 'seg', role: 'group' });
    options.forEach((o) => box.appendChild(h('button', { type: 'button', 'aria-pressed': String(o.value === value), class: o.value === value ? 'on' : null, onclick: (ev) => { box.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); ev.currentTarget.classList.add('on'); ev.currentTarget.setAttribute('aria-pressed', 'true'); onChange(o.value); } }, o.label)));
    return box;
  }
  function empty(text, extra, ic) { return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic || 'inbox', 26)), h('div', { class: 'empty-t' }, text), extra || null); }
  function loading() { return h('div', { class: 'loading' }, 'Загрузка…'); }

  function readFiles(fileList) {
    return Promise.all(Array.from(fileList).map((f) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(r.result).split(',')[1] || '' });
      r.onerror = () => rej(new Error('Не удалось прочитать файл ' + f.name));
      r.readAsDataURL(f);
    })));
  }

  MS.ui = { h, add, clear, mount, icon, fDate, fShort, fTime, fDT, plural, num, pct, hours, span, rel, dueText, toInputDate, fromInputDate, size, debounce,
    avatar, statusBadge, typeBadge, prioBadge, deadlineChip, SLA_LABEL, TYPE_ICON, toast, modal, field, select, seg, empty, loading, readFiles };
})();
