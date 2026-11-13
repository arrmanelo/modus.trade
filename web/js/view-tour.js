/* Демо-сценарий: пошаговый проход по 6 сценариям из датасета (для защиты) */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const KEY = 'modus.tour';
  const STEPS = [
    { user: 'u_emp_proc', path: '/new', title: 'Сотрудник подаёт обращение с файлом',
      text: 'Выберите тип и тему, опишите ситуацию и приложите файл. Система сразу покажет, кому уйдёт обращение и в какой срок ответят, а также подскажет похожие обращения.',
      tip: 'Попробуйте тему «Обучение»: ответственная в отпуске, и обращение автоматически уйдёт заместителю.' },
    { user: 'u_admin', path: '/admin/rules', title: 'Маршрутизация и замещения',
      text: 'Правила «тема → ответственный». Если ответственного нет или он отсутствует, обращение переходит к заместителю, затем к руководителю, и никогда не теряется.',
      tip: 'Нажмите «Проверить маршрут» для темы «Обучение».' },
    { user: 'u_it', path: '/inbox', title: 'Ответственный разбирает обращение',
      text: 'Откройте любое новое обращение: возьмите его на рассмотрение, запросите уточнение или напишите комментарий. Вся история сохраняется в карточке.',
      tip: 'При переходе «В работу» создаётся запись в очереди Битрикс24. Без вебхука это имитация; отправка на живой портал требует настройки и отдельной проверки.' },
    { user: 'u_office', path: '/appeal/A-017', title: 'Автор видит результат, даже при отказе',
      text: 'Предложение A-017 отклонено, но автор видит обоснование отказа и может оценить ответ. Отклонить без причины система не даст.',
      tip: 'Загляните в «Вы сказали — мы сделали»: там публичные результаты для всех.' },
    { user: 'u_dir', path: '/all?overdue=1', title: 'Руководитель: фильтры и просрочки',
      text: 'Реестр с фильтрами по статусу, типу, теме, подразделению и ответственному. Просроченные обращения подсвечены и автоматически эскалируются руководителю.',
      tip: 'Реестр можно выгрузить в CSV.' },
    { user: 'u_dir', path: '/analytics', title: 'Сводка для руководства',
      text: 'Распределение по типам, доля закрытых, среднее время до первого ответа, повторяющиеся темы и нагрузка на ответственных: все показатели из ТЗ.',
      tip: 'Блок «Повторяющиеся темы» показывает кандидатов на системное решение.' },
  ];
  let box = null;
  function state() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); }
  async function go(i) {
    const st = STEPS[i];
    save({ step: i, open: true });
    try {
      if (!MS.state.me || MS.state.me.id !== st.user) await MS.app.loginAs(st.user, st.path);
      else MS.go(st.path);
    } catch (e) { U.toast(e.message, 'err'); }
    render();
  }
  function render() {
    const s = state();
    if (box) box.remove();
    box = null;
    if (!s || !s.open) {
      box = h('button', { class: 'tour-fab', type: 'button', onclick: () => { save({ step: s ? s.step : 0, open: true }); render(); } }, icon('zap', 16), s ? 'Сценарий · шаг ' + (s.step + 1) : 'Демо-сценарий');
      document.body.appendChild(box); return;
    }
    const i = Math.max(0, Math.min(STEPS.length - 1, s.step || 0)); const st = STEPS[i];
    const u = MS.user(st.user);
    const here = MS.state.me && MS.state.me.id === st.user;
    box = h('div', { class: 'tour', role: 'dialog', 'aria-label': 'Демо-сценарий' },
      h('div', { class: 'row between nw' }, h('b', { class: 'tour-h' }, icon('zap', 16), ' Демо-сценарий'),
        h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Свернуть', onclick: () => { save({ step: i, open: false }); render(); } }, icon('x', 16))),
      h('div', { class: 'tour-dots' }, STEPS.map((x, k) => h('button', { type: 'button', class: k === i ? 'on' : k < i ? 'done' : null, title: x.title, onclick: () => go(k) }, k + 1))),
      h('div', { class: 'tour-t' }, 'Шаг ' + (i + 1) + '. ' + st.title),
      h('div', { class: 'row nw small muted' }, u ? U.avatar(u.name, true) : null, u ? u.name + ' · ' + u.roleLabel : ''),
      h('p', { class: 'small' }, st.text),
      st.tip ? h('div', { class: 'tour-tip small' }, '' + st.tip) : null,
      h('div', { class: 'row between nw' },
        h('button', { class: 'btn sm', type: 'button', disabled: i === 0, onclick: () => go(i - 1) }, '← Назад'),
        here ? null : h('button', { class: 'btn sm primary', type: 'button', onclick: () => go(i) }, 'Открыть шаг'),
        i < STEPS.length - 1 ? h('button', { class: 'btn sm' + (here ? ' primary' : ''), type: 'button', onclick: () => go(i + 1) }, 'Далее →')
          : h('button', { class: 'btn sm primary', type: 'button', onclick: () => { save(null); render(); U.toast('Сценарий пройден'); } }, 'Завершить')));
    document.body.appendChild(box);
  }
  MS.tour = { render, start: () => go(0) };
  window.addEventListener('hashchange', () => setTimeout(render, 50));
  document.addEventListener('DOMContentLoaded', () => setTimeout(render, 300));
})();
