/* Форма нового обращения: тип, тема, текст, файлы; живые подсказки: маршрут и похожие */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const MAX_FILES = 5, MAX_BYTES = 2 * 1024 * 1024;

  function suggestCategory(text, cats) {
    const t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
    let best = null, bestScore = 0;
    cats.forEach((c) => {
      let s = 0;
      (c.keywords || []).forEach((k) => { if (k && t.indexOf(String(k).toLowerCase()) >= 0) s += 1; });
      if (s > bestScore) { bestScore = s; best = c; }
    });
    return bestScore ? best : null;
  }

  MS.views.create = async function (el, params, alive) {
    const b = MS.state.boot; const me = MS.state.me;
    const st = { type: params.query.type || '', categoryId: params.query.cat || '', priority: 'medium', anonymous: false, isPublic: true, files: [] };

    // ---------- тип ----------
    const typeGrid = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Тип обращения' });
    function renderTypes() {
      U.mount(typeGrid, Object.keys(b.types).map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.type === k), class: 'choice' + (st.type === k ? ' on' : ''), onclick: () => { st.type = k; if (k === 'praise') st.priority = 'low'; else if (st.priority === 'low' && prioTouched === false) st.priority = 'medium'; renderTypes(); renderPrio(); updateHints(); preview(); } },
        h('span', { class: 't' }, icon(U.TYPE_ICON[k]), b.types[k].label), h('span', { class: 'd' }, b.types[k].hint))));
    }

    // ---------- поля ----------
    const catSel = U.select([{ value: '', label: '— выберите тему —' }].concat(b.groups.map((g) => ({ group: g.name, items: b.categories.filter((c) => c.groupId === g.id).map((c) => ({ value: c.id, label: c.name })) })).filter((g) => g.items.length)), st.categoryId, { id: 'f-cat' });
    catSel.addEventListener('change', () => { st.categoryId = catSel.value; suggestBox.classList.add('hidden'); preview(); });
    const suggestBox = h('div', { class: 'small hidden' });
    const title = h('input', { class: 'input', id: 'f-title', maxlength: '140', placeholder: 'Коротко: что происходит или что предлагаете', autocomplete: 'off' });
    const desc = h('textarea', { class: 'input', id: 'f-desc', maxlength: '4000', rows: '6' });
    const sol = h('textarea', { class: 'input', id: 'f-sol', maxlength: '2000', rows: '3' });
    const titleCnt = h('div', { class: 'counter' }, '0 / 140');
    const descCnt = h('div', { class: 'counter' }, '0 / 4000');
    const descHint = h('div', { class: 'hint' });
    const solLabel = h('label', { for: 'f-sol' });
    function updateHints() {
      const t = st.type;
      desc.placeholder = t === 'idea' ? 'Что предлагаете и какую пользу это даст: сэкономит время, уменьшит ошибки, упростит работу…' : t === 'praise' ? 'Что именно сработало хорошо и кого хотите отметить' : 'Что происходит, как часто, кого касается и к чему приводит (потеря времени, ошибки, риски)';
      descHint.textContent = 'Чем конкретнее пример, тем быстрее решение. Минимум 15 символов.';
      solLabel.textContent = t === 'idea' ? 'Как это можно реализовать' : t === 'praise' ? 'Что стоит сохранить или распространить' : 'Предлагаемое решение';
      sol.placeholder = 'Необязательно, но очень помогает';
      prioField.classList.toggle('hidden', t === 'praise');
    }

    // ---------- приоритет ----------
    let prioTouched = false;
    const prioBox = h('div');
    function renderPrio() {
      U.mount(prioBox, U.seg(['high', 'medium', 'low'].map((p) => ({ value: p, label: b.priorities[p].label })), st.priority, (v) => { st.priority = v; prioTouched = true; prioHint.textContent = b.priorities[v].impact + ' · первый ответ — до ' + b.sla[v].first + ' раб. ' + U.plural(b.sla[v].first, 'дня', 'дней', 'дней'); preview(); }));
      prioHint.textContent = b.priorities[st.priority].impact + ' · первый ответ — до ' + b.sla[st.priority].first + ' раб. ' + U.plural(b.sla[st.priority].first, 'дня', 'дней', 'дней');
    }
    const prioHint = h('div', { class: 'hint' });
    const prioField = h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Насколько это влияет на работу'), prioBox, prioHint);

    // ---------- анонимность / публичность ----------
    const anonCb = h('input', { type: 'checkbox' });
    const pubCb = h('input', { type: 'checkbox', checked: true });
    const anonNote = h('div', { class: 'callout hidden small' }, icon('lock'), h('div', null, 'Имя и подразделение не увидит никто, включая ответственного и администратора: в базе хранится только зашифрованная ссылка. Ответы и статус вы увидите в разделе «Мои обращения». В тексте лучше не указывать детали, по которым вас легко узнать.'));
    anonCb.addEventListener('change', () => { st.anonymous = anonCb.checked; anonNote.classList.toggle('hidden', !st.anonymous); if (st.anonymous) { pubCb.checked = false; st.isPublic = false; } preview(); });
    pubCb.addEventListener('change', () => { st.isPublic = pubCb.checked; });

    // ---------- файлы ----------
    const fileInput = h('input', { type: 'file', multiple: true, class: 'sr', id: 'f-files' });
    const fileList = h('div', { class: 'files' });
    const drop = h('label', { class: 'drop', for: 'f-files' }, icon('clip'), ' Перетащите файлы сюда или ', h('u', null, 'выберите'), ' — скриншот, документ, фото (до ' + MAX_FILES + ' файлов по 2 МБ)');
    async function addFiles(list) {
      const arr = Array.from(list || []);
      for (const f of arr) {
        if (st.files.length >= MAX_FILES) { U.toast('Не более ' + MAX_FILES + ' файлов', 'err'); break; }
        if (f.size > MAX_BYTES) { U.toast('«' + f.name + '» больше 2 МБ', 'err'); continue; }
        const [rf] = await U.readFiles([f]);
        st.files.push(rf);
      }
      renderFiles();
    }
    function renderFiles() {
      U.mount(fileList, st.files.map((f, i) => h('span', { class: 'file-chip' }, icon('clip', 14), f.name, h('span', { class: 'muted' }, U.size(f.size)),
        h('button', { type: 'button', class: 'btn ghost sm', style: { minHeight: '22px', padding: '0 4px' }, 'aria-label': 'Удалить файл', onclick: () => { st.files.splice(i, 1); renderFiles(); } }, icon('x', 14)))));
    }
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    // ---------- правая колонка: маршрут и похожие ----------
    const routeBox = h('div', { class: 'stack tight' }, h('div', { class: 'muted small' }, 'Выберите тип и тему — покажем, кто и в какой срок ответит.'));
    const simBox = h('div', null, h('div', { class: 'muted small' }, 'Начните писать — проверим, не сообщал ли кто-то об этом раньше.'));
    let pvSeq = 0;
    const preview = U.debounce(async () => {
      if (!st.type || !st.categoryId) return;
      const my = ++pvSeq;
      try {
        const r = await api.post('/route-preview', { type: st.type, categoryId: st.categoryId, anonymous: st.anonymous, priority: st.type === 'praise' ? 'low' : st.priority });
        if (my !== pvSeq || !alive()) return;
        if (!r.assignee) { U.mount(routeBox, h('div', { class: 'muted small' }, 'Маршрут не определён')); return; }
        U.mount(routeBox,
          h('div', { class: 'row nw' }, U.avatar(r.assignee.name), h('div', null, h('b', null, r.assignee.name), h('div', { class: 'small muted' }, r.assignee.position))),
          r.fallback ? h('div', { class: 'callout orange small' }, icon('route'), h('div', null, 'Основной ответственный недоступен — обращение получит замещающий. Оно не потеряется.')) : null,
          r.trace && r.trace.length ? h('ol', { class: 'trace' }, r.trace.map((t) => h('li', null, t))) : null,
          h('dl', { class: 'kv', style: { gridTemplateColumns: '120px 1fr' } },
            h('dt', null, 'Первый ответ'), h('dd', null, 'до ' + U.fDT(r.firstResponseDue)),
            h('dt', null, 'Решение'), h('dd', null, 'до ' + U.fDT(r.decisionDue))),
          h('div', { class: 'small muted' }, 'Если срок истечёт, обращение автоматически уйдёт руководителю ответственного.'));
      } catch (e) { U.mount(routeBox, h('div', { class: 'small tx-red' }, e.message)); }
    }, 150);
    const kbHelp = MS.kbHelper();
    simBox.addEventListener('click', (e) => { if (e.target.closest('button')) kbHelp.finish('joined'); });
    let simSeq = 0;
    const similar = U.debounce(async () => {
      const text = title.value.trim() + ' ' + desc.value.trim();
      if (text.trim().length < 12) return;
      const my = ++simSeq;
      try {
        const r = await api.post('/similar', { title: title.value, text: desc.value });
        if (my !== simSeq || !alive()) return;
        if (!r.items.length) { U.mount(simBox, h('div', { class: 'muted small' }, 'Похожих обращений не найдено — вы первый.', r.hidden ? ' Есть похожие непубличные (' + r.hidden + ') — ответственный их увидит.' : '')); return; }
        U.mount(simBox,
          h('div', { class: 'callout blue small', style: { marginBottom: '8px' } }, icon('info'), h('div', null, 'Похоже, об этом уже писали. Можно поддержать существующее обращение — так оно решится быстрее.')),
          r.items.map((s) => h('div', { class: 'sim-item' },
            h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '6px' } }, h('a', { class: 'id', href: '#/appeal/' + s.id, target: '_self' }, s.id), U.statusBadge(s.status)),
              h('div', { class: 'small', style: { fontWeight: 550, marginTop: '2px' } }, s.title),
              s.result ? h('div', { class: 'small tx-green' }, MS.parts.cut(s.result, 90)) : null,
              h('div', { class: 'score' }, 'сходство ' + Math.round(s.score * 100) + '%')),
            s.mine ? h('span', { class: 'small muted' }, 'ваше') : MS.parts.supportButton(s))),
          r.hidden ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Ещё непубличных похожих: ' + r.hidden) : null);
      } catch (e) { /* подсказка не критична */ }
    }, 450);
    function onText() {
      titleCnt.textContent = title.value.length + ' / 140';
      descCnt.textContent = desc.value.length + ' / 4000';
      similar();
      kbHelp.update(title.value, desc.value);
      const sug = suggestCategory(title.value + ' ' + desc.value, b.categories);
      if (sug && sug.id !== st.categoryId) {
        U.mount(suggestBox, 'Похоже на тему «' + sug.name + '» — ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); catSel.value = sug.id; st.categoryId = sug.id; suggestBox.classList.add('hidden'); preview(); } }, 'выбрать'));
        suggestBox.classList.remove('hidden');
      } else suggestBox.classList.add('hidden');
    }
    title.addEventListener('input', onText); desc.addEventListener('input', onText);

    // ---------- отправка ----------
    const errBox = h('div', { class: 'callout red hidden' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, icon('send'), 'Отправить');
    function validate() {
      const errs = [];
      [title, desc, catSel].forEach((x) => x.classList.remove('err'));
      if (!st.type) errs.push('выберите тип');
      if (!st.categoryId) { errs.push('выберите тему'); catSel.classList.add('err'); }
      if (title.value.trim().length < 5) { errs.push('заголовок — не менее 5 символов'); title.classList.add('err'); }
      if (desc.value.trim().length < 15) { errs.push('описание — не менее 15 символов'); desc.classList.add('err'); }
      return errs;
    }
    const form = h('form', { class: 'card stack loose', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const errs = validate();
      if (errs.length) { errBox.textContent = 'Проверьте форму: ' + errs.join(', ') + '.'; errBox.classList.remove('hidden'); errBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      errBox.classList.add('hidden'); submit.disabled = true;
      try {
        const r = await api.post('/appeals', { type: st.type, categoryId: st.categoryId, title: title.value.trim(), description: desc.value.trim(), proposedSolution: sol.value.trim(), priority: st.type === 'praise' ? 'low' : st.priority, anonymous: st.anonymous, isPublic: st.isPublic, files: st.files });
        kbHelp.finish('created', r.appeal.id);
        MS.app.afterAction(r);
        U.toast('Обращение ' + r.appeal.id + ' зарегистрировано');
        MS.go('/appeal/' + r.appeal.id + '?created=1');
      } catch (ex) { errBox.textContent = ex.message; errBox.classList.remove('hidden'); }
      finally { submit.disabled = false; }
    } },
      U.field('Что вы хотите сообщить', typeGrid, null, true),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'f-cat', class: 'req' }, 'Тема'), catSel, suggestBox), prioField),
      h('div', { class: 'field' }, h('label', { for: 'f-title', class: 'req' }, 'Заголовок'), title, titleCnt),
      h('div', { class: 'field' }, h('label', { for: 'f-desc', class: 'req' }, 'Описание'), desc, h('div', { class: 'row between' }, descHint, descCnt)),
      h('div', { class: 'field' }, solLabel, sol),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Вложения'), drop, fileInput, fileList),
      h('div', { class: 'stack tight' },
        h('label', { class: 'check' }, anonCb, h('span', null, h('b', null, 'Отправить анонимно'), h('div', { class: 'small muted' }, 'Для чувствительных вопросов: процесс рассмотрения тот же, сроки те же'))),
        anonNote,
        h('label', { class: 'check' }, pubCb, h('span', null, h('b', null, 'Показать коллегам'), h('div', { class: 'small muted' }, 'Обращение появится в ленте «Идеи коллег», его можно будет поддержать. Ответственный может скрыть его из ленты.')))),
      errBox,
      h('div', { class: 'row' }, submit, h('a', { class: 'btn ghost', href: '#/mine' }, 'Отмена'), h('span', { class: 'small muted' }, 'Автор: ' + me.name + ' · ' + MS.deptName(me.departmentId))));

    renderTypes(); renderPrio(); updateHints();
    U.mount(el,
      h('div', { class: 'page-head rf-page-heading' }, h('div', null, h('h1', null, 'Новое обращение'), h('div', { class: 'sub' }, 'Каждое обращение получает ответственного, срок и финальный ответ — ничего не теряется'))),
      h('div', { class: 'layout-side' }, form,
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', null, 'Кто рассмотрит'), routeBox),
          kbHelp.el,
          h('div', { class: 'card' }, h('h3', null, 'Похожие обращения'), simBox))));
    if (st.type && st.categoryId) preview();
  };
})();
