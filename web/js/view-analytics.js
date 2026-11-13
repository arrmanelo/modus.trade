/* Аналитика для руководителей: KPI, распределения, просрочки, повторяющиеся темы */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const DAY = 86400000;
  const TYPE_COLOR = { problem: 'var(--c5)', idea: 'var(--c1)', praise: 'var(--c3)' };
  const STATUS_COLOR = { new: 'var(--c1)', review: 'var(--c4)', clarify: 'var(--c5)', progress: 'var(--c2)', done: 'var(--c3)', rejected: 'var(--c8)', closed: 'var(--border2)' };
  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) { const el = document.createElementNS(SVG, tag); Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k])); (kids || []).forEach((c) => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return el; }

  function kpi(k, v, sub, main) { return h('div', { class: 'kpi' + (main ? ' main' : '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 's' }, sub) : null); }
  function hbars(rows, max) {
    const m = max || Math.max(1, ...rows.map((r) => r.total));
    return h('div', null, rows.map((r) => h('div', { class: 'hbar' }, h('span', { class: 'lab', title: r.label }, r.label),
      h('span', { class: 'track', title: r.parts.map((p) => p.title + ': ' + p.value).join(', ') }, r.parts.filter((p) => p.value).map((p) => h('i', { style: { width: (p.value / m * 100) + '%', background: p.color } }))),
      h('span', { class: 'n' }, r.total))));
  }
  function legend(items) { return h('div', { class: 'legend' }, items.map((i) => h('span', { style: { '--sw': i.color } }, i.label))); }

  function weeksChart(weeks) {
    const W = 640, H = 200, P = { l: 28, r: 8, t: 10, b: 24 };
    const max = Math.max(1, ...weeks.map((w) => Math.max(w.created, w.resolved)));
    const iw = (W - P.l - P.r) / Math.max(1, weeks.length);
    const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    const kids = [];
    const steps = Math.min(4, max);
    for (let i = 0; i <= steps; i++) { const v = Math.round(max * i / steps); kids.push(s('line', { class: 'grid', x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) })); kids.push(s('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, [String(v)])); }
    weeks.forEach((w, i) => {
      const x0 = P.l + i * iw; const bw = Math.min(18, iw * 0.32);
      kids.push(s('rect', { x: x0 + iw / 2 - bw - 1, y: y(w.created), width: bw, height: Math.max(0, y(0) - y(w.created)), rx: 2, fill: 'var(--c1)' }, [s('title', {}, ['Неделя с ' + w.label + ': поступило ' + w.created])]));
      kids.push(s('rect', { x: x0 + iw / 2 + 1, y: y(w.resolved), width: bw, height: Math.max(0, y(0) - y(w.resolved)), rx: 2, fill: 'var(--c3)' }, [s('title', {}, ['Неделя с ' + w.label + ': решено ' + w.resolved])]));
      if (weeks.length <= 14 || i % 2 === 0) kids.push(s('text', { x: x0 + iw / 2, y: H - 6, 'text-anchor': 'middle' }, [w.label]));
    });
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Поступило и решено по неделям' }, kids);
    return h('div', null, svg, legend([{ label: 'Поступило', color: 'var(--c1)' }, { label: 'Решено (реализовано / отклонено / закрыто)', color: 'var(--c3)' }]));
  }

  function card(title, sub, body, extra) { return h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('div', null, h('h3', { style: { margin: 0 } }, title), sub ? h('div', { class: 'small muted' }, sub) : null), extra || null), body); }

  MS.views.analytics = async function (el, params, alive) {
    const b = MS.state.boot;
    const q = Object.assign({ period: '90' }, params.query);
    const body = h('div');
    const periodSeg = () => U.seg([{ value: '30', label: '30 дней' }, { value: '90', label: '90 дней' }, { value: 'all', label: 'Всё время' }], q.period, (v) => { q.period = v; go(); });
    const groupSel = U.select([{ value: '', label: 'Все группы тем' }].concat(b.groups.map((g) => ({ value: g.id, label: g.name }))), q.group || '', { class: 'input sm', 'aria-label': 'Группа тем' });
    const deptSel = U.select([{ value: '', label: 'Все подразделения' }, { value: 'anon', label: 'Анонимные' }].concat(b.departments.map((d) => ({ value: d.id, label: d.name }))), q.dept || '', { class: 'input sm', 'aria-label': 'Подразделение' });
    const typeSel = U.select([{ value: '', label: 'Все типы' }].concat(Object.keys(b.types).map((k) => ({ value: k, label: b.types[k].label }))), q.type || '', { class: 'input sm', 'aria-label': 'Тип' });
    [groupSel, deptSel, typeSel].forEach((x) => x.addEventListener('change', () => { q.group = groupSel.value; q.dept = deptSel.value; q.type = typeSel.value; go(); }));
    const segBox = h('span');
    function filters() { const f = { groupId: q.group, departmentId: q.dept, type: q.type }; if (q.period !== 'all') f.from = MS.now() - Number(q.period) * DAY; return f; }
    function go() { MS.setQuery(q); U.mount(segBox, periodSeg()); load().catch((e) => U.mount(body, h('div', { class: 'callout red' }, e.message))); }

    async function load() {
      U.mount(body, U.loading());
      const r = await api.get('/analytics', filters());
      if (!alive()) return;
      const k = r.kpi;
      if (!k.total) { U.mount(body, U.empty('За выбранный период обращений нет')); return; }
      const typeKeys = Object.keys(b.types);
      const typeParts = (row) => typeKeys.map((t) => ({ value: row[t] || 0, color: TYPE_COLOR[t], title: b.types[t].label }));
      U.mount(body,
        h('div', { class: 'section-label' }, 'Ключевые показатели из ТЗ'),
        h('div', { class: 'kpis' },
          kpi('Доля рассмотренных', U.pct(k.reviewedShare), 'получили первый ответ', true),
          kpi('Время до первого ответа', U.hours(k.avgFirstResponseHours), 'медиана ' + U.hours(k.medianFirstResponseHours) + ' · в срок ' + U.pct(k.firstResponseOnTimeShare), true),
          kpi('Доля с зафиксированным результатом', U.pct(k.resultShare), 'решение, результат или мотивированный отказ', true),
          kpi('Реализовано улучшений', String(k.implemented), 'отклонено с обоснованием: ' + k.rejected, true)),
        h('div', { class: 'kpis' },
          kpi('Всего обращений', String(k.total), 'ещё ' + k.merged + ' объединено как дубли · анонимных ' + k.anonymousCount),
          kpi('В работе сейчас', String(k.open), 'из них просрочено: ' + k.overdue),
          kpi('Доля закрытых', U.pct(k.closedShare), k.avgResolveDays != null ? 'среднее время до итога — ' + U.num(k.avgResolveDays, 1) + ' дн.' : ''),
          kpi('Оценка авторов', k.avgRating ? U.num(k.avgRating, 1) + ' / 5' : '—', 'оценили: ' + k.ratedCount)),
        h('div', { class: 'grid2', style: { marginBottom: '16px' } },
          card('По типам и статусам', null, h('div', null,
            hbars(typeKeys.map((t) => ({ label: b.types[t].label, total: r.byType[t] || 0, parts: [{ value: r.byType[t] || 0, color: TYPE_COLOR[t], title: b.types[t].label }] }))),
            h('div', { class: 'divider' }),
            hbars(Object.keys(b.statuses).map((st) => ({ label: b.statuses[st].label, total: r.byStatus[st] || 0, parts: [{ value: r.byStatus[st] || 0, color: STATUS_COLOR[st], title: b.statuses[st].label }] }))))),
          card('Динамика по неделям', 'Справляемся ли с потоком обращений', r.weeks && r.weeks.length ? weeksChart(r.weeks) : U.empty('Недостаточно данных'))),
        h('div', { class: 'grid2', style: { marginBottom: '16px' } },
          card('По группам тем', 'Где скопились проблемы и идеи', h('div', null, hbars(r.byGroup.filter((g) => g.total).map((g) => ({ label: g.name, total: g.total, parts: typeParts(g) }))), legend(typeKeys.map((t) => ({ label: b.types[t].label, color: TYPE_COLOR[t] }))))),
          card('По подразделениям авторов', 'Анонимные учитываются отдельно', h('div', null, hbars(r.byDepartment.filter((d) => d.total).map((d) => ({ label: d.name, total: d.total, parts: typeParts(d) }))), legend(typeKeys.map((t) => ({ label: b.types[t].label, color: TYPE_COLOR[t] })))))),
        card('Повторяющиеся темы', 'Автоматическая группировка похожих обращений по тексту — кандидаты на системное решение',
          r.clusters && r.clusters.length ? h('div', null, r.clusters.map((c) => h('div', { class: 'cluster' },
            h('div', { class: 'row' }, h('b', null, (c.terms || []).slice(0, 4).join(' · ')), h('span', { class: 'badge t-blue' }, c.size + ' ' + U.plural(c.size, 'обращение', 'обращения', 'обращений')), c.open ? h('span', { class: 'badge t-orange' }, 'открыто ' + c.open) : h('span', { class: 'badge t-green' }, 'все закрыты'), c.supporters ? h('span', { class: 'small muted' }, icon('up', 13), ' ' + c.supporters) : null),
            h('div', { class: 'small muted', style: { margin: '2px 0 6px' } }, (c.categories || []).join(', ')),
            h('div', { class: 'stack tight' }, (c.titles || []).map((t) => h('div', { class: 'small' }, h('a', { class: 'id', href: '#/appeal/' + t.id }, t.id), ' ' + t.title + ' ', U.statusBadge(t.status), t.mergedInto ? h('span', { class: 'muted' }, ' → ' + t.mergedInto) : null)))))) : U.empty('Повторяющихся тем не найдено')),
        h('div', { style: { height: '16px' } }),
        card('Просроченные обращения', 'Кто и на каком этапе нарушил регламент', r.overdueList.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, ['Номер', 'Обращение', 'Этап', 'Срок', 'Просрочка', 'Ответственный', 'Эскалация'].map((t) => h('th', null, t)))),
          h('tbody', null, r.overdueList.map((o) => h('tr', { class: 'click', onclick: () => MS.go('/appeal/' + o.id) }, h('td', null, h('span', { class: 'id' }, o.id)), h('td', { class: 'title-cell' }, o.title, h('div', null, U.statusBadge(o.status))), h('td', { class: 'small' }, o.kindLabel), h('td', { class: 'small nowrap' }, U.fDT(o.due)), h('td', { class: 'tx-red nowrap' }, U.num(o.daysOverdue, 1) + ' дн.'), h('td', { class: 'small' }, o.assigneeLabel), h('td', { class: 'small' }, (o.escalatedTo || []).join(', ') || '—')))))) : h('div', { class: 'callout green' }, icon('check'), h('div', null, 'Просроченных обращений нет'))),
        h('div', { style: { height: '16px' } }),
        h('div', { class: 'grid2' },
          card('Нагрузка на ответственных', null, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
            h('thead', null, h('tr', null, ['Сотрудник', 'Всего', 'Откр.', 'Проср.', 'Решено', 'Первый ответ'].map((t, i) => h('th', { class: i ? 'num' : null }, t)))),
            h('tbody', null, r.handlers.filter((x) => x.total).map((x) => h('tr', null, h('td', { class: 'small' }, h('b', null, x.name), x.absent ? h('span', { class: 'badge t-orange', style: { marginLeft: '6px' } }, 'отсутствует') : null, h('div', { class: 'muted' }, x.position)),
              h('td', { class: 'num' }, x.total), h('td', { class: 'num' }, x.open), h('td', { class: 'num' + (x.overdue ? ' tx-red' : '') }, x.overdue), h('td', { class: 'num' }, x.done), h('td', { class: 'num small' }, x.avgFirstResponseHours != null ? U.hours(x.avgFirstResponseHours) : '—'))))))),
          h('div', { class: 'stack' },
            card('Воронка обработки', null, h('div', { class: 'funnel' }, r.funnel.map((f, i) => h('div', { class: 'st' }, h('span', { style: { width: '150px', flex: 'none' } }, f.label), h('i', { style: { width: (f.value / Math.max(1, r.funnel[0].value) * 60) + '%', background: 'var(--c' + (i + 1) + ')' } }), h('b', null, f.value))))),
            card('Самые поддержанные', null, r.topSupported.length ? h('div', { class: 'stack tight' }, r.topSupported.map((t) => h('div', { class: 'row nw small' }, h('span', { class: 'badge t-blue' }, icon('up', 12), t.supporters), h('a', { href: '#/appeal/' + t.id }, t.id + ' ' + t.title), U.statusBadge(t.status)))) : U.empty('Пока никто не поддерживал чужие обращения')))),
        h('p', { class: 'small muted', style: { marginTop: '14px' } }, 'Расчёт: ' + U.fDT(r.generatedAt) + '. Доля рассмотренных — обращения, получившие первый ответ ответственного. Время ответа — календарные часы, сроки SLA — рабочие дни. Дубли не учитываются в показателях.'));
    }

    U.mount(segBox, periodSeg());
    U.mount(el,
      h('div', { class: 'page-head rf-page-heading' }, h('div', null, h('h1', null, 'Аналитика'), h('div', { class: 'sub' }, 'Скорость и результаты по вашим обращениям и зоне ответственности. Администратору доступна общая сводка.')),
        h('button', { class: 'btn', type: 'button', onclick: () => api.downloadCsv(filters()).catch((e) => U.toast(e.message, 'err')) }, icon('download'), 'Выгрузить CSV')),
      h('div', { class: 'filters' }, segBox, groupSel, deptSel, typeSel),
      body);
    await load();
  };
})();
