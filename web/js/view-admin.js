/* Администрирование: маршрутизация, категории, SLA, сотрудники, интеграции, демо-время, журнал */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const DAY = 86400000;
  const TABS = [['rules', 'Маршрутизация'], ['categories', 'Категории'], ['sla', 'Сроки (SLA)'], ['users', 'Сотрудники'], ['integrations', 'Интеграции'], ['time', 'Демо-время'], ['audit', 'Журнал']];
  const AUDIT = { rules: 'Правила маршрутизации', categories: 'Категории', sla: 'Сроки SLA', user: 'Сотрудник', time: 'Демо-время', reset: 'Сброс данных' };
  const opt = (value, label) => ({ value, label });
  const lab = (o, k) => (o && o[k] ? (o[k].label || o[k]) : k);
  function inp(value, attrs) { return h('input', Object.assign({ class: 'input sm', value: value == null ? '' : String(value) }, attrs || {})); }
  function sel(opts, val, onChange, label) { const s = U.select(opts, val || '', { class: 'input sm', 'aria-label': label }); s.addEventListener('change', () => onChange(s.value)); return s; }
  function saveBtn(text, fn) {
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => { btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message, 'err'); } finally { btn.disabled = false; } } }, icon('check', 16), text || 'Сохранить');
    return btn;
  }
  const note = (t) => h('div', { class: 'callout blue', style: { marginBottom: '14px' } }, icon('info'), h('div', null, t));

  function rulesTab(cfg, reload) {
    const b = MS.state.boot;
    const rules = cfg.rules.map((r) => Object.assign({}, r, { target: Object.assign({}, r.target) }));
    const handlers = cfg.users.filter((u) => u.role !== 'employee');
    const typeOpts = [opt('', 'Любой тип')].concat(Object.keys(b.types).map((k) => opt(k, b.types[k].label)));
    const catOpts = [opt('', 'Любая категория')].concat(cfg.categories.map((c) => opt(c.id, c.name)));
    const deptOpts = [opt('', 'Любое подразделение')].concat(cfg.departments.map((d) => opt(d.id, d.name)));
    const tgtOpts = [opt('head', 'Руководитель подразделения автора')].concat(handlers.map((u) => opt(u.id, u.name + ' — ' + u.position)));
    const list = h('div', { class: 'stack tight' });
    function draw() {
      U.mount(list, rules.map((r, i) => {
        const name = inp(r.name, { 'aria-label': 'Название правила', style: { flex: '1 1 260px' } }); name.addEventListener('input', () => { r.name = name.value; });
        const en = h('input', { type: 'checkbox', checked: r.enabled !== false }); en.addEventListener('change', () => { r.enabled = en.checked; });
        const move = (d) => { const j = i + d; if (j < 0 || j >= rules.length) return; const t = rules[i]; rules[i] = rules[j]; rules[j] = t; draw(); };
        return h('div', { class: 'card', style: { padding: '10px 12px' } },
          h('div', { class: 'row' }, h('span', { class: 'badge t-gray' }, String(i + 1)), name, h('label', { class: 'check small' }, en, 'Активно'),
            h('button', { class: 'btn ghost sm', type: 'button', title: 'Выше', onclick: () => move(-1) }, '↑'), h('button', { class: 'btn ghost sm', type: 'button', title: 'Ниже', onclick: () => move(1) }, '↓'),
            h('button', { class: 'btn ghost sm', type: 'button', title: 'Удалить', onclick: () => { rules.splice(i, 1); draw(); } }, icon('x', 14))),
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'small muted' }, 'Если'),
            sel(typeOpts, r.type, (v) => { r.type = v || null; }, 'Тип'), sel(catOpts, r.categoryId, (v) => { r.categoryId = v || null; }, 'Категория'), sel(deptOpts, r.authorDepartmentId, (v) => { r.authorDepartmentId = v || null; }, 'Подразделение автора'),
            h('span', { class: 'small muted' }, '→'), sel(tgtOpts, r.target.kind === 'authorDepartmentHead' ? 'head' : r.target.userId, (v) => { r.target = v === 'head' ? { kind: 'authorDepartmentHead' } : { kind: 'user', userId: v }; }, 'Ответственный')));
      }));
    }
    draw();
    const tType = sel(typeOpts.slice(1), 'problem', () => {}, 'Тип');
    const tCat = sel(catOpts.slice(1), cfg.categories[0] && cfg.categories[0].id, () => {}, 'Категория');
    const tDept = sel(deptOpts.slice(1), cfg.departments[0] && cfg.departments[0].id, () => {}, 'Подразделение');
    const tOut = h('div');
    const test = async () => {
      const r = await api.post('/admin/rules/test', { type: tType.value, categoryId: tCat.value, departmentId: tDept.value });
      const rule = cfg.rules.find((x) => x.id === r.ruleId);
      U.mount(tOut, h('div', { class: 'stack tight', style: { marginTop: '10px' } },
        h('div', null, h('b', null, r.assignee ? r.assignee.name : '—'), r.assignee ? h('span', { class: 'muted' }, ' · ' + r.assignee.position) : null, r.fallback ? h('span', { class: 'badge t-orange', style: { marginLeft: '6px' } }, 'резервный маршрут') : null),
        h('div', { class: 'small muted' }, 'Правило: ' + (rule ? rule.name : 'не найдено — координатор')),
        h('ol', { class: 'trace' }, (r.trace || []).map((t) => h('li', null, t)))));
    };
    return h('div', null,
      note('Правила проверяются сверху вниз, срабатывает первое подходящее. Если ответственный отсутствует — обращение получает заместитель, затем руководитель подразделения, затем координатор. Ни одно обращение не остаётся без владельца.'),
      h('div', { class: 'card', style: { marginBottom: '14px' } }, h('h3', null, 'Проверить маршрут'), h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'По сохранённым правилам и текущим отсутствиям'),
        h('div', { class: 'row' }, tType, tCat, tDept, h('button', { class: 'btn', type: 'button', onclick: () => test().catch((e) => U.toast(e.message, 'err')) }, icon('route', 16), 'Проверить')), tOut),
      list,
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', type: 'button', onclick: () => { rules.push({ name: 'Новое правило', type: null, categoryId: null, authorDepartmentId: null, target: { kind: 'user', userId: cfg.settings.coordinatorId }, enabled: true }); draw(); } }, icon('plus', 16), 'Добавить правило'),
        saveBtn('Сохранить правила', async () => { await api.put('/admin/rules', { rules }); U.toast('Правила сохранены'); await reload(); })));
  }

  function categoriesTab(cfg, reload) {
    const cats = cfg.categories.map((c) => Object.assign({}, c));
    const gOpts = cfg.groups.map((g) => opt(g.id, g.name));
    const list = h('div', { class: 'stack tight' });
    function draw() {
      U.mount(list, cats.map((c) => {
        const name = inp(c.name, { 'aria-label': 'Название', style: { flex: '1 1 240px' } }); name.addEventListener('input', () => { c.name = name.value; });
        const kw = inp((c.keywords || []).join(', '), { 'aria-label': 'Ключевые слова', placeholder: 'ключевые слова через запятую', style: { flex: '2 1 300px' } }); kw.addEventListener('input', () => { c.keywords = kw.value; });
        const en = h('input', { type: 'checkbox', checked: c.enabled !== false }); en.addEventListener('change', () => { c.enabled = en.checked; });
        return h('div', { class: 'card', style: { padding: '10px 12px' } }, h('div', { class: 'row' }, name, sel(gOpts, c.groupId, (v) => { c.groupId = v; }, 'Группа'), kw, h('label', { class: 'check small' }, en, 'Доступна')));
      }));
    }
    draw();
    return h('div', null,
      note('Категории видны сотрудникам при создании обращения. Ключевые слова нужны для автоподсказки категории по тексту. Категории с историей не удаляются — их можно скрыть.'),
      list,
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', type: 'button', onclick: () => { cats.push({ name: '', groupId: gOpts[0].value, keywords: [], enabled: true }); draw(); } }, icon('plus', 16), 'Добавить категорию'),
        saveBtn('Сохранить категории', async () => { await api.put('/admin/categories', { categories: cats }); U.toast('Категории сохранены'); await MS.app.loadBoot(); await reload(); })));
  }

  function slaTab(cfg, reload) {
    const b = MS.state.boot;
    const sla = JSON.parse(JSON.stringify(cfg.settings.sla));
    const num = (v, set, label) => { const x = inp(v, { type: 'number', min: '1', max: '90', style: { width: '90px' }, 'aria-label': label }); x.addEventListener('input', () => set(x.value)); return x; };
    let second = cfg.settings.secondEscalationDays;
    return h('div', null,
      note('Сроки считаются в рабочих днях от регистрации. На уточнении у автора срок ставится на паузу. При просрочке — эскалация руководителю ответственного, затем координатору. После сохранения сроки открытых обращений пересчитываются.'),
      h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'Приоритет'), h('th', null, 'Первый ответ, раб. дн.'), h('th', null, 'Решение, раб. дн.'))),
        h('tbody', null, Object.keys(sla).map((p) => h('tr', null, h('td', null, U.prioBadge(p), h('div', { class: 'small muted' }, lab(b.priorities, p) && b.priorities[p].impact ? b.priorities[p].impact : '')),
          h('td', null, num(sla[p].first, (v) => { sla[p].first = Number(v); }, 'Первый ответ')), h('td', null, num(sla[p].decision, (v) => { sla[p].decision = Number(v); }, 'Решение'))))))),
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('span', { class: 'small' }, 'Повторная эскалация координатору через, дн.'), num(second, (v) => { second = Number(v); }, 'Повторная эскалация')),
        h('div', { class: 'row', style: { marginTop: '12px' } }, saveBtn('Сохранить сроки', async () => { await api.put('/admin/sla', { sla, secondEscalationDays: second }); U.toast('Сроки сохранены'); await MS.app.loadBoot(); await reload(); }))));
  }

  function usersTab(cfg, reload) {
    const b = MS.state.boot;
    const roleOpts = Object.keys(b.roles).map((k) => opt(k, lab(b.roles, k)));
    const depOpts = [opt('', '— нет —')].concat(cfg.users.filter((u) => u.role !== 'employee').map((u) => opt(u.id, u.name)));
    return h('div', null,
      note('Отметьте отпуск или больничный — новые обращения автоматически уйдут заместителю. В промышленной версии список сотрудников, подразделений и отсутствий синхронизируется из Битрикс24.'),
      h('div', { class: 'card', style: { padding: 0 } }, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Сотрудник', 'Роль', 'Заместитель', 'Отсутствует до', ''].map((t) => h('th', null, t)))),
        h('tbody', null, cfg.users.map((u) => {
          const st = { role: u.role, deputyId: u.deputyId || '', absent: !!u.absentFlag };
          const date = inp(u.absentUntilRaw ? U.toInputDate(u.absentUntilRaw) : '', { type: 'date', disabled: !st.absent, 'aria-label': 'Отсутствует до' });
          const ab = h('input', { type: 'checkbox', checked: st.absent, 'aria-label': 'Отсутствует' });
          ab.addEventListener('change', () => { st.absent = ab.checked; date.disabled = !ab.checked; if (ab.checked && !date.value) date.value = U.toInputDate(MS.now() + 7 * DAY); });
          return h('tr', null,
            h('td', { class: 'small' }, h('b', null, u.name), u.absent ? h('span', { class: 'badge t-orange', style: { marginLeft: '6px' } }, 'отсутствует') : null, h('div', { class: 'muted' }, u.position + ' · ' + MS.deptName(u.departmentId))),
            h('td', null, sel(roleOpts, st.role, (v) => { st.role = v; }, 'Роль')),
            h('td', null, sel(depOpts.filter((o) => o.value !== u.id), st.deputyId, (v) => { st.deputyId = v; }, 'Заместитель')),
            h('td', null, h('div', { class: 'row nw' }, ab, date)),
            h('td', null, saveBtn('', async () => {
              const body = { role: st.role, deputyId: st.deputyId || null, absent: st.absent };
              if (st.absent) { if (!date.value) throw new Error('Укажите дату окончания отсутствия'); body.absentUntil = U.fromInputDate(date.value); }
              await api.put('/admin/users/' + u.id, body); U.toast(u.name + ': сохранено'); await MS.app.loadBoot(); await reload();
            })));
        }))))));
  }

  async function integrationsTab(cfg) {
    const r = await api.get('/admin/outbox');
    return h('div', null,
      h('div', { class: 'grid2', style: { marginBottom: '14px' } },
        h('div', { class: 'card' }, h('h3', null, 'Битрикс24'), r.bitrixLive ? h('div', { class: 'badge t-green' }, 'подключено через входящий вебхук') : h('div', { class: 'badge t-yellow' }, 'режим имитации'),
          h('p', { class: 'small muted' }, 'Уведомления сотрудникам методом im.notify.system.add. Для включения запустите сервер с переменной BITRIX24_WEBHOOK_URL. Далее по плану: вход через Битрикс24 (OAuth), встраивание как приложение, синхронизация оргструктуры, задачи по принятым решениям.')),
        h('div', { class: 'card' }, h('h3', null, 'Почта и 1С'), h('div', { class: 'badge t-yellow' }, 'почта: имитация'),
          h('p', { class: 'small muted' }, 'Письма формируются и складываются в очередь ниже (SMTP — по плану). 1С:УТ в MVP не затрагивается: обращения не содержат учётных данных; выгрузка CSV для отчётности уже доступна.'))),
      h('div', { class: 'card' }, h('h3', null, 'Очередь исходящих сообщений (' + r.items.length + ')'),
        r.items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, ['Время', 'Канал', 'Кому', 'Сообщение', 'Статус'].map((t) => h('th', null, t)))),
          h('tbody', null, r.items.slice(0, 80).map((o) => h('tr', null, h('td', { class: 'small nowrap' }, U.fDT(o.at)), h('td', null, h('span', { class: 'badge ' + (o.channel === 'bitrix24' ? 't-blue' : 't-gray') }, o.channel === 'bitrix24' ? 'Битрикс24' : 'e-mail')),
            h('td', { class: 'small' }, o.toName || o.to), h('td', { class: 'small' }, h('b', null, o.subject), h('div', { class: 'muted' }, MS.parts.cut(o.body || '', 160)), o.appealId ? h('a', { class: 'id', href: '#/appeal/' + o.appealId }, o.appealId) : null),
            h('td', null, h('span', { class: 'badge ' + (o.status === 'sent' ? 't-green' : o.status === 'error' ? 't-red' : 't-yellow') }, o.status))))))) : U.empty('Сообщений пока нет')));
  }

  function timeTab(cfg, reload) {
    const cur = Math.round((cfg.settings.timeOffsetMs || 0) / DAY);
    const out = h('div');
    const shift = async (days) => {
      const r = await api.post('/admin/time', { offsetDays: days });
      MS.state.timeOffsetMs = r.timeOffsetMs;
      await MS.app.refresh(); MS.app.renderNav();
      const n = Array.isArray(r.escalated) ? r.escalated.length : Number(r.escalated) || 0;
      U.toast('Демо-время: +' + days + ' дн. Новых эскалаций: ' + n);
      await reload();
    };
    return h('div', null,
      note('Для демонстрации SLA можно «перемотать» время вперёд: система проверит сроки, отметит просрочки и отправит эскалации руководителям. В боевом режиме проверка выполняется автоматически каждую минуту.'),
      h('div', { class: 'card stack' },
        h('div', null, h('b', null, 'Текущее время системы: '), U.fDT(MS.now()), cur ? h('span', { class: 'badge t-purple', style: { marginLeft: '8px' } }, 'сдвиг +' + cur + ' дн.') : null),
        h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Сдвинуть от реального времени на:'),
          [0, 1, 2, 3, 5, 7, 10].map((d) => h('button', { type: 'button', class: 'btn sm' + (d === cur ? ' primary' : ''), onclick: () => shift(d).catch((e) => U.toast(e.message, 'err')) }, d ? '+' + d + ' дн.' : 'Сейчас'))),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: async () => { try { const r = await api.post('/admin/sla-check', {}); const n = Array.isArray(r.escalated) ? r.escalated.length : Number(r.escalated) || 0; U.toast('Проверка сроков: новых эскалаций ' + n); await MS.app.refresh(); } catch (e) { U.toast(e.message, 'err'); } } }, icon('clock', 16), 'Проверить сроки сейчас'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => U.modal({ title: 'Сбросить демо-данные?', body: h('p', null, 'Все созданные обращения, комментарии и настройки будут заменены исходным датасетом (40 обращений).'), ok: 'Сбросить', danger: true,
            onOk: async () => { await api.post('/admin/reset', {}); MS.state.timeOffsetMs = 0; await MS.app.loadBoot(); U.toast('Данные восстановлены'); setTimeout(() => location.reload(), 400); } }) }, icon('refresh', 16), 'Сбросить данные'))),
      out);
  }

  function auditTab(cfg) {
    return h('div', null,
      cfg.seedWarnings && cfg.seedWarnings.length ? h('div', { class: 'callout orange', style: { marginBottom: '14px' } }, icon('alert'), h('div', null, h('b', null, 'Замечания при загрузке датасета'), h('ul', null, cfg.seedWarnings.map((w) => h('li', { class: 'small' }, w))))) : null,
      h('div', { class: 'card' }, h('h3', null, 'Журнал администрирования'),
        cfg.audit.length ? h('div', { class: 'stack tight' }, cfg.audit.map((x) => h('div', { class: 'small' }, h('span', { class: 'muted nowrap' }, U.fDT(x.at) + ' · '), h('b', null, (MS.user(x.actorId) || {}).name || 'Система'), ' · ' + (AUDIT[x.action] || x.action) + (x.details ? ': ' + MS.parts.cut(x.details, 200) : '')))) : U.empty('Изменений настроек пока не было')));
  }

  MS.views.admin = async function (el, params, alive) {
    const tab = TABS.some((t) => t[0] === params.tab) ? params.tab : 'rules';
    const body = h('div');
    let cfg;
    async function reload() {
      cfg = await api.get('/admin/config');
      if (!alive()) return;
      let view;
      if (tab === 'rules') view = rulesTab(cfg, reload);
      else if (tab === 'categories') view = categoriesTab(cfg, reload);
      else if (tab === 'sla') view = slaTab(cfg, reload);
      else if (tab === 'users') view = usersTab(cfg, reload);
      else if (tab === 'integrations') view = await integrationsTab(cfg);
      else if (tab === 'time') view = timeTab(cfg, reload);
      else view = auditTab(cfg);
      if (alive()) U.mount(body, view);
    }
    U.mount(el,
      h('div', { class: 'page-head rf-page-heading' }, h('div', null, h('h1', null, 'Администрирование'), h('div', { class: 'sub' }, 'Настройки без программиста: маршруты, категории, сроки, замещения'))),
      h('div', { class: 'tabs' }, TABS.map((t) => h('a', { href: '#/admin/' + t[0], class: t[0] === tab ? 'on' : null }, t[1]))),
      body);
    U.mount(body, U.loading());
    await reload();
  };
})();
