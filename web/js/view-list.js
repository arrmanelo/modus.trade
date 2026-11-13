/* Списки обращений: мои, входящие, реестр, идеи коллег */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;

  // ---------- общие части (используются и в других экранах) ----------
  function supportButton(a, onChange) {
    const can = !a.mine && !a.mergedInto && !['done', 'rejected', 'closed'].includes(a.status);
    const btn = h('button', { type: 'button', class: 'support-btn' + (a.supportedByMe ? ' on' : ''), disabled: !can,
      title: a.mine ? 'Это ваше обращение' : can ? (a.supportedByMe ? 'Отменить поддержку' : 'Поддержать: «меня это тоже касается»') : 'Поддержка закрыта',
      onclick: async (e) => {
        e.stopPropagation(); e.preventDefault();
        btn.disabled = true;
        try {
          const r = await api.post('/appeals/' + a.id + '/support');
          a.supportedByMe = r.result.supported; a.supportersCount = r.result.count;
          btn.classList.toggle('on', a.supportedByMe); cnt.textContent = a.supportersCount;
          U.toast(a.supportedByMe ? 'Вы поддержали ' + a.id : 'Поддержка отменена');
          if (onChange) onChange(r);
        } catch (ex) { U.toast(ex.message, 'err'); }
        finally { btn.disabled = false; }
      } }, icon('up', 15));
    const cnt = h('span', null, a.supportersCount || 0);
    btn.appendChild(cnt);
    return btn;
  }
  function resultLine(a) {
    if (a.mergedInto) return h('div', { class: 'result-line' }, icon('merge', 14), ' Объединено с ' + a.mergedInto);
    if (a.status === 'done' && a.result) return h('div', { class: 'result-line tx-green' }, 'Результат: ' + cut(a.result, 140));
    if (a.status === 'rejected' && a.rejection) return h('div', { class: 'result-line' }, 'Причина отказа: ' + cut(a.rejection, 140));
    if (a.status === 'progress' && a.decision) return h('div', { class: 'result-line' }, 'Решение: ' + cut(a.decision, 140) + (a.dueDate ? ' · до ' + U.fDate(a.dueDate) : ''));
    if (a.status === 'closed' && a.closingNote) return h('div', { class: 'result-line' }, cut(a.closingNote, 140));
    return null;
  }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function metaLine(a, scope, noCat) {
    const parts = noCat ? [] : [MS.catName(a.categoryId)];
    if (scope !== 'mine') parts.push(a.authorLabel + (a.authorDepartmentId ? ' (' + MS.deptName(a.authorDepartmentId) + ')' : ''));
    return parts.join(' · ');
  }
  function catTone(a) {
    const c = MS.cat(a.categoryId) || {}; const key = c.groupId || a.categoryId || '';
    let x = 0; for (let i = 0; i < key.length; i++) x = (x * 31 + key.charCodeAt(i)) >>> 0;
    return 'var(--c' + (1 + (x % 8)) + ')';
  }
  function catChip(a) {
    if (!a.categoryId) return null;
    return h('span', { class: 'cat-chip' }, h('i', { style: { background: catTone(a) } }), MS.catName(a.categoryId));
  }
  function appealCard(a, scope) {
    return h('a', { class: 'a-card', href: '#/appeal/' + a.id, style: { borderLeftColor: catTone(a) } },
      h('div', { class: 'row' }, h('span', { class: 'id' }, a.id), U.typeBadge(a.type), U.statusBadge(a.status), a.priority === 'high' ? U.prioBadge(a.priority) : null),
      h('div', { class: 'ttl' }, a.title),
      h('div', { class: 'row nw small muted' }, catChip(a), h('span', { class: 'clamp1' }, metaLine(a, scope, true))),
      resultLine(a),
      h('div', { class: 'row', style: { marginTop: '8px' } }, U.deadlineChip(a), a.assignee && scope !== 'feed' ? h('span', { class: 'small muted' }, '→ ' + a.assignee.name) : null, h('span', { class: 'grow' }),
        h('span', { class: 'small muted' }, U.fDate(a.createdAt)), scope === 'feed' ? supportButton(a) : (a.supportersCount ? h('span', { class: 'small muted' }, icon('up', 14), ' ' + a.supportersCount) : null)));
  }
  function appealTable(items, scope) {
    const staffish = scope === 'assigned' || scope === 'all';
    const head = ['ID', 'Обращение', 'Тип', 'Статус', scope === 'feed' ? null : 'Срок', scope === 'feed' ? null : 'Ответственный', 'Создано', scope === 'feed' ? 'Поддержка' : ''].filter(Boolean);
    return h('div', { class: 'table-wrap cards-on-mobile' }, h('table', { class: 'tbl rf-ticket-table rf-refined-ticket-table' },
      h('thead', null, h('tr', null, head.map((t) => h('th', { class: t === '' ? 'num' : null, title: t === '' ? 'Поддержали коллеги' : null }, t)))),
      h('tbody', null, items.map((a) => h('tr', { class: 'click rf-ticket-row' + (a.overdue ? ' rf-is-overdue' : ''), onclick: () => MS.go('/appeal/' + a.id) },
        h('td', null, h('a', { class: 'id', href: '#/appeal/' + a.id, onclick: (e) => e.stopPropagation() }, a.id)),
        h('td', { class: 'title-cell' }, h('div', null, a.title, a.priority === 'high' ? h('span', { class: 'badge t-red', style: { marginLeft: '6px' } }, '▲ высокий') : null),
          h('div', { class: 'muted' }, metaLine(a, scope)), resultLine(a)),
        h('td', null, U.typeBadge(a.type)),
        h('td', null, U.statusBadge(a.status)),
        scope === 'feed' ? null : h('td', null, U.deadlineChip(a) || h('span', { class: 'muted small' }, '—')),
        scope === 'feed' ? null : h('td', { class: 'small' }, a.assignee ? a.assignee.name : '—', staffish && a.assignee ? h('div', { class: 'muted' }, a.assignee.position) : null),
        h('td', { class: 'small nowrap' }, U.fDate(a.createdAt)),
        scope === 'feed' ? h('td', null, supportButton(a)) : h('td', { class: 'num small' }, a.supportersCount || ''))))));
  }
  MS.parts = Object.assign(MS.parts || {}, { supportButton, resultLine, appealCard, appealTable, cut });

  // ---------- экран списка ----------
  const META = {
    mine: { title: 'Мои обращения', sub: 'Статус, ответы и результат по каждому вашему обращению', status: '' },
    assigned: { title: 'Входящие', sub: 'Обращения, за которые вы отвечаете, а также эскалированные вам', status: 'open', sort: 'due' },
    all: { title: 'Реестр обращений', sub: 'Все доступные вам обращения: поиск, фильтры, выгрузка', status: '' },
    feed: { title: 'Идеи и проблемы коллег', sub: 'Публичные обращения. Поддержите важное — так ответственные видят, скольких людей это касается', status: 'open', sort: 'support' },
  };
  const SORTS = [{ value: 'new', label: 'Сначала новые' }, { value: 'old', label: 'Сначала старые' }, { value: 'updated', label: 'По обновлению' }, { value: 'due', label: 'По ближайшему сроку' }, { value: 'priority', label: 'По приоритету' }, { value: 'support', label: 'По поддержке' }];

  MS.views.list = async function (el, params, alive) {
    const scope = params.scope; const meta = META[scope];
    const MODE_KEY = 'modus.listmode.' + scope;
    let mode = localStorage.getItem(MODE_KEY) || (scope === 'mine' || scope === 'feed' ? 'cards' : 'table');
    const b = MS.state.boot; const caps = MS.app.caps();
    const staffScope = scope === 'assigned' || scope === 'all';
    const q = Object.assign({ status: meta.status, sort: meta.sort || 'new' }, params.query);
    const results = h('div');
    const countEl = h('span', { class: 'muted small' });

    const opt = (obj) => Object.keys(obj).map((k) => ({ value: k, label: obj[k].label }));
    const statusSel = U.select([{ value: '', label: 'Все статусы' }, { value: 'open', label: 'Открытые' }, { value: 'final', label: 'Завершённые' }].concat(opt(b.statuses)), q.status, { class: 'input sm', 'aria-label': 'Статус' });
    const typeSel = U.select([{ value: '', label: 'Все типы' }].concat(opt(b.types)), q.type, { class: 'input sm', 'aria-label': 'Тип' });
    const catOpts = [{ value: '', label: 'Все темы' }].concat(b.groups.map((g) => ({ group: g.name, items: [{ value: 'g:' + g.id, label: 'Все: ' + g.name }].concat(b.categories.filter((c) => c.groupId === g.id).map((c) => ({ value: c.id, label: c.name }))) })));
    const catSel = U.select(catOpts, q.cat || '', { class: 'input sm', 'aria-label': 'Тема' });
    const deptSel = staffScope ? U.select([{ value: '', label: 'Все подразделения' }, { value: 'anon', label: 'Анонимные' }].concat(b.departments.map((d) => ({ value: d.id, label: d.name }))), q.dept || '', { class: 'input sm', 'aria-label': 'Подразделение автора' }) : null;
    const asgSel = scope === 'all' ? U.select([{ value: '', label: 'Любой ответственный' }].concat(b.users.filter((u) => u.role !== 'employee').map((u) => ({ value: u.id, label: u.name }))), q.asg || '', { class: 'input sm', 'aria-label': 'Ответственный' }) : null;
    const prioSel = staffScope ? U.select([{ value: '', label: 'Любой приоритет' }].concat(opt(b.priorities)), q.prio || '', { class: 'input sm', 'aria-label': 'Приоритет' }) : null;
    const sortSel = U.select(SORTS, q.sort, { class: 'input sm', 'aria-label': 'Сортировка' });
    const overdueCb = h('input', { type: 'checkbox', checked: q.overdue === '1' });
    const search = h('input', { class: 'input sm search', type: 'search', placeholder: 'Поиск по номеру, тексту, автору…', value: q.q || '', 'aria-label': 'Поиск' });

    function collect() {
      q.status = statusSel.value; q.type = typeSel.value; q.cat = catSel.value; q.sort = sortSel.value; q.q = search.value.trim();
      if (deptSel) q.dept = deptSel.value; if (asgSel) q.asg = asgSel.value; if (prioSel) q.prio = prioSel.value;
      q.overdue = overdueCb.checked ? '1' : '';
      MS.setQuery(q);
    }
    async function load() {
      mountResults(U.loading());
      const cat = q.cat || '';
      const query = { scope, status: q.status, type: q.type, priority: q.prio, sort: q.sort, q: q.q, overdue: q.overdue, departmentId: q.dept, assigneeId: q.asg,
        categoryId: cat && !cat.startsWith('g:') ? cat : '', groupId: cat.startsWith('g:') ? cat.slice(2) : '', limit: 300 };
      const r = await api.get('/appeals', query);
      if (!alive()) return;
      MS.app.afterAction(r);
      countEl.textContent = 'Найдено: ' + r.total;
      if (!r.items.length) {
        const filtered = q.q || q.type || q.cat || q.dept || q.asg || q.prio || q.overdue || (q.status && q.status !== meta.status);
        mountResults(U.empty(filtered ? 'По выбранным фильтрам ничего не найдено' : scope === 'mine' ? 'Вы ещё не подавали обращений' : 'Здесь пока пусто',
          filtered ? h('p', null, h('button', { class: 'btn sm', type: 'button', onclick: resetFilters }, 'Сбросить фильтры')) : scope === 'mine' ? h('p', null, h('a', { class: 'btn primary', href: '#/new' }, icon('plus'), 'Подать обращение')) : null));
        return;
      }
      const awaiting = scope === 'mine' ? r.items.filter((a) => a.status === 'clarify') : [];
      mountResults(
        awaiting.length ? h('div', { class: 'callout orange', style: { marginBottom: '12px' } }, icon('message'), h('div', null, h('b', null, 'Нужно ваше уточнение: '), awaiting.map((a, i) => [i ? ', ' : '', h('a', { href: '#/appeal/' + a.id }, a.id + ' «' + cut(a.title, 60) + '»')]), '. Срок на паузе, пока вы не ответите.')) : null,
        mode === 'cards' ? null : appealTable(r.items, scope),
        h('div', { class: 'list-cards' + (mode === 'cards' ? ' grid-on' : '') }, r.items.map((a) => appealCard(a, scope))),
        r.total > r.items.length ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Показаны первые ' + r.items.length + ' — уточните фильтры') : null);
    }
    function mountResults() { U.mount(results, Array.prototype.slice.call(arguments)); }
    function onChange() { collect(); load().catch((e) => mountResults(h('div', { class: 'callout red' }, e.message))); }
    function resetFilters() {
      statusSel.value = meta.status; typeSel.value = ''; catSel.value = ''; search.value = ''; overdueCb.checked = false;
      if (deptSel) deptSel.value = ''; if (asgSel) asgSel.value = ''; if (prioSel) prioSel.value = '';
      onChange();
    }
    [statusSel, typeSel, catSel, deptSel, asgSel, prioSel, sortSel, overdueCb].forEach((s) => s && s.addEventListener('change', onChange));
    search.addEventListener('input', U.debounce(onChange, 300));

    const quick = scope === 'assigned' ? U.seg([{ value: 'open', label: 'Открытые' }, { value: 'new', label: 'Новые' }, { value: 'overdue', label: 'Просроченные' }, { value: 'clarify', label: 'Ждут автора' }, { value: 'final', label: 'Завершённые' }],
      q.overdue === '1' ? 'overdue' : q.status || 'open', (v) => { overdueCb.checked = v === 'overdue'; statusSel.value = v === 'overdue' ? 'open' : v; onChange(); }) : null;

    U.mount(el,
      h('div', { class: 'rf-page-heading' }, h('div', null, h('h1', null, meta.title), h('p', null, meta.sub)),
        h('div', { class: 'row' },
          U.seg([{ value: 'cards', label: [icon('board', 14), ' Карточки'] }, { value: 'table', label: [icon('list', 14), ' Таблица'] }], mode, (v) => { mode = v; localStorage.setItem(MODE_KEY, v); onChange(); }),
          scope === 'all' && caps.analytics ? h('button', { class: 'btn', type: 'button', onclick: () => { collect(); const cat = q.cat || ''; api.downloadCsv({ status: q.status, type: q.type, categoryId: cat && !cat.startsWith('g:') ? cat : '', groupId: cat.startsWith('g:') ? cat.slice(2) : '', departmentId: q.dept, assigneeId: q.asg, overdue: q.overdue, q: q.q }).catch((e) => U.toast(e.message, 'err')); } }, icon('download'), 'Выгрузить CSV') : null,
          scope === 'mine' || scope === 'feed' ? h('a', { class: 'btn primary', href: '#/new' }, icon('plus'), 'Новое обращение') : null)),
      quick ? h('div', { style: { marginBottom: '12px' } }, quick) : null,
      h('div', { class: 'filters rf-panel rf-filters' }, search, statusSel, typeSel, catSel, deptSel, asgSel, prioSel, sortSel,
        h('label', { class: 'check small', style: { alignItems: 'center' } }, overdueCb, 'Только просроченные'),
        h('span', { class: 'grow' }), countEl),
      results);
    await load();
  };
})();
