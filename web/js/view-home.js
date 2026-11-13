/* Главная: дашборд по ролям, оформление по шаблону «Модус Трейд» */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const CLOSED = ['done', 'rejected', 'closed'];

  function firstName(me) { return String(me.name || '').split(' ')[1] || String(me.name || '').split(' ')[0]; }
  function heading(titleA, titleB, sub, actions) {
    return h('div', { class: 'rf-page-heading' },
      h('div', null, h('h1', null, titleA, ' ', h('span', null, titleB)), h('p', null, sub)),
      actions ? h('div', { class: 'rf-heading-actions' }, actions) : null);
  }
  function metric(tone, ic, label, value, unit, note, href) {
    return h(href ? 'a' : 'div', { class: 'rf-metric rf-' + tone, href: href || null },
      h('div', { class: 'rf-metric-top' }, h('span', { class: 'rf-metric-icon' }, icon(ic, 18)), h('span', null, label)),
      h('div', { class: 'rf-metric-value' }, String(value), unit ? h('span', null, ' ' + unit) : null),
      note ? h('div', { class: 'rf-metric-note' }, note) : null);
  }
  function panel(title, link, body, extra) {
    return h('section', { class: 'rf-panel rf-recent-panel' },
      h('div', { class: 'rf-panel-head' }, h('h2', { class: 'rf-panel-title' }, title), extra || null,
        link ? h('a', { class: 'rf-panel-link', href: link.href }, link.label) : null),
      body);
  }
  function ticketTable(items, opts) {
    opts = opts || {};
    if (!items.length) return h('div', { class: 'rf-empty' }, h('b', null, opts.emptyTitle || 'Обращений пока нет'), opts.emptyText ? h('p', null, opts.emptyText) : null);
    return h('div', { class: 'rf-table-wrap' }, h('table', { class: 'rf-ticket-table rf-refined-ticket-table' },
      h('thead', null, h('tr', null, h('th', null, 'Обращение'), h('th', null, 'Статус'), h('th', null, 'Срок'), opts.assignee ? h('th', null, 'Ответственный') : null, h('th', null, 'Создано'), h('th'))),
      h('tbody', null, items.map((a) => h('tr', { class: 'rf-ticket-row' + (a.overdue ? ' rf-is-overdue' : ''), onclick: () => MS.go('/appeal/' + a.id) },
        h('td', null, h('div', { class: 'rf-ticket-subject' },
          h('span', { class: 'rf-type-icon rf-type-' + (a.type === 'problem' ? 'PROBLEM' : 'PROPOSAL') }, icon(a.type === 'problem' ? 'alert' : 'bulb', 16)),
          h('div', null,
            h('div', { class: 'rf-ticket-meta' }, h('span', { class: 'rf-ticket-number' }, a.id), a.overdue ? h('span', { class: 'rf-overdue-label' }, 'Просрочено') : null),
            h('a', { class: 'rf-ticket-title-link', href: '#/appeal/' + a.id, onclick: (e) => e.stopPropagation() }, a.title),
            h('div', { class: 'rf-ticket-category' }, MS.catName(a.categoryId))))),
        h('td', null, U.statusBadge(a.status)),
        h('td', null, U.deadlineChip(a)),
        opts.assignee ? h('td', null, h('div', { class: 'rf-person rf-ticket-assignee' }, a.assigneeName ? [h('span', { class: 'rf-avatar rf-small' }, String(a.assigneeName).split(/\s+/).slice(0, 2).map((w) => w[0]).join('')), h('span', null, a.assigneeName)] : h('span', { class: 'muted' }, 'Не назначен'))) : null,
        h('td', { class: 'rf-ticket-date' }, h('time', null, U.fDate ? U.fDate(a.createdAt) : U.fDT(a.createdAt))),
        h('td', null, h('a', { class: 'rf-row-arrow', href: '#/appeal/' + a.id, 'aria-label': 'Открыть ' + a.id, onclick: (e) => e.stopPropagation() }, icon('back', 16))))))));
  }
  function heroBanner() {
    return h('section', { class: 'rf-hero-banner' },
      h('div', { class: 'rf-hero-text' },
        h('div', { class: 'rf-hero-tag' }, 'Обратная связь сотрудников'),
        h('h2', null, 'От обратной связи —', h('br'), 'к реальным улучшениям.'),
        h('p', null, 'Открытый диалог. Прозрачные решения. Общий результат.'),
        h('a', { class: 'rf-button rf-button-primary', href: '#/new' }, 'Предложить улучшение')),
      h('div', { class: 'rf-hero-visual', 'aria-hidden': 'true' },
        h('div', { class: 'rf-hero-ring' }), h('div', { class: 'rf-hero-ring rf-two' }),
        h('div', { class: 'rf-hero-label rf-one' }, 'Новая идея'), h('div', { class: 'rf-hero-label rf-two' }, 'Воплощаем вместе')));
  }
  function winsList(done) {
    if (!done.length) return h('div', { class: 'rf-empty' }, h('b', null, 'Результатов пока нет'), h('p', null, 'Реализованные обращения появятся здесь.'));
    return h('div', { class: 'rf-wins' }, done.slice(0, 4).map((a) => h('a', { class: 'rf-win', href: '#/appeal/' + a.id },
      h('span', { class: 'rf-metric-icon' }, icon('check', 16)),
      h('div', null, h('b', null, a.title), h('small', null, MS.catName(a.categoryId))))));
  }

  async function employee(el, me, alive) {
    const [mine, board] = await Promise.all([api.get('/appeals', { scope: 'mine', limit: 50 }), api.get('/board')]);
    if (!alive()) return;
    const items = mine.items || [];
    const open = items.filter((a) => !CLOSED.includes(a.status));
    const awaiting = items.filter((a) => a.status === 'clarify');
    const doneN = items.filter((a) => a.status === 'done').length;
    const bs = board.stats || {};
    U.mount(el,
      heading('Каждая идея', 'имеет значение.', 'Здравствуйте, ' + firstName(me) + '. Вот что происходит с вашими обращениями.',
        h('a', { class: 'rf-button rf-button-primary', href: '#/new' }, icon('plus', 16), 'Новое обращение')),
      awaiting.length ? h('div', { class: 'callout orange' }, icon('message'), h('div', null, h('b', null, 'Нужен ваш ответ. '),
        'Ответственный запросил уточнение: ', awaiting.map((a, i) => [i ? ', ' : '', h('a', { href: '#/appeal/' + a.id }, a.id)]))) : null,
      h('section', { class: 'rf-metrics' },
        metric('blue', 'clock', 'В работе', open.length, null, 'Открытые обращения', '#/mine'),
        metric('orange', 'message', 'Ждут ответа', awaiting.length, null, 'Нужно уточнение от вас', '#/mine?status=clarify'),
        metric('mint', 'check', 'Реализовано', doneN, null, 'Ваши обращения', '#/mine?status=done'),
        metric('violet', 'trophy', 'В компании', bs.implemented || 0, null, 'Улучшений внедрено', '#/board')),
      panel('Мои обращения', { href: '#/mine', label: 'Все обращения' }, ticketTable((open.length ? open : items).slice(0, 6), { emptyTitle: 'У вас пока нет обращений', emptyText: 'Первое займёт пару минут.' })),
      heroBanner(),
      panel('Вы сказали — мы сделали', { href: '#/board', label: 'Все результаты' }, winsList(board.done || [])));
  }

  async function manager(el, me, alive) {
    const caps = MS.app.caps();
    const reqs = [api.get('/appeals', { scope: 'assigned', limit: 100 }), api.get('/board')];
    if (caps.analytics) reqs.push(api.get('/analytics', { from: MS.now() - 30 * 86400000 }));
    const [queue, board, an] = await Promise.all(reqs);
    if (!alive()) return;
    const c = MS.state.counts || {};
    const items = (queue.items || []).filter((a) => !CLOSED.includes(a.status));
    const overdue = items.filter((a) => a.overdue);
    const fresh = items.filter((a) => a.status === 'new');
    const attention = overdue.concat(fresh.filter((a) => !a.overdue)).concat(items.filter((a) => !a.overdue && a.status !== 'new')).slice(0, 8);
    const k = an && an.kpi;
    const isAdmin = caps.admin;
    U.mount(el,
      isAdmin ? heading('Важное —', 'на первом плане.', 'Здравствуйте, ' + firstName(me) + '. Оперативная сводка по обращениям.', null)
        : heading('Каждая идея', 'имеет значение.', 'Здравствуйте, ' + firstName(me) + '. Вот что происходит с обращениями.',
          h('a', { class: 'rf-button rf-button-primary', href: '#/inbox' }, icon('inbox', 16), 'Разобрать входящие')),
      h('section', { class: 'rf-metrics' },
        metric('blue', 'inbox', 'Новые', fresh.length, null, 'Ждут первого ответа', '#/inbox'),
        metric('orange', 'clock', 'Просрочено', overdue.length, null, overdue.length ? 'Требуют внимания сегодня' : 'Просрочек нет', '#/inbox?overdue=1'),
        metric('mint', 'check', 'Ответ в срок', k ? U.pct(k.firstResponseOnTimeShare) : '—', null, 'Первый ответ за 30 дней', caps.analytics ? '#/analytics' : null),
        metric('violet', 'star', 'Оценка авторов', k && k.avgRating ? U.num(k.avgRating, 1) : '—', k && k.avgRating ? 'из 5' : null, 'Средняя за 30 дней', caps.analytics ? '#/analytics' : null)),
      c.allOverdue && caps.analytics ? h('div', { class: 'callout red' }, icon('alert'), h('div', null, h('b', null, 'Эскалации. '), 'По подразделениям просрочено ' + c.allOverdue + '. ', h('a', { href: '#/all?overdue=1' }, 'Открыть реестр'))) : null,
      panel(isAdmin ? 'Очередь внимания' : 'Требует внимания', { href: '#/inbox', label: 'Все входящие' }, ticketTable(attention, { assignee: true, emptyTitle: 'Очередь пуста', emptyText: 'Новых обращений нет.' })),
      h('section', { class: 'rf-chart-grid' },
        k ? panel('Темы за 30 дней', { href: '#/analytics', label: 'Подробнее' }, topics(an)) : null,
        panel('Вы сказали — мы сделали', { href: '#/board', label: 'Все' }, winsList(board.done || []))));
  }
  function topics(an) {
    const rows = (an.byGroup || []).filter((g) => g.total).sort((a, b) => b.total - a.total).slice(0, 6);
    const max = Math.max(1, ...rows.map((r) => r.total));
    return h('div', { class: 'rf-topics' }, rows.map((r) => h('a', { class: 'rf-topic', href: '#/all?cat=g:' + r.id },
      h('span', null, r.name), h('span', { class: 'rf-bar' }, h('i', { style: { width: (r.total / max * 100) + '%' } })), h('b', null, r.total))));
  }

  async function handler(el, me, alive) {
    const [queue, board] = await Promise.all([api.get('/appeals', { scope: 'assigned', limit: 200 }), api.get('/board')]);
    if (!alive()) return;
    const all = queue.items || [];
    const open = all.filter((a) => !CLOSED.includes(a.status));
    const now = MS.now();
    const dueOf = (a) => (a.overdue ? a.overdue.due : a.deadline && a.deadline.due) || Infinity;
    const overdue = open.filter((a) => a.overdue);
    const fresh = open.filter((a) => a.status === 'new');
    const clarify = open.filter((a) => a.status === 'clarify');
    const soon = open.filter((a) => !a.overdue && a.deadline && a.deadline.due && a.deadline.due - now < 2 * 86400000);
    const work = open.filter((a) => a.status !== 'clarify').sort((x, y) => (y.overdue ? 1 : 0) - (x.overdue ? 1 : 0) || dueOf(x) - dueOf(y));
    const since = now - 30 * 86400000;
    const decided = all.filter((a) => CLOSED.includes(a.status) && (a.updatedAt || 0) >= since);
    U.mount(el,
      heading('Моя очередь', 'на сегодня.', 'Здравствуйте, ' + firstName(me) + '. Обращения, назначенные вам и переданные по эскалации.',
        h('a', { class: 'rf-button rf-button-primary', href: '#/inbox' }, icon('inbox', 16), 'Открыть входящие')),
      h('section', { class: 'rf-metrics' },
        metric('blue', 'inbox', 'Новые', fresh.length, null, 'Нужен первый ответ', '#/inbox'),
        metric('violet', 'user', 'Ждут автора', clarify.length, null, 'Запрошено уточнение, срок на паузе', null),
        metric('mint', 'clock', 'Срок скоро', soon.length, null, 'Истекает в ближайшие 2 дня', null),
        metric('orange', 'alert', 'Просрочено', overdue.length, null, overdue.length ? 'Уже видно руководителю' : 'Просрочек нет', '#/inbox?overdue=1')),
      overdue.length ? h('div', { class: 'callout red' }, icon('alert'), h('div', null, h('b', null, 'Срок истёк. '), 'Просроченные обращения автоматически уходят руководителю. Дайте ответ или запросите уточнение.')) : null,
      panel('В работе', { href: '#/inbox', label: 'Вся очередь' }, ticketTable(work.slice(0, 10), { emptyTitle: 'Очередь пуста', emptyText: 'Новые обращения появятся здесь автоматически.' })),
      h('section', { class: 'rf-chart-grid' },
        panel('Ждут ответа автора', null, ticketTable(clarify.slice(0, 6), { emptyTitle: 'Уточнений не запрошено' })),
        panel('Решено за 30 дней', { href: '#/board', label: 'Вы сказали — мы сделали' }, decided.length ? ticketTable(decided.slice(0, 6)) : winsList(board.done || []))));
  }

  MS.views.home = async function (el, params, alive) {
    const me = MS.state.me;
    const caps = MS.app.caps();
    if (me.role === 'handler' && !caps.analytics) await handler(el, me, alive);
    else if (caps.handler) await manager(el, me, alive); else await employee(el, me, alive);
  };
})();
