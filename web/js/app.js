/* Оболочка приложения: вход, меню по ролям, маршрутизация */
(function () {
  'use strict';
  const MS = window.MS;
  const { h, icon, mount, toast, avatar, modal, fDT } = MS.ui;
  const api = MS.api;
  const root = () => document.getElementById('app');
  let shellEl = null, mainEl = null, navEl = null, footEl = null, topCountEl = null;
  let renderSeq = 0;

  function setBoot(b) {
    const s = MS.state;
    s.boot = b; s.me = b.me; s.counts = b.counts || {}; s.nowBase = b.nowMs; s.fetchedAt = Date.now(); s.timeOffsetMs = b.timeOffsetMs || 0;
  }
  async function loadBoot() { const b = await api.get('/bootstrap'); setBoot(b); return b; }
  async function refresh() {
    if (!MS.state.me) return;
    try {
      const r = await api.get('/me');
      const s = MS.state; s.me = r.me; s.counts = r.counts || s.counts; s.nowBase = r.nowMs; s.fetchedAt = Date.now();
      if (r.timeOffsetMs !== undefined) s.timeOffsetMs = r.timeOffsetMs;
      renderNav();
    } catch (e) { /* тихо: попробуем позже */ }
  }
  function setCounts(c) { if (c) { MS.state.counts = c; renderNav(); } }

  // ---------- тема ----------
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
  function toggleTheme() { const t = currentTheme() === 'dark' ? 'light' : 'dark'; applyTheme(t); renderNav(); }

  // ---------- маршруты ----------
  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const i = raw.indexOf('?');
    const path = i >= 0 ? raw.slice(0, i) : raw;
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const query = {};
    new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '').forEach((v, k) => { query[k] = v; });
    return { parts, query };
  }
  MS.go = function (path) { if (location.hash === '#' + path) route(); else location.hash = '#' + path; };
  MS.setQuery = function (query) {
    const r = parse();
    const p = new URLSearchParams();
    Object.keys(query).forEach((k) => { if (query[k] !== '' && query[k] != null && query[k] !== false) p.set(k, query[k]); });
    const s = p.toString();
    history.replaceState(null, '', '#/' + r.parts.map(encodeURIComponent).join('/') + (s ? '?' + s : ''));
  };
  function caps() { return (MS.state.me && MS.state.me.caps) || {}; }
  function defaultPath() {
    const me = MS.state.me; const c = MS.state.counts || {};
    if (!me) return '/login';
    return '/home';
  }

  const NAV = [
    { items: [
      { key: 'new', label: 'Новое обращение', icon: 'plus', cta: true },
      { key: 'home', label: 'Главная', icon: 'board' },
      { key: 'mine', label: 'Мои обращения', icon: 'user', count: (c) => c.mineOpen, hot: (c) => c.mineAwaiting, hotTitle: 'ждут вашего уточнения' },
      { key: 'feed', label: 'Идеи коллег', icon: 'feed', count: (c) => c.feedOpen },
      { key: 'board', label: 'Вы сказали — мы сделали', icon: 'trophy' },
      { key: 'kb', label: 'Инструкции и ответы', icon: 'list' },
      { key: 'notifications', label: 'Уведомления', icon: 'bell', hot: (c) => c.unread, hotTitle: 'непрочитанные' },
    ] },
    { sec: 'Работа с обращениями', cap: 'handler', items: [
      { key: 'inbox', label: 'Входящие', icon: 'inbox', count: (c) => c.queueOpen, hot: (c) => c.queueOverdue, hotTitle: 'просрочено' },
      { key: 'all', label: 'Реестр обращений', icon: 'list', hot: (c) => c.allOverdue, hotTitle: 'просрочено' },
    ] },
    { sec: 'Управление', cap: 'analytics', items: [
      { key: 'analytics', label: 'Аналитика', icon: 'chart' },
      { key: 'impact', label: 'Эффект сервиса', icon: 'star' },
      { key: 'admin', label: 'Настройки', icon: 'settings', cap: 'admin' },
    ] },
  ];

  function modusLogo() {
    const s = document.createElement('span'); s.style.display = 'contents';
    s.innerHTML = '<svg class="ms-logo" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="msGap"><rect width="100" height="100" fill="#fff"/><rect y="40.3" width="100" height="19.4" fill="#000"/></mask></defs>' +
      '<circle cx="50" cy="50" r="41.1" fill="none" stroke="currentColor" stroke-width="17.7" mask="url(#msGap)"/>' +
      '<circle cx="50" cy="50" r="18.6" fill="#E31E24"/><circle cx="56.3" cy="42.6" r="6" fill="#fff"/></svg>';
    return s.firstChild;
  }
  function brand(mini) {
    return h('a', { class: 'brand', href: '#/', style: mini ? { padding: 0 } : null },
      h('span', { class: 'brand-mark' }, modusLogo()),
      h('span', null, h('div', { class: 'brand-name' }, 'Модус Сигнал'), mini ? null : h('div', { class: 'brand-sub' }, 'ГК «Модус Трейд»')));
  }
  function activeKey() { const p = parse().parts; return p[0] || ''; }
  let lastListKey = 'mine';

  function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }
  function renderNav() {
    if (!navEl) return;
    const c = MS.state.counts || {}; const cp = caps(); const act = activeKey();
    const hl = act === 'appeal' ? lastListKey : act;
    const kids = [];
    NAV.forEach((sec, si) => {
      if (sec.cap && !cp[sec.cap]) return;
      kids.push(h('div', { class: 'rf-workspace-label' + (si ? ' rf-workspace-sub' : '') }, sec.sec || 'Разделы'));
      const items = [];
      sec.items.forEach((it) => {
        if (it.cta) return;
        if (it.cap && !cp[it.cap]) return;
        if (it.show && !it.show(MS.state.me || {}, cp)) return;
        const n = it.count ? it.count(c) : 0; const hot = it.hot ? it.hot(c) : 0;
        items.push(h('a', { href: '#/' + it.key, class: 'rf-nav-item' + (hl === it.key ? ' rf-active' : ''), 'aria-current': hl === it.key ? 'page' : null },
          icon(it.icon), h('span', { class: 'rf-nav-label' }, it.label),
          hot ? h('span', { class: 'rf-nav-count hot', title: hot + ' ' + (it.hotTitle || '') }, hot) : (n ? h('span', { class: 'rf-nav-count' }, n) : null)));
      });
      kids.push(h('nav', { 'aria-label': sec.sec || 'Разделы' }, items));
    });
    mount(navEl, kids);
    if (topCountEl) { topCountEl.textContent = c.unread ? String(c.unread) : ''; topCountEl.hidden = !c.unread; }
    renderFoot();
    renderTopPerson();
  }
  let helpOpen = false;
  function renderFoot() {
    if (!footEl) return;
    const b = MS.state.boot || {}; const app = b.app || {};
    const off = MS.state.timeOffsetMs || 0;
    const helpBox = h('div', { id: 'help-content', class: 'rf-disclosure', 'data-open': helpOpen ? 'true' : 'false' },
      h('div', { class: 'rf-disclosure-inner' }, h('p', { class: 'rf-help-text' }, 'Создайте обращение. Категория определит ответственного. В карточке вы увидите статус, уточнения и результат рассмотрения.')));
    mount(footEl,
      h('div', { class: 'rf-idea-note' },
        h('div', { class: 'rf-mini-spark' }, icon('bulb', 18)),
        h('h4', null, 'Есть идея?'),
        h('p', null, 'Даже небольшое предложение', h('br'), 'может изменить многое.'),
        h('button', { type: 'button', onclick: () => MS.go('/new') }, 'Поделиться идеей', icon('send', 16))),
      h('button', { class: 'rf-help-link', type: 'button', 'aria-expanded': helpOpen ? 'true' : 'false', 'aria-controls': 'help-content', onclick: () => { helpOpen = !helpOpen; renderFoot(); } }, icon('info', 18), 'Как это работает'),
      helpBox,
      off ? h('div', { class: 'rf-side-note', title: 'Время сдвинуто для демонстрации сроков' }, 'Демо-время: ' + fDT(MS.now()) + ' (+' + Math.round(off / 86400000) + ' дн.)') : null,
      h('div', { class: 'rf-sidebar-company', title: api.standalone ? 'Автономный демо-режим, данные в браузере' : 'Битрикс24: ' + (app.bitrixLive ? 'вебхук' : 'имитация') },
        h('span', { class: 'rf-live-dot' }), 'ГК «Модус Трейд»', h('span', null, 'v1.0')));
  }
  let personEl = null, themeBtnEl = null;
  function renderTopPerson() {
    const me = MS.state.me;
    if (personEl) mount(personEl, me ? [h('span', { class: 'rf-avatar' }, initials(me.name)),
      h('div', null, h('strong', null, me.name), h('small', null, me.roleLabel + ', ' + MS.deptName(me.departmentId)))] : []);
    if (themeBtnEl) mount(themeBtnEl, icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18));
  }

  function ensureShell() {
    if (shellEl && root().contains(shellEl)) return;
    navEl = h('div', { class: 'rf-nav-wrap' });
    footEl = h('div', { class: 'rf-sidebar-bottom' });
    const logo = h('img', { class: 'rf-brand-logo', src: 'img/modus-logo.svg', alt: 'Модус Трейд', width: '132', height: '42' });
    const sidebar = h('aside', { class: 'rf-sidebar' },
      h('a', { class: 'rf-brand', href: '#/' }, logo),
      h('button', { class: 'rf-mobile-close rf-icon-button', type: 'button', 'aria-label': 'Закрыть меню', onclick: () => shellEl.classList.remove('menu-open') }, icon('x', 18)),
      navEl, footEl);
    mainEl = h('main', { class: 'rf-main', id: 'main', tabindex: '-1' });
    topCountEl = h('span', { class: 'rf-bell-count', hidden: true });
    personEl = h('button', { class: 'rf-person', type: 'button', onclick: switchUser, title: 'Сменить пользователя' });
    themeBtnEl = h('button', { class: 'rf-icon-button', type: 'button', 'aria-label': 'Сменить тему', title: 'Сменить тему', onclick: toggleTheme });
    const top = h('header', { class: 'rf-topbar' },
      h('button', { class: 'rf-icon-button rf-mobile-toggle', type: 'button', 'aria-label': 'Открыть меню', onclick: (e) => { e.stopPropagation(); shellEl.classList.toggle('menu-open'); } }, icon('menu')),
      h('div', { class: 'rf-topbar-right' },
        h('div', { class: 'rf-bell' }, h('a', { class: 'rf-icon-button rf-bell-button', href: '#/notifications', 'aria-label': 'Уведомления' }, icon('bell', 18), topCountEl)),
        themeBtnEl, personEl,
        h('button', { class: 'rf-icon-button rf-logout', type: 'button', title: 'Выйти', 'aria-label': 'Выйти', onclick: logout }, icon('logout', 18))));
    shellEl = h('div', { class: 'rf-app' }, sidebar, h('div', { class: 'rf-main-shell' }, top, mainEl));
    shellEl.addEventListener('click', (e) => { if (shellEl.classList.contains('menu-open') && !sidebar.contains(e.target)) shellEl.classList.remove('menu-open'); });
    sidebar.addEventListener('click', (e) => { if (e.target.closest('a')) shellEl.classList.remove('menu-open'); });
    mount(root(), shellEl);
  }

  // ---------- вход ----------
  const SCENARIO = {
    u_emp_proc: 'Подать обращение с файлом, увидеть маршрут и сроки, получить ответ и оценить результат',
    u_it: 'Разобрать входящие, запросить уточнение, объединить дубли, зафиксировать решение',
    u_dir: 'Контроль просрочек и эскалаций, аналитика по типам и подразделениям, повторяющиеся темы',
    u_admin: 'Правила маршрутизации, сроки SLA, замещения, интеграции, демо-время',
  };
  const passwordMode = () => ((MS.state.boot || {}).app || {}).loginMode === 'password';
  async function afterLogin(r, targetPath) {
    api.setToken(r.token);
    await loadBoot();
    if (r.mustChangePassword) { changePassword(true); return; }
    toast('Вы вошли как ' + r.me.name);
    shellEl = null;
    const target = targetPath || defaultPath();
    if (location.hash === '#' + target) route(); else location.hash = '#' + target;
  }
  async function loginWithPassword(email, password) {
    const r = await api.post('/login', { email, password });
    return afterLogin(r);
  }
  function changePassword(forced) {
    const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Текущий пароль', placeholder: 'Текущий (временный) пароль' });
    const nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Новый пароль', placeholder: 'Новый пароль (от 10 символов)', minlength: '10', maxlength: '128' });
    const nw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Повтор пароля', placeholder: 'Повторите новый пароль', maxlength: '128' });
    const body = h('div', { class: 'stack' },
      forced ? h('div', { class: 'callout yellow' }, icon('alert'), h('div', null, 'Задайте собственный пароль, чтобы продолжить.')) : null,
      cur, nw, nw2, h('div', { class: 'small muted' }, 'Минимум 10 символов и 3 вида символов (или фраза от 16 символов). Нельзя использовать имя, e-mail и распространённые пароли.'));
    modal({ title: 'Смена пароля', body, ok: 'Сохранить', async onOk() {
      if (nw.value !== nw2.value) { toast('Пароли не совпадают', 'err'); return false; }
      try { await api.post('/me/password', { currentPassword: cur.value, newPassword: nw.value }); }
      catch (e) { toast(e.message, 'err'); return false; }
      toast('Пароль изменён');
      await loadBoot(); shellEl = null; location.hash = '#' + defaultPath(); route();
      return true;
    } });
  }
  async function loginAs(userId, targetPath) {
    const b = MS.state.boot || {};
    const acc = (b.demoAccounts || []).find((x) => x.id === userId);
    const r = passwordMode() && acc ? await api.post('/login', { email: acc.email, password: b.demoPassword }) : await api.post('/login', { userId });
    return afterLogin(r, targetPath);
  }
  function userPicker(onPick) {
    const b = MS.state.boot || {};
    const sel = MS.ui.select([{ value: '', label: '— другой сотрудник —' }].concat((b.users || []).map((u) => ({ value: u.id, label: u.name + ' — ' + u.position + ' (' + u.roleLabel + ')' }))), '', { 'aria-label': 'Сотрудник' });
    return h('div', { class: 'stack' },
      h('div', { class: 'login-grid' }, (b.demoUsers || []).map((u) => h('button', { type: 'button', class: 'login-card', onclick: () => onPick(u.id) },
        avatar(u.name), h('span', { class: 'grow' },
          h('div', { class: 'row' }, h('b', null, u.name), h('span', { class: 'badge t-blue' }, u.roleLabel)),
          h('div', { class: 'r' }, u.position + ' · ' + MS.deptName(u.departmentId)),
          h('div', { class: 'small', style: { marginTop: '6px' } }, SCENARIO[u.id] || u.about))))),
      h('div', { class: 'row nw' }, sel, h('button', { class: 'btn', type: 'button', onclick: () => sel.value && onPick(sel.value) }, 'Войти')));
  }
  const SVG = {
    arrowUR: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>',
    arrowR: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  function svg(name) { const s = document.createElement('span'); s.className = 'ico'; s.innerHTML = SVG[name]; return s; }
  // Левая панель. #login-scene — место для будущей 3D-сцены (логотип Модус). Сейчас — CSS-анимация орбит.
  function loginArt() {
    return h('div', { class: 'login-art', 'aria-hidden': 'true' },
      h('div', { class: 'login-brand' }, h('span', { class: 'brand-mark' }, modusLogo()),
        h('span', null, h('b', null, 'МОДУС'), h('i', null, 'ТРЕЙД'))),
      h('div', { class: 'orbital', id: 'login-scene' },
        h('div', { class: 'orbit o1' }), h('div', { class: 'orbit o2' }, h('span', { class: 'sat' })), h('div', { class: 'orbit o3' }, h('span', { class: 'sat red' })),
        h('div', { class: 'core' }, modusLogo()),
        h('span', { class: 'orbit-chip oc1' }, 'Идея становится действием ', svg('arrowUR')),
        h('span', { class: 'orbit-chip oc2' }, h('span', { class: 'live-dot' }), 'Каждый голос имеет значение')),
      h('div', { class: 'login-statement' },
        h('span', { class: 'eyebrow' }, 'ОБРАТНАЯ СВЯЗЬ, КОТОРАЯ РАБОТАЕТ'),
        h('h1', null, 'Большие перемены', h('br'), 'начинаются ', h('em', null, 'с вас.')),
        h('p', null, 'Делитесь идеями, сообщайте о проблемах', h('br'), 'и следите, как компания становится лучше.')),
      h('div', { class: 'art-footer' }, 'ГК «Модус Трейд»', h('span', null, 'Внутренняя платформа')));
  }
  function renderLogin() {
    shellEl = null; navEl = null; footEl = null;
    const b = MS.state.boot || {};
    const accounts = b.demoAccounts || [];
    const err = h('div', { class: 'login-error', role: 'alert', hidden: 'hidden' });
    const showErr = (m) => { err.textContent = m || ''; if (m) err.removeAttribute('hidden'); else err.setAttribute('hidden', 'hidden'); };
    const email = h('input', { type: 'email', required: 'required', placeholder: 'name@modus-trade.example', autocomplete: 'username', maxlength: '200', id: 'login-email' });
    const pw = h('input', { type: 'password', required: 'required', placeholder: 'Введите пароль', autocomplete: 'current-password', maxlength: '200', id: 'login-pw' });
    const eyeBtn = h('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Показать пароль', onclick: () => { const sh = pw.type === 'password'; pw.type = sh ? 'text' : 'password'; eyeBtn.classList.toggle('on', sh); eyeBtn.setAttribute('aria-label', sh ? 'Скрыть пароль' : 'Показать пароль'); } }, svg('eye'));
    const btn = h('button', { type: 'submit', class: 'button button-primary full' }, h('span', null, 'Войти'), svg('arrowR'));
    const chips = [];
    const pickRole = (acc, chip) => {
      chips.forEach((c) => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed', 'true');
      email.value = acc.email; pw.value = b.demoPassword || 'demo1234'; showErr(''); btn.focus();
    };
    const form = h('form', { novalidate: 'novalidate', onsubmit: async (ev) => {
      ev.preventDefault(); showErr('');
      if (!email.value.trim() || !pw.value) { showErr('Введите рабочую почту и пароль'); (email.value.trim() ? pw : email).focus(); return; }
      btn.disabled = true; btn.classList.add('loading');
      try {
        if (passwordMode()) await loginWithPassword(email.value, pw.value);
        else {
          // Автономный режим без сервера: демо-аккаунты проверяются локально
          const acc = accounts.find((x) => x.email.toLowerCase() === email.value.trim().toLowerCase());
          if (!acc || pw.value !== (b.demoPassword || 'demo1234')) throw new Error('Неверный e-mail или пароль');
          await loginAs(acc.id);
        }
      } catch (e) { showErr(e.message); pw.value = ''; pw.focus(); }
      finally { btn.disabled = false; btn.classList.remove('loading'); }
    } },
      h('label', { for: 'login-email' }, 'Рабочая почта', email),
      h('label', { for: 'login-pw' }, 'Пароль', h('span', { class: 'pw-wrap' }, pw, eyeBtn)),
      err, btn);
    const demo = accounts.length ? h('div', { class: 'demo-box' },
      h('div', { class: 'demo-title' }, svg('shield'), 'Демонстрационный доступ'),
      h('p', null, 'Выберите роль, затем нажмите «Войти».'),
      h('div', { class: 'demo-roles', role: 'group', 'aria-label': 'Демо-роли' }, accounts.map((acc) => {
        const chip = h('button', { type: 'button', 'aria-pressed': 'false', title: acc.name + ' · ' + acc.email, onclick: () => pickRole(acc, chip) }, acc.roleLabel);
        chips.push(chip); return chip;
      })),
      h('small', null, 'Все данные вымышлены. Пароль: ' + (b.demoPassword || 'demo1234'))) : null;
    mount(root(), h('div', { class: 'login-page' }, loginArt(),
      h('div', { class: 'login-form-wrap' }, h('div', { class: 'login-form' },
        h('div', { class: 'login-brand mobile' }, h('span', { class: 'brand-mark' }, modusLogo()), h('span', null, h('b', null, 'МОДУС'), h('i', null, 'ТРЕЙД'))),
        h('span', { class: 'eyebrow' }, 'РАДЫ ВАС ВИДЕТЬ'),
        h('h2', null, 'Вход в систему'),
        h('p', { class: 'muted' }, 'Ваши идеи. Понятный процесс. Видимый результат.'),
        form, demo,
        h('p', { class: 'login-note' }, svg('shield'), 'Доступ только для сотрудников компании')))));
  }
  function switchUser() {
    if (passwordMode()) { modal({ title: MS.state.me ? MS.state.me.name : 'Учётная запись', body: h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { document.querySelector('.overlay') && document.querySelector('.overlay').remove(); changePassword(false); } }, 'Сменить пароль'), h('button', { class: 'btn', type: 'button', onclick: () => { document.querySelector('.overlay') && document.querySelector('.overlay').remove(); logout(); } }, 'Выйти')), hideActions: true }); return; }
    let done = false;
    const body = userPicker((id) => { if (done) return; done = true; document.querySelector('.overlay') && document.querySelector('.overlay').remove(); loginAs(id).catch((e) => toast(e.message, 'err')); });
    modal({ title: 'Сменить пользователя', body, hideActions: true });
  }
  async function logout() { try { await api.post('/logout'); } catch (e) { /* сессия уже истекла */ } api.setToken(''); MS.state.me = null; location.hash = '#/login'; renderLogin(); }
  function onUnauthorized() { api.setToken(''); MS.state.me = null; renderLogin(); }

  // ---------- рендер страницы ----------
  const VIEW_BY_KEY = { home: 'home', new: 'create', mine: 'list', inbox: 'list', all: 'list', feed: 'list', appeal: 'appeal', board: 'board', analytics: 'analytics', notifications: 'notifications', admin: 'admin', kb: 'kb', impact: 'impact' };
  const SCOPE_BY_KEY = { mine: 'mine', inbox: 'assigned', all: 'all', feed: 'feed' };
  async function route() {
    const r = parse();
    if (!MS.state.me || r.parts[0] === 'login') {
      if (MS.state.me && r.parts[0] === 'login') { location.hash = '#' + defaultPath(); return; }
      renderLogin(); return;
    }
    if (!r.parts[0]) { location.hash = '#' + defaultPath(); return; }
    ensureShell();
    const key = r.parts[0];
    if (SCOPE_BY_KEY[key]) lastListKey = key;
    renderNav();
    const seq = ++renderSeq;
    const alive = () => seq === renderSeq;
    const view = MS.views[VIEW_BY_KEY[key]];
    mount(mainEl, MS.ui.loading());
    window.scrollTo(0, 0);
    if (!view) { mount(mainEl, MS.ui.empty('Страница не найдена', h('p', null, h('a', { href: '#/' }, 'На главную')))); return; }
    try {
      await view(mainEl, { key, scope: SCOPE_BY_KEY[key], id: r.parts[1], tab: r.parts[1], query: r.query }, alive);
    } catch (e) {
      if (!alive()) return;
      mount(mainEl, h('div', { class: 'callout red' }, icon('alert'), h('div', null, h('b', null, e.status === 403 ? 'Нет доступа. ' : e.status === 404 ? 'Не найдено. ' : 'Ошибка. '), e.message || String(e))));
    }
  }

  async function start() {
    applyTheme(currentTheme());
    try { await loadBoot(); }
    catch (e) { mount(root(), h('div', { class: 'login' }, h('div', { class: 'callout red' }, icon('alert'), h('div', null, h('b', null, 'Не удалось загрузить приложение. '), e.message)))); return; }
    if (!MS.state.me && api.getToken()) api.setToken('');
    window.addEventListener('hashchange', route);
    route();
    setInterval(() => { if (!document.hidden) refresh(); }, api.standalone ? 60000 : 30000);
  }

  MS.app = { refresh, setCounts, loadBoot, route, onUnauthorized, renderNav, switchUser, caps, loginAs,
    afterAction(resp) { if (resp && resp.counts) setCounts(resp.counts); } };
  document.addEventListener('DOMContentLoaded', start);
})();
