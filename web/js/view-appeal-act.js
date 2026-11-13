/* Действия с обращением: смена статуса, назначение, сроки, объединение, оценка */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const DAY = 86400000;

  async function post(a, act, body) { return api.post('/appeals/' + encodeURIComponent(a.id) + '/' + act, body || {}); }
  function textArea(label, required, value, rows) {
    const ta = h('textarea', { class: 'input', rows: String(rows || 4), maxlength: '3000' });
    ta.value = value || '';
    return { el: U.field(label, ta, null, required), ta };
  }
  function finish(resp, msg, reload) { MS.app.afterAction(resp); if (msg) U.toast(msg); if (reload) reload(resp); }

  function transition(a, to, reload) {
    const b = MS.state.boot; const meta = b.transitionMeta[to] || { label: to, textLabel: 'Комментарий' };
    const fin = b.statuses[a.status] && b.statuses[a.status].final;
    const reopen = fin && to === 'review';
    const required = reopen || meta.text === 'required';
    const t = textArea(reopen ? 'Причина возврата на рассмотрение' : meta.textLabel, required, '', to === 'review' && !reopen ? 3 : 5);
    const kids = [];
    const hints = {
      clarify: 'Автор получит вопрос в уведомлении. Пока он не ответит, срок по обращению стоит на паузе.',
      progress: 'Решение увидит автор (и коллеги, если обращение публичное). Укажите плановый срок реализации — за ним будет следить система.',
      done: 'Опишите, что конкретно изменилось. Автор сможет оценить результат.',
      rejected: 'Отказ обязательно объясняется: автор увидит этот текст. По возможности предложите альтернативу.',
      closed: 'Используйте для благодарностей и вопросов, не требующих реализации.',
      review: reopen ? 'Обращение вернётся в работу, сроки будут пересчитаны.' : 'Автор увидит, что обращение взято в работу.',
    };
    kids.push(h('div', { class: 'callout small' }, icon('info'), h('div', null, hints[to] || '')));
    if (to === 'rejected' && b.rejectTemplates && b.rejectTemplates.length) {
      kids.push(h('div', { class: 'stack tight' }, h('span', { class: 'small muted' }, 'Шаблоны (можно отредактировать):'),
        b.rejectTemplates.map((tpl) => h('button', { type: 'button', class: 'btn sm', style: { justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '6px 10px', whiteSpace: 'normal' }, onclick: () => { t.ta.value = tpl; t.ta.focus(); } }, tpl))));
    }
    kids.push(t.el);
    let dateIn = null;
    if (meta.due) {
      dateIn = h('input', { class: 'input', type: 'date', value: U.toInputDate(a.dueDate || MS.now() + 14 * DAY), min: U.toInputDate(MS.now()) });
      kids.push(U.field('Плановый срок реализации', dateIn, 'Автор увидит этот срок. Перенос — только с указанием причины.', true));
    }
    if (to === 'progress' && a.decision) t.ta.value = a.decision;
    return U.modal({ title: (reopen ? meta.reopenLabel : meta.label) + ' · ' + a.id, body: h('div', { class: 'stack' }, kids), ok: reopen ? meta.reopenLabel : meta.label, danger: to === 'rejected',
      onOk: async () => {
        const text = t.ta.value.trim();
        if (required && text.length < 3) throw new Error('Заполните поле «' + (reopen ? 'Причина возврата' : meta.textLabel) + '»');
        const body = { to, text };
        if (dateIn) { if (!dateIn.value) throw new Error('Укажите плановый срок'); body.dueDate = U.fromInputDate(dateIn.value); }
        const r = await post(a, 'status', body);
        finish(r, 'Статус: ' + b.statuses[to].label, reload);
      } });
  }

  function assign(a, reload) {
    const list = (a.assignable || []).slice().sort((x, y) => x.name.localeCompare(y.name, 'ru'));
    const sel = h('select', { class: 'input' }, h('option', { value: '' }, '— выберите сотрудника —'),
      list.map((u) => h('option', { value: u.id, disabled: u.absent }, u.name + ' — ' + u.position + (u.absent ? ' (отсутствует' + (u.absentUntil ? ' до ' + U.fDate(u.absentUntil) : '') + ')' : ''))));
    const t = textArea('Причина переназначения', true, '', 3);
    t.ta.placeholder = 'Например: вопрос относится к зоне ответственности другого подразделения';
    return U.modal({ title: 'Передать обращение ' + a.id, body: h('div', { class: 'stack' }, U.field('Новый ответственный', sel, 'Отсутствующих сотрудников выбрать нельзя — система предложит заместителя автоматически.', true), t.el,
      h('div', { class: 'small muted' }, 'Причина попадёт в историю. Автор увидит, что ответственный сменился.')), ok: 'Передать',
      onOk: async () => {
        if (!sel.value) throw new Error('Выберите нового ответственного');
        const r = await post(a, 'assign', { assigneeId: sel.value, reason: t.ta.value.trim() });
        finish(r, 'Обращение передано', reload);
      } });
  }

  function priority(a, reload) {
    const b = MS.state.boot; let val = a.priority;
    const hint = h('div', { class: 'hint' }, b.priorities[val].impact);
    const seg = U.seg(['high', 'medium', 'low'].map((p) => ({ value: p, label: b.priorities[p].label })), val, (v) => { val = v; hint.textContent = b.priorities[v].impact; });
    const reason = h('input', { class: 'input', maxlength: '300', placeholder: 'Почему меняется приоритет (необязательно)' });
    return U.modal({ title: 'Приоритет ' + a.id, body: h('div', { class: 'stack' }, seg, hint, reason, h('div', { class: 'small muted' }, 'Сроки первого ответа и решения будут пересчитаны по регламенту.')), ok: 'Сохранить',
      onOk: async () => { const r = await post(a, 'priority', { priority: val, reason: reason.value.trim() }); finish(r, 'Приоритет изменён', reload); } });
  }

  function due(a, reload) {
    const dateIn = h('input', { class: 'input', type: 'date', value: U.toInputDate(a.dueDate || MS.now() + 7 * DAY), min: U.toInputDate(MS.now()) });
    const t = textArea('Причина переноса', true, '', 3);
    return U.modal({ title: 'Срок реализации ' + a.id, body: h('div', { class: 'stack' }, U.field('Новый срок', dateIn, null, true), t.el, h('div', { class: 'small muted' }, 'Автор получит уведомление с новым сроком и причиной.')), ok: 'Перенести',
      onOk: async () => {
        if (!dateIn.value) throw new Error('Укажите дату');
        const r = await post(a, 'due', { dueDate: U.fromInputDate(dateIn.value), reason: t.ta.value.trim() });
        finish(r, 'Срок обновлён', reload);
      } });
  }

  function nextAction(a, reload) {
    const inp = h('input', { class: 'input', maxlength: '500', value: a.nextAction || '', placeholder: 'Например: согласовать с бухгалтерией до пятницы' });
    return U.modal({ title: 'Следующий шаг', body: h('div', { class: 'stack' }, inp, h('div', { class: 'small muted' }, 'Видно только сотрудникам, работающим с обращением.')), ok: 'Сохранить',
      onOk: async () => { const r = await post(a, 'next-action', { text: inp.value.trim() }); finish(r, 'Сохранено', reload); } });
  }

  async function publish(a, reload) {
    try { const r = await post(a, 'publish', { isPublic: !a.isPublic }); finish(r, a.isPublic ? 'Скрыто из ленты коллег' : 'Опубликовано в ленте коллег', reload); }
    catch (e) { U.toast(e.message, 'err'); }
  }

  function merge(a, reload, presetId) {
    const inp = h('input', { class: 'input', placeholder: 'Номер, например A-007', value: presetId || '' });
    const sims = (a.similar || []).filter((s) => !s.isFinal || s.status !== 'closed');
    const pick = sims.length ? h('div', { class: 'stack tight' }, h('span', { class: 'small muted' }, 'Похожие обращения:'),
      sims.map((s) => h('button', { type: 'button', class: 'btn sm', style: { justifyContent: 'flex-start', height: 'auto', padding: '6px 10px', whiteSpace: 'normal', textAlign: 'left' }, onclick: () => { inp.value = s.id; } },
        h('b', null, s.id), ' ' + s.title + ' · ' + Math.round(s.score * 100) + '%'))) : null;
    return U.modal({ title: 'Объединить ' + a.id + ' с другим обращением', body: h('div', { class: 'stack' },
      h('div', { class: 'callout small' }, icon('merge'), h('div', null, 'Текущее обращение будет закрыто как дубликат. Его автор и поддержавшие перейдут в основное обращение и будут получать уведомления о нём. Тексты сохранятся в истории.')),
      U.field('Основное обращение', inp, null, true), pick), ok: 'Объединить',
      onOk: async () => {
        const id = inp.value.trim().toUpperCase();
        if (!id) throw new Error('Укажите номер основного обращения');
        const r = await post(a, 'merge', { targetId: id });
        MS.app.afterAction(r); U.toast(a.id + ' объединено с ' + id);
        MS.go('/appeal/' + id);
      } });
  }

  function withdraw(a, reload) {
    const t = textArea('Почему отзываете (необязательно)', false, '', 3);
    return U.modal({ title: 'Отозвать обращение ' + a.id + '?', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Обращение будет закрыто, ответственный получит уведомление. Это действие нельзя отменить.'), t.el), ok: 'Отозвать', danger: true,
      onOk: async () => { const r = await post(a, 'withdraw', { text: t.ta.value.trim() }); finish(r, 'Обращение отозвано', reload); } });
  }

  function rateBox(a, reload) {
    let score = 0;
    const labels = ['', 'Совсем не решено', 'Скорее не решено', 'Частично', 'Хорошо', 'Отлично'];
    const cap = h('span', { class: 'small muted' }, 'Оцените, насколько результат решил ваш вопрос');
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Оценка' });
    function paint(n) { Array.from(stars.children).forEach((s, i) => s.classList.toggle('on', i < n)); }
    for (let i = 1; i <= 5; i++) stars.appendChild(h('button', { type: 'button', 'aria-label': i + ' из 5', onmouseenter: () => paint(i), onmouseleave: () => paint(score), onclick: () => { score = i; paint(i); cap.textContent = labels[i]; } }, icon('star', 22)));
    const txt = h('textarea', { class: 'input', rows: '2', maxlength: '1000', placeholder: 'Комментарий (необязательно)' });
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (!score) { U.toast('Выберите оценку', 'err'); return; }
      btn.disabled = true;
      try { const r = await post(a, 'rate', { score, text: txt.value.trim() }); finish(r, 'Спасибо за оценку!', reload); }
      catch (e) { U.toast(e.message, 'err'); btn.disabled = false; }
    } }, 'Отправить оценку');
    return h('div', { class: 'card' }, h('h3', null, 'Оцените результат'), h('div', { class: 'row' }, stars, cap), h('div', { style: { marginTop: '10px' } }, txt), h('div', { style: { marginTop: '10px' } }, btn));
  }

  MS.appealActs = { transition, assign, priority, due, nextAction, publish, merge, withdraw, rateBox, post };
})();
