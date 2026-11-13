/* Инструкции и ответы, Эффект сервиса, Помощь до отправки */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;

  function heading(a, b, sub, actions) {
    return h('div', { class: 'rf-page-heading' }, h('div', null, h('h1', null, a, ' ', h('span', null, b)), h('p', null, sub)), actions ? h('div', { class: 'rf-heading-actions' }, actions) : null);
  }
  function paragraphs(text) { return String(text || '').split(/\n+/).filter(Boolean).map((p) => h('p', null, p)); }

  function editor(article, onSaved) {
    const b = MS.state.boot || {};
    const title = h('input', { class: 'input', value: article ? article.title : '', maxlength: '160', placeholder: 'Например: Как подключить VPN из дома' });
    const body = h('textarea', { class: 'input', rows: '8', maxlength: '6000', placeholder: 'Пошаговое решение' }, article ? article.body : '');
    const cat = U.select([{ value: '', label: 'Без категории' }].concat((b.categories || []).map((c) => ({ value: c.id, label: c.name }))), article ? article.categoryId || '' : '', { class: 'input', 'aria-label': 'Категория' });
    return U.modal({ title: article ? 'Изменить инструкцию' : 'Новая инструкция', ok: 'Сохранить',
      body: h('div', { class: 'stack' }, U.field('Заголовок', title, null, true), U.field('Категория', cat), U.field('Ответ', body, 'Минимум 20 символов', true)),
      onOk: async () => { await api.post(article ? '/kb/' + article.id : '/kb', { title: title.value, body: body.value, categoryId: cat.value }); U.toast('Инструкция сохранена'); onSaved(); } });
  }

  MS.views.kb = async function (el, params, alive) {
    const id = params.id;
    if (id) {
      const r = await api.get('/kb/' + id);
      if (!alive()) return;
      const a = r.article;
      U.mount(el,
        h('a', { class: 'rf-panel-link', href: '#/kb', style: { marginLeft: 0 } }, 'К списку инструкций'),
        heading('Инструкция', '', (a.categoryName || 'Общая') + ', обновлена ' + U.fDate(a.updatedAt), r.canEdit ? [
          h('button', { class: 'rf-button', type: 'button', onclick: () => editor(a, () => MS.go('/kb/' + a.id)) }, icon('edit', 16), 'Изменить'),
          h('button', { class: 'rf-button', type: 'button', onclick: async () => { await api.post('/kb/' + a.id, { archived: !a.archived }); U.toast(a.archived ? 'Инструкция восстановлена' : 'Инструкция в архиве'); MS.go('/kb'); } }, a.archived ? 'Вернуть из архива' : 'В архив')] : null),
        h('section', { class: 'rf-panel rf-kb-article' }, h('h2', { class: 'rf-panel-title' }, a.title), paragraphs(a.body),
          h('div', { class: 'rf-kb-meta' }, 'Просмотров в форме: ' + a.views + '. Решили вопрос по инструкции: ' + a.helpful + '.')),
        h('section', { class: 'rf-panel' }, h('h2', { class: 'rf-panel-title' }, 'Не помогло?'), h('p', null, 'Создайте обращение, и ответственный разберётся с вопросом.'), h('a', { class: 'rf-button rf-button-primary', href: '#/new' }, 'Новое обращение')));
      return;
    }
    const q = params.query || {};
    const b = MS.state.boot || {};
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Поиск по инструкциям', value: q.q || '' });
    const cat = U.select([{ value: '', label: 'Все категории' }].concat((b.categories || []).map((c) => ({ value: c.id, label: c.name }))), q.cat || '', { class: 'input', 'aria-label': 'Категория' });
    const listBox = h('div');
    let canEdit = false;
    async function load() {
      const r = await api.get('/kb', { q: search.value.trim(), cat: cat.value });
      if (!alive()) return;
      canEdit = r.canEdit;
      addBtn.hidden = !canEdit;
      U.mount(listBox, r.items.length ? h('div', { class: 'rf-kb-list' }, r.items.map((a) => h('a', { class: 'rf-kb-item', href: '#/kb/' + a.id },
        h('div', { class: 'rf-kb-item-head' }, h('b', null, a.title), a.categoryName ? h('span', { class: 'rf-ticket-category' }, a.categoryName) : null),
        h('p', null, a.body + (a.body.length >= 220 ? '…' : '')),
        h('small', null, a.helpful ? 'Решили вопрос: ' + a.helpful : 'Обновлена ' + U.fDate(a.updatedAt)))))
        : h('div', { class: 'rf-empty' }, h('b', null, 'Ничего не найдено'), h('p', null, 'Попробуйте другие слова или создайте обращение.')));
    }
    const addBtn = h('button', { class: 'rf-button rf-button-primary', type: 'button', hidden: true, onclick: () => editor(null, load) }, icon('plus', 16), 'Новая инструкция');
    search.addEventListener('input', U.debounce(load, 250));
    cat.addEventListener('change', load);
    U.mount(el, heading('Инструкции', 'и ответы.', 'Решения частых вопросов. Их же подсказывает форма нового обращения.', addBtn),
      h('div', { class: 'rf-panel rf-filters' }, search, cat), listBox);
    await load();
  };

  function delta(cur, prev, lowerBetter) {
    if (cur == null || prev == null || !prev) return null;
    const d = (cur - prev) / prev;
    if (Math.abs(d) < 0.01) return 'без изменений';
    const good = lowerBetter ? d < 0 : d > 0;
    return h('span', { class: good ? 'tx-green' : 'tx-red' }, (d > 0 ? '+' : '') + Math.round(d * 100) + '% к прошлому периоду');
  }
  function metric(tone, ic, label, value, note) {
    return h('div', { class: 'rf-metric rf-' + tone }, h('div', { class: 'rf-metric-top' }, h('span', { class: 'rf-metric-icon' }, icon(ic, 18)), h('span', null, label)), h('div', { class: 'rf-metric-value' }, value), note ? h('div', { class: 'rf-metric-note' }, note) : null);
  }
  MS.views.impact = async function (el, params, alive) {
    const days = Number((params.query || {}).days) || 30;
    const r = await api.get('/impact', { days });
    if (!alive()) return;
    const c = r.current, p = r.previous, d = r.deflection;
    const periods = [7, 30, 90].map((n) => h('a', { class: 'rf-chip' + (n === r.days ? ' rf-active' : ''), href: '#/impact?days=' + n }, n + ' дней'));
    const max = Math.max(1, ...r.byCategory.map((x) => x.created));
    U.mount(el,
      heading('Эффект', 'сервиса.', (r.scope === 'company' ? 'По всей компании' : 'По вашему подразделению') + ' за ' + r.days + ' дней в сравнении с предыдущим периодом.', h('div', { class: 'rf-chips' }, periods)),
      h('section', { class: 'rf-metrics' },
        metric('mint', 'check', 'Реализовано', String(c.implemented), delta(c.implemented, p.implemented)),
        metric('blue', 'clock', 'Первый ответ', U.hours(c.avgFirstResponseH), delta(c.avgFirstResponseH, p.avgFirstResponseH, true)),
        metric('orange', 'route', 'Решение', U.hours(c.avgResolveH), delta(c.avgResolveH, p.avgResolveH, true)),
        metric('violet', 'star', 'Оценка авторов', c.avgRating ? U.num(c.avgRating, 1) + ' из 5' : '—', c.rated ? 'Оценено обращений: ' + c.rated : 'Оценок пока нет')),
      h('section', { class: 'rf-panel' }, h('div', { class: 'rf-panel-head' }, h('h2', { class: 'rf-panel-title' }, 'Помощь до отправки обращения')),
        h('p', { class: 'rf-muted' }, 'Попытки с просмотром инструкции за ' + r.days + ' дней: ' + d.total + '. Из них ' + d.solved + ' подтверждены как решённые по инструкции.'),
        h('div', { class: 'rf-deflect' },
          [['Решили по инструкции', d.solved], ['Создали обращение', d.created], ['Присоединились к проблеме', d.joined], ['Исход пока неизвестен', d.unknown]].map(([l, v]) => h('div', null, h('b', null, String(v)), h('span', null, l)))),
        h('p', { class: 'rf-help-text', style: { padding: '14px 0 0' } }, 'Учитывается ответ «Решил вопрос по инструкции» в форме нового обращения. Повторные просмотры в одной попытке считаются один раз. Отправка обращения или присоединение к проблеме в этой попытке меняет её результат.')),
      h('section', { class: 'rf-chart-grid' },
        h('section', { class: 'rf-panel' }, h('div', { class: 'rf-panel-head' }, h('h2', { class: 'rf-panel-title' }, 'Темы обращений')),
          r.byCategory.length ? h('div', { class: 'rf-topics' }, r.byCategory.map((x) => h('a', { class: 'rf-topic', href: '#/all?cat=' + x.categoryId }, h('span', null, x.name), h('span', { class: 'rf-bar' }, h('i', { style: { width: (x.created / max * 100) + '%' } })), h('b', null, x.implemented + ' / ' + x.created))))
            : h('div', { class: 'rf-empty' }, h('b', null, 'За период обращений нет'))),
        h('section', { class: 'rf-panel' }, h('div', { class: 'rf-panel-head' }, h('h2', { class: 'rf-panel-title' }, 'Полезные инструкции'), h('a', { class: 'rf-panel-link', href: '#/kb' }, 'Все')),
          h('div', { class: 'rf-kb-list' }, r.topArticles.map((a) => h('a', { class: 'rf-kb-item', href: '#/kb/' + a.id }, h('b', null, a.title), h('small', null, 'Решили вопрос: ' + a.helpful + ', просмотров: ' + a.views)))))),
      h('section', { class: 'rf-panel' }, h('div', { class: 'rf-panel-head' }, h('h2', { class: 'rf-panel-title' }, 'Что изменилось благодаря обращениям'), h('a', { class: 'rf-panel-link', href: '#/board' }, 'Все результаты')),
        r.effects.length ? h('div', { class: 'rf-wins' }, r.effects.map((a) => h('a', { class: 'rf-win', href: '#/appeal/' + a.id }, h('span', { class: 'rf-metric-icon' }, icon('check', 16)), h('div', null, h('b', null, a.title), h('small', null, a.result ? MS.parts.cut(a.result, 110) : MS.catName(a.categoryId))))))
          : h('div', { class: 'rf-empty' }, h('b', null, 'За период нет реализованных обращений'))));
  };

  // Помощь до отправки: блок для формы нового обращения
  MS.kbHelper = function () {
    const box = h('div', { class: 'rf-kb-helper', hidden: true });
    let attemptId = null; let seq = 0; let solved = false;
    async function update(title, text) {
      if (solved) return;
      const my = ++seq;
      try {
        const r = await api.post('/kb/suggest', { title, text, attemptId });
        if (my !== seq) return;
        if (r.attemptId) attemptId = r.attemptId;
        if (!r.items.length) { box.hidden = true; return; }
        box.hidden = false;
        U.mount(box, h('div', { class: 'rf-kb-helper-head' }, h('b', null, 'Возможно, есть готовый ответ'), h('span', null, 'Посмотрите инструкцию перед отправкой.')),
          r.items.map((a) => {
            const body = h('div', { class: 'rf-kb-helper-body', hidden: true }, paragraphs(a.body));
            return h('div', { class: 'rf-kb-helper-item' },
              h('button', { type: 'button', class: 'rf-kb-helper-title', onclick: () => { body.hidden = !body.hidden; if (!body.hidden) api.post('/kb/attempt', { attemptId, viewed: a.id }).catch(() => {}); } }, a.title), body);
          }),
          h('div', { class: 'rf-kb-helper-actions' },
            h('button', { type: 'button', class: 'rf-button', onclick: async () => {
              await api.post('/kb/attempt', { attemptId, outcome: 'solved' });
              solved = true;
              U.mount(box, h('div', { class: 'rf-kb-helper-head' }, h('b', null, 'Хорошо, что вопрос решён'), h('span', null, 'Обращение можно не отправлять.')), h('a', { class: 'rf-button', href: '#/home' }, 'На главную'));
            } }, 'Решил вопрос по инструкции')));
      } catch (e) { /* подсказка не критична */ }
    }
    function finish(outcome, appealId) { if (attemptId && !solved) api.post('/kb/attempt', { attemptId, outcome, appealId }).catch(() => {}); }
    return { el: box, update: U.debounce(update, 500), finish };
  };
})();
