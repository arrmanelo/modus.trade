/* Доска изменений «Вы предложили — мы сделали» и центр уведомлений */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;

  function stat(k, v, sub) { return h('div', { class: 'kpi main' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 's' }, sub) : null); }

  MS.views.board = async function (el, params, alive) {
    U.mount(el, U.loading());
    const r = await api.get('/board');
    if (!alive()) return;
    const s = r.stats;
    const col = (title, sub, items, emptyText) => h('div', { class: 'stack' },
      h('div', null, h('h2', { style: { margin: 0 } }, title), h('div', { class: 'small muted' }, sub)),
      items.length ? h('div', { class: 'stack' }, items.map((a) => MS.parts.appealCard(a, 'feed'))) : U.empty(emptyText));
    U.mount(el,
      h('div', { class: 'page-head rf-page-heading' }, h('div', null, h('h1', null, 'Вы предложили — мы сделали'),
        h('div', { class: 'sub' }, 'Публичная доска изменений: что уже внедрено по обращениям сотрудников и что в работе')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => MS.go('/new') }, icon('plus'), 'Предложить улучшение')),
      h('div', { class: 'kpis' },
        stat('Реализовано', String(s.implemented), 'за 30 дней: ' + s.implemented30),
        stat('В работе', String(s.inProgress), 'с назначенным плановым сроком'),
        stat('Получили ответ', s.answered + ' из ' + s.total, U.pct(s.total ? s.answered / s.total : 0) + ' обращений'),
        stat('Оценка авторов', s.avgRating ? U.num(s.avgRating, 1) + ' / 5' : '—', 'по итогам рассмотрения')),
      h('div', { class: 'grid3' },
        col('Сделано', 'Результат зафиксирован ответственным', r.done, 'Пока нет реализованных изменений'),
        col('В работе', 'Решение принято, идёт реализация', r.progress, 'Ничего не в работе'),
        col('На рассмотрении', 'Поддержите важное — это помогает расставить приоритеты', r.popular || [], 'Все обращения рассмотрены')));
  };

  const KIND_ICON = { created: 'plus', assigned: 'user', status: 'refresh', comment: 'message', escalation: 'alert', overdue: 'clock', rated: 'star', merged: 'merge', supported: 'up', due: 'calendar', info: 'info' };

  MS.views.notifications = async function (el, params, alive) {
    async function load() {
      const r = await api.get('/notifications', { limit: 100 });
      if (!alive()) return;
      if (MS.app.setCounts && r.counts) MS.app.setCounts(r.counts);
      const markAll = h('button', { class: 'btn', type: 'button', disabled: !r.unread, onclick: async () => {
        markAll.disabled = true;
        try { const x = await api.post('/notifications/read', {}); MS.app.afterAction(x); await load(); } catch (e) { U.toast(e.message, 'err'); markAll.disabled = false; }
      } }, icon('check'), 'Отметить все прочитанными');
      const open = async (n) => {
        if (!n.read) { try { const x = await api.post('/notifications/read', { ids: [n.id] }); MS.app.afterAction(x); } catch (e) { /* не мешаем переходу */ } }
        if (n.appealId) MS.go('/appeal/' + n.appealId); else load();
      };
      U.mount(el,
        h('div', { class: 'page-head rf-page-heading' }, h('div', null, h('h1', null, 'Уведомления'),
          h('div', { class: 'sub' }, r.unread ? 'Непрочитанных: ' + r.unread : 'Все уведомления прочитаны')), markAll),
        h('div', { class: 'callout blue', style: { marginBottom: '14px' } }, icon('bell'), h('div', null, 'Те же события уходят сотруднику в Битрикс24 и на почту. ' + (MS.state.boot.app.bitrixLive ? 'Интеграция с Битрикс24 подключена.' : 'В демо отправка имитируется — очередь сообщений видна администратору в разделе «Интеграции».'))),
        r.items.length ? h('div', { class: 'card', style: { padding: 0 } }, r.items.map((n) => h('button', { type: 'button', class: 'notif ' + (n.read ? 'read' : 'unread'), onclick: () => open(n) },
          h('span', { class: 'pip' }), icon(KIND_ICON[n.kind] || 'info', 18),
          h('div', { class: 'grow' }, h('div', null, n.text), h('div', { class: 'small muted' }, (n.appealId ? n.appealId + (n.appealTitle ? ' · ' + n.appealTitle : '') + ' · ' : '') + U.rel(n.at)))))) : U.empty('Уведомлений пока нет'));
    }
    U.mount(el, U.loading());
    await load();
  };
})();
