// Модус Сигнал — HTTP-подобный API движка. Один и тот же код обслуживает Node-сервер и автономную демо-версию.
import { APP_NAME, APP_VERSION, TYPES, PRIORITIES, STATUSES, TRANSITIONS, TRANSITION_META, REJECT_TEMPLATES, ROLES, SLA_KINDS, DAY, addBusinessDays, makeId } from './model.js';
import { STATE_VERSION, AppError, failWith, getUser, getDept, getCategory, findAppeal, getAppeal, headOfDept, isUserAbsent, routeAppeal, slaFor, recomputeDues, isFinal, overdueOf, runSlaCheck, viewerKeys, isAdminUser, isManagerUser, isAuthorOf, isStaffOf, accessLevel, projectAppeal } from './engine-core.js';
import { createAppeal, changeStatus, addComment, reassignAppeal, setPriority, setDueDate, setNextAction, setPublic, toggleSupport, rateAppeal, withdrawAppeal, mergeAppeals } from './engine-actions.js';
import { computeAnalytics, exportCsv } from './engine-analytics.js';
import { buildTextIndex, findSimilar } from './text.js';
import { buildSeedState } from './seed-build.js';
import { kbRoute } from './engine-kb.js';
import { checkPasswordStrength, randomHex as fallbackRandomHex, sanitizeInput, pick } from './security.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // абсолютный срок жизни сессии
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Демо-вход без пароля: на сервере — только при DEMO_LOGIN=1; в автономной версии и тестах — всегда
function demoLoginAllowed(ctx) { return ctx.env.mode === 'server' ? !!ctx.env.demoLogin : ctx.env.demoLogin !== false; }
function demoToolsAllowed(ctx) { return ctx.env.mode === 'server' ? !!ctx.env.demoTools : ctx.env.demoTools !== false; }
function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { failWith(400, 'Некорректный адрес'); } }

export { buildSeedState };

function apiUser(ctx, u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, position: u.position, departmentId: u.departmentId, role: u.role,
    roleLabel: ROLES[u.role] ? ROLES[u.role].label : u.role, demo: u.demo || 0, deputyId: u.deputyId || null,
    absent: isUserAbsent(u, ctx.now), absentUntil: u.absent ? u.absentUntil || null : null,
  };
}
function apiMe(ctx, u) {
  const p = apiUser(ctx, u);
  if (!p) return null;
  p.caps = { analytics: isManagerUser(u), admin: isAdminUser(u), handler: u.role !== 'employee' };
  p.mustChangePassword = !!u.mustChangePassword;
  return p;
}
function apiRequireMe(me) { if (!me) failWith(401, 'Войдите в систему'); return me; }
function apiRequireAdmin(me) { apiRequireMe(me); if (!isAdminUser(me)) failWith(403, 'Раздел доступен только администратору'); return me; }
function apiAudit(ctx, me, action, details) {
  ctx.state.audit = ctx.state.audit || [];
  ctx.state.audit.push({ id: makeId('au'), at: ctx.now, actorId: me ? me.id : null, action, details: details || null });
  if (ctx.state.audit.length > 500) ctx.state.audit.splice(0, ctx.state.audit.length - 500);
}

// Очередь пользователя: назначено ему, эскалировано ему или назначено сотруднику его подразделения (для руководителя)
export function inQueueOf(ctx, u, a) {
  if (a.assigneeId === u.id) return true;
  if ((a.escalations || []).some((e) => e.toId === u.id)) return true;
  if (u.role === 'manager') { const asg = getUser(ctx.state, a.assigneeId); if (asg && headOfDept(ctx.state, asg.departmentId) === u.id) return true; }
  return false;
}

const API_SORTS = {
  new: (a, b) => b.createdAt - a.createdAt,
  old: (a, b) => a.createdAt - b.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  support: (a, b) => b.supporters.length - a.supporters.length || b.createdAt - a.createdAt,
  priority: (a, b) => PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank || a.createdAt - b.createdAt,
};

function apiFilterAppeals(ctx, me, q) {
  const st = ctx.state;
  let items = st.appeals.filter((a) => accessLevel(ctx, me, a));
  const scope = q.scope || 'all';
  if (scope === 'mine') items = items.filter((a) => isAuthorOf(ctx, me, a));
  else if (scope === 'assigned') items = items.filter((a) => inQueueOf(ctx, me, a));
  else if (scope === 'feed') items = items.filter((a) => a.isPublic && !a.mergedInto);
  else if (scope === 'supported') items = items.filter((a) => a.supporters.includes(me.id));
  if (q.status === 'open') items = items.filter((a) => !isFinal(a));
  else if (q.status === 'final') items = items.filter((a) => isFinal(a));
  else if (q.status) { const s = String(q.status).split(','); items = items.filter((a) => s.includes(a.status)); }
  if (q.type) items = items.filter((a) => a.type === q.type);
  if (q.priority) items = items.filter((a) => a.priority === q.priority);
  if (q.categoryId) items = items.filter((a) => a.categoryId === q.categoryId);
  if (q.groupId) items = items.filter((a) => { const c = getCategory(st, a.categoryId); return c && c.groupId === q.groupId; });
  if (q.departmentId) items = items.filter((a) => (q.departmentId === 'anon' ? a.anonymous : a.authorDepartmentId === q.departmentId));
  if (q.assigneeId) items = items.filter((a) => a.assigneeId === q.assigneeId);
  if (q.overdue === '1' || q.overdue === true) items = items.filter((a) => isStaffOf(ctx, me, a) || isAuthorOf(ctx, me, a)).filter((a) => overdueOf(a, ctx.now));
  if (q.from) items = items.filter((a) => a.createdAt >= Number(q.from));
  if (q.to) items = items.filter((a) => a.createdAt <= Number(q.to));
  if (q.q) {
    const needle = String(q.q).toLowerCase().trim();
    items = items.filter((a) => (a.id + ' ' + a.title + ' ' + a.description + ' ' + (a.proposedSolution || '')).toLowerCase().includes(needle));
  }
  const sort = q.sort || 'new';
  if (sort === 'due') {
    const key = (a) => { const o = overdueOf(a, ctx.now); if (o) return o.due - 1e15; if (isFinal(a)) return 1e15 + a.createdAt; return a.status === 'progress' ? a.dueDate || a.decisionDue : a.firstResponseAt ? a.decisionDue : a.firstResponseDue; };
    items.sort((a, b) => key(a) - key(b));
  } else items.sort(API_SORTS[sort] || API_SORTS.new);
  return items;
}

function apiCounts(ctx, me) {
  const st = ctx.state;
  const vis = st.appeals.filter((a) => accessLevel(ctx, me, a));
  const mine = vis.filter((a) => isAuthorOf(ctx, me, a));
  const queue = vis.filter((a) => inQueueOf(ctx, me, a) && !isFinal(a));
  const keys = viewerKeys(ctx, me);
  return {
    mineOpen: mine.filter((a) => !isFinal(a)).length, mineTotal: mine.length,
    mineAwaiting: mine.filter((a) => a.status === 'clarify').length,
    queueOpen: queue.length, queueNew: queue.filter((a) => a.status === 'new').length,
    queueOverdue: queue.filter((a) => overdueOf(a, ctx.now)).length,
    allOverdue: isManagerUser(me) ? vis.filter((a) => (isStaffOf(ctx, me, a)) && overdueOf(a, ctx.now)).length : 0,
    feedOpen: vis.filter((a) => a.isPublic && !a.mergedInto && !isFinal(a)).length,
    unread: st.notifications.filter((n) => !n.read && keys.includes(n.key)).length,
  };
}

// ---------- похожие обращения (защита от дублей) ----------
function apiSimilar(ctx, me, text, excludeIds, limit) {
  const st = ctx.state;
  const pool = st.appeals.filter((a) => !a.mergedInto);
  const index = buildTextIndex(pool.map((a) => ({ id: a.id, text: a.title + '. ' + a.description })));
  const found = findSimilar(index, text, { limit: (limit || 5) + 4, threshold: st.settings.similarThreshold || 0.16, exclude: excludeIds || [] });
  const items = [];
  let hidden = 0;
  for (const f of found) {
    const a = findAppeal(st, f.id);
    if (!a || !accessLevel(ctx, me, a)) { hidden++; continue; }
    if (items.length >= (limit || 5)) continue;
    const p = projectAppeal(ctx, me, a, false);
    items.push({ id: a.id, title: a.title, type: a.type, status: a.status, categoryId: a.categoryId, score: Math.round(f.score * 100) / 100,
      supportersCount: p.supportersCount, supportedByMe: p.supportedByMe, mine: p.mine, isFinal: isFinal(a), result: a.result || a.decision || '' });
  }
  return { items, hidden };
}

function apiRoutePreview(ctx, me, body) {
  const st = ctx.state;
  const cat = getCategory(st, body.categoryId);
  if (!TYPES[body.type] || !cat) return { assignee: null, trace: [], fallback: false };
  const r = routeAppeal(st, { type: body.type, categoryId: cat.id, authorDepartmentId: body.anonymous ? null : body.departmentId || (me && me.departmentId) }, ctx.now);
  const pr = PRIORITIES[body.priority] ? body.priority : body.type === 'praise' ? 'low' : 'medium';
  const s = slaFor(st, pr);
  const asg = getUser(st, r.assigneeId);
  return { assignee: asg ? { id: asg.id, name: asg.name, position: asg.position } : null, ruleId: r.ruleId, trace: r.trace, fallback: r.fallback,
    priority: pr, firstResponseDue: addBusinessDays(ctx.now, s.first), decisionDue: addBusinessDays(ctx.now, s.decision), sla: s };
}

// ---------- «Вы сказали — мы сделали»: публичная доска результатов ----------
function apiBoard(ctx, me) {
  const st = ctx.state;
  const pub = st.appeals.filter((a) => a.isPublic && !a.mergedInto && accessLevel(ctx, me, a));
  const done = pub.filter((a) => a.status === 'done').sort((a, b) => b.resolvedAt - a.resolvedAt);
  const progress = pub.filter((a) => a.status === 'progress').sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  const open = pub.filter((a) => !isFinal(a) && a.status !== 'progress').sort((a, b) => b.supporters.length - a.supporters.length || b.createdAt - a.createdAt);
  const ratings = st.appeals.filter((a) => a.rating).map((a) => a.rating.score);
  const p = (a) => projectAppeal(ctx, me, a, false);
  return {
    stats: {
      implemented: st.appeals.filter((a) => a.status === 'done').length,
      implemented30: st.appeals.filter((a) => a.status === 'done' && a.resolvedAt >= ctx.now - 30 * DAY).length,
      inProgress: st.appeals.filter((a) => a.status === 'progress').length,
      answered: st.appeals.filter((a) => a.firstResponseAt && !a.mergedInto).length,
      total: st.appeals.filter((a) => !a.mergedInto).length,
      avgRating: ratings.length ? Math.round((ratings.reduce((x, y) => x + y, 0) / ratings.length) * 10) / 10 : null,
    },
    done: done.slice(0, 20).map(p), progress: progress.slice(0, 20).map(p), popular: open.slice(0, 10).map(p),
  };
}

function apiNotifications(ctx, me, q) {
  const st = ctx.state;
  const keys = viewerKeys(ctx, me);
  const mine = st.notifications.filter((n) => keys.includes(n.key)).sort((a, b) => b.at - a.at);
  const limit = Math.min(200, Number(q.limit) || 60);
  return {
    unread: mine.filter((n) => !n.read).length,
    items: mine.slice(0, limit).map((n) => { const a = n.appealId ? findAppeal(st, n.appealId) : null; return { id: n.id, appealId: n.appealId, kind: n.kind, text: n.text, at: n.at, read: n.read, appealTitle: a && accessLevel(ctx, me, a) ? a.title : null }; }),
  };
}

// ---------- администрирование ----------
function apiValidateRules(ctx, list) {
  const st = ctx.state;
  if (!Array.isArray(list)) failWith(400, 'Ожидается список правил');
  return list.map((r, i) => {
    const name = String(r.name || '').trim().slice(0, 160) || 'Правило ' + (i + 1);
    if (r.type && !TYPES[r.type]) failWith(400, name + ': неизвестный тип');
    if (r.categoryId && !getCategory(st, r.categoryId)) failWith(400, name + ': неизвестная категория');
    if (r.authorDepartmentId && !getDept(st, r.authorDepartmentId)) failWith(400, name + ': неизвестное подразделение');
    const t = r.target || {};
    let target;
    if (t.kind === 'authorDepartmentHead') target = { kind: 'authorDepartmentHead' };
    else {
      const u = getUser(st, t.userId);
      if (!u || u.role === 'employee') failWith(400, name + ': выберите ответственного (не рядового сотрудника)');
      target = { kind: 'user', userId: u.id };
    }
    return { id: typeof r.id === 'string' && SAFE_ID.test(r.id) ? r.id : makeId('r'), name, type: r.type || null, categoryId: r.categoryId || null, authorDepartmentId: r.authorDepartmentId || null, target, enabled: r.enabled !== false };
  });
}
function apiValidateCategories(ctx, list) {
  const st = ctx.state;
  if (!Array.isArray(list)) failWith(400, 'Ожидается список категорий');
  const out = list.map((c) => {
    const name = String(c.name || '').trim().slice(0, 100);
    if (name.length < 2) failWith(400, 'Название категории: минимум 2 символа');
    if (!st.groups.some((g) => g.id === c.groupId)) failWith(400, name + ': выберите группу');
    const kw = Array.isArray(c.keywords) ? c.keywords : String(c.keywords || '').split(',');
    return { id: typeof c.id === 'string' && SAFE_ID.test(c.id) ? c.id : makeId('c'), groupId: c.groupId, name, keywords: kw.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 20), enabled: c.enabled !== false };
  });
  for (const old of st.categories) {
    if (!out.some((c) => c.id === old.id) && st.appeals.some((a) => a.categoryId === old.id)) out.push(Object.assign({}, old, { enabled: false }));
  }
  return out;
}
function apiAdminConfig(ctx) {
  const st = ctx.state;
  return {
    rules: st.rules, categories: st.categories, groups: st.groups, departments: st.departments,
    users: st.users.map((u) => Object.assign(apiUser(ctx, u), { email: u.email, absentFlag: !!u.absent, absentUntilRaw: u.absentUntil || null, hasPassword: !!u.passwordHash, locked: !!(u.lockedUntil && u.lockedUntil > ctx.env.now()) })),
    settings: { sla: slaForAll(st), secondEscalationDays: st.settings.secondEscalationDays, coordinatorId: st.settings.coordinatorId, similarThreshold: st.settings.similarThreshold, timeOffsetMs: st.settings.timeOffsetMs || 0 },
    audit: (st.audit || []).slice(-60).reverse(), seedWarnings: st.seedWarnings || [],
    integrations: { bitrixLive: !!ctx.env.bitrixLive, email: 'simulated' }, demoTools: demoToolsAllowed(ctx),
  };
}
function slaForAll(st) { return { high: slaFor(st, 'high'), medium: slaFor(st, 'medium'), low: slaFor(st, 'low') }; }

// ---------- вход ----------
function apiLogin(ctx, body, engine) {
  const st = ctx.state;
  const realNow = ctx.env.now();
  let u = null;
  if (demoLoginAllowed(ctx) && body.userId) {
    u = typeof body.userId === 'string' ? getUser(st, body.userId) : null;
    if (!u) failWith(401, 'Неверные данные для входа');
  } else {
    if (!ctx.env.verifyPassword) failWith(400, 'Вход по паролю доступен только в серверной версии');
    const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
    const password = String(body.password || '').slice(0, 200);
    if (!email || !password) failWith(400, 'Введите e-mail и пароль');
    const cand = st.users.find((x) => String(x.email || '').toLowerCase() === email && !x.disabled) || null;
    if (cand && cand.lockedUntil && cand.lockedUntil > realNow) failWith(429, 'Слишком много неудачных попыток. Попробуйте через ' + Math.ceil((cand.lockedUntil - realNow) / 60000) + ' мин.');
    // Сравнение выполняется всегда (даже для несуществующего e-mail), чтобы по времени ответа нельзя было угадать учётные записи
    // Демо-аккаунт без собственного пароля входит по общему демо-паролю (только вне production)
    const stored = cand ? (cand.passwordHash || (cand.demo && ctx.env.demoPasswordHash) || null) : null;
    const good = ctx.env.verifyPassword(stored, password);
    if (!good || !cand) {
      if (cand) {
        cand.failedLogins = (cand.failedLogins || 0) + 1;
        if (cand.failedLogins >= MAX_FAILED_LOGINS) { cand.lockedUntil = realNow + LOCK_MS; cand.failedLogins = 0; apiAudit(ctx, null, 'login-lock', cand.name + ': блокировка на 15 мин.'); }
      }
      return { status: 401, json: { error: 'Неверный e-mail или пароль' }, changed: !!cand };
    }
    u = cand;
    u.failedLogins = 0; u.lockedUntil = null;
  }
  const token = engine.createSession(u.id);
  apiAudit(ctx, u, 'login', u.name);
  const json = { me: apiMe(ctx, u), mustChangePassword: !!u.mustChangePassword && !!ctx.env.hashPassword };
  // На сервере токен уходит только в HttpOnly-cookie (JS его не видит); в автономной демо-версии — в ответе
  if (ctx.env.mode !== 'server') json.token = token;
  return { status: 200, json, session: { token, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) }, changed: true };
}

// ---------- маршрутизатор ----------
function apiRoute(ctx, method, path, q, body, me, engine) {
  const st = ctx.state;
  const seg = path.split('/').filter(Boolean);
  const ok = (json, changed) => ({ status: 200, json, changed: !!changed });
  const full = (a) => projectAppeal(ctx, me, a, true);

  if (method === 'GET' && path === '/bootstrap') {
    return ok({
      app: { name: APP_NAME, version: APP_VERSION, stateVersion: STATE_VERSION, seededAt: st.seededAt || null, bitrixLive: !!ctx.env.bitrixLive, mode: ctx.env.mode || 'server', loginMode: demoLoginAllowed(ctx) ? 'demo' : 'password', demoTools: demoToolsAllowed(ctx) },
      me: apiMe(ctx, me), counts: me ? apiCounts(ctx, me) : null, nowMs: ctx.now, timeOffsetMs: st.settings.timeOffsetMs || 0,
      users: me || demoLoginAllowed(ctx) ? st.users.map((u) => apiUser(ctx, u)) : [], departments: st.departments, groups: st.groups, categories: st.categories.filter((c) => c.enabled !== false),
      types: TYPES, statuses: STATUSES, priorities: PRIORITIES, roles: ROLES, transitions: TRANSITIONS, transitionMeta: TRANSITION_META,
      rejectTemplates: REJECT_TEMPLATES, slaKinds: SLA_KINDS, sla: slaForAll(st),
      demoAccounts: !(demoLoginAllowed(ctx) || ctx.env.demoAccounts) ? [] : st.users.filter((u) => u.demo && !u.disabled).sort((a, b) => a.demo - b.demo).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: ROLES[u.role].label })),
      demoPassword: demoLoginAllowed(ctx) || ctx.env.demoAccounts ? 'demo1234' : null,
      demoUsers: !demoLoginAllowed(ctx) ? [] : st.users.filter((u) => u.demo).sort((a, b) => a.demo - b.demo).map((u) => Object.assign(apiUser(ctx, u), { about: ROLES[u.role].about })),
    });
  }
  if (method === 'POST' && path === '/login') return apiLogin(ctx, body, engine);
  if (method === 'POST' && path === '/logout') { engine.dropSession(ctx.token); return { status: 200, json: { ok: true }, session: null, changed: true }; }
  if (method === 'GET' && path === '/me') { apiRequireMe(me); return ok({ me: apiMe(ctx, me), counts: apiCounts(ctx, me), nowMs: ctx.now }); }
  if (method === 'POST' && path === '/me/password') {
    apiRequireMe(me);
    if (!ctx.env.hashPassword) failWith(400, 'Пароли доступны только в серверной версии');
    if (me.passwordHash && !ctx.env.verifyPassword(me.passwordHash, String(body.currentPassword || '').slice(0, 200))) failWith(403, 'Текущий пароль указан неверно');
    const next = String(body.newPassword || '');
    const chk = checkPasswordStrength(next, me);
    if (!chk.ok) failWith(400, chk.reason);
    if (me.passwordHash && ctx.env.verifyPassword(me.passwordHash, next)) failWith(400, 'Новый пароль должен отличаться от текущего');
    me.passwordHash = ctx.env.hashPassword(next);
    me.mustChangePassword = false;
    engine.dropUserSessions(me.id, ctx.token); // выход со всех других устройств
    apiAudit(ctx, me, 'password', 'Смена собственного пароля');
    return ok({ me: apiMe(ctx, me) }, true);
  }
  // Временный пароль нужно сменить до любой работы
  if (me && me.mustChangePassword && ctx.env.hashPassword && path !== '/bootstrap') failWith(403, 'Сначала смените временный пароль', { code: 'must_change_password' });

  if (seg[0] === 'appeals') {
    apiRequireMe(me);
    if (seg.length === 1 && method === 'GET') {
      const items = apiFilterAppeals(ctx, me, q);
      const limit = Math.min(500, Number(q.limit) || 300);
      return ok({ total: items.length, items: items.slice(0, limit).map((a) => projectAppeal(ctx, me, a, false)), counts: apiCounts(ctx, me) });
    }
    if (seg.length === 1 && method === 'POST') {
      const a = createAppeal(ctx, me, body, ctx.now, { source: 'user' });
      return { status: 201, json: { appeal: full(a), counts: apiCounts(ctx, me) }, changed: true };
    }
    const a = findAppeal(st, safeDecode(seg[1]).slice(0, 40));
    // Нет доступа = «не найдено»: нельзя узнать, существует ли чужое обращение (защита от перебора номеров)
    if (!a || !accessLevel(ctx, me, a)) failWith(404, 'Обращение не найдено');
    if (seg.length === 2 && method === 'GET') {
      const p = full(a);
      const sim = apiSimilar(ctx, me, a.title + '. ' + a.description, [a.id].concat(a.duplicates || []), 4);
      p.similar = sim.items;
      p.similarHidden = sim.hidden;
      if (isStaffOf(ctx, me, a)) p.assignable = st.users.filter((u) => u.role !== 'employee' && u.id !== a.assigneeId).map((u) => apiUser(ctx, u));
      return ok({ appeal: p, counts: apiCounts(ctx, me) });
    }
    if (method !== 'POST' || seg.length !== 3) failWith(404, 'Неизвестное действие');
    const act = seg[2];
    let extra = null;
    if (act === 'status') changeStatus(ctx, me, a, { to: body.to, text: body.text, dueDate: body.dueDate }, ctx.now);
    else if (act === 'comments') addComment(ctx, me, a, { text: body.text, internal: !!body.internal }, ctx.now);
    else if (act === 'assign') reassignAppeal(ctx, me, a, { assigneeId: body.assigneeId, reason: body.reason }, ctx.now);
    else if (act === 'priority') setPriority(ctx, me, a, { priority: body.priority, reason: body.reason }, ctx.now);
    else if (act === 'due') setDueDate(ctx, me, a, { dueDate: body.dueDate, reason: body.reason }, ctx.now);
    else if (act === 'next-action') setNextAction(ctx, me, a, { text: body.text }, ctx.now);
    else if (act === 'publish') setPublic(ctx, me, a, { isPublic: body.isPublic }, ctx.now);
    else if (act === 'support') extra = toggleSupport(ctx, me, a, ctx.now);
    else if (act === 'rate') rateAppeal(ctx, me, a, { score: body.score, text: body.text }, ctx.now);
    else if (act === 'withdraw') withdrawAppeal(ctx, me, a, { text: body.text }, ctx.now);
    else if (act === 'merge') {
      const target = findAppeal(st, String(body.targetId || '').trim().toUpperCase().slice(0, 40));
      if (!target || !accessLevel(ctx, me, target)) failWith(404, 'Обращение для объединения не найдено');
      mergeAppeals(ctx, me, a, target, ctx.now);
      extra = { targetId: target.id };
    } else failWith(404, 'Неизвестное действие');
    if (act !== 'support') a.updatedAt = Math.max(a.updatedAt || 0, ctx.now);
    return ok({ appeal: full(a), result: extra, counts: apiCounts(ctx, me) }, true);
  }

  { const kbr = kbRoute(ctx, method, path, q, body, me); if (kbr) return kbr; }
  if (method === 'POST' && path === '/similar') {
    apiRequireMe(me);
    const text = String(body.title || '') + '. ' + String(body.text || '');
    if (text.replace(/[\s.]/g, '').length < 8) return ok({ items: [], hidden: 0 });
    return ok(apiSimilar(ctx, me, text, body.excludeId ? [body.excludeId] : [], 5));
  }
  if (method === 'POST' && path === '/route-preview') { apiRequireMe(me); return ok(apiRoutePreview(ctx, me, body)); }
  if (method === 'GET' && path === '/analytics') { apiRequireMe(me); return ok(computeAnalytics(ctx, me, q)); }
  if (method === 'GET' && path === '/export.csv') {
    apiRequireMe(me);
    const d = new Date(ctx.now);
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { status: 200, text: exportCsv(ctx, me, q), contentType: 'text/csv; charset=utf-8', filename: 'modus-signal-' + stamp + '.csv' };
  }
  if (method === 'GET' && path === '/board') { apiRequireMe(me); return ok(apiBoard(ctx, me)); }
  if (method === 'GET' && path === '/notifications') { apiRequireMe(me); return ok(apiNotifications(ctx, me, q)); }
  if (method === 'POST' && path === '/notifications/read') {
    apiRequireMe(me);
    const keys = viewerKeys(ctx, me);
    const ids = Array.isArray(body.ids) ? body.ids : null;
    let n = 0;
    for (const x of st.notifications) if (!x.read && keys.includes(x.key) && (!ids || ids.includes(x.id))) { x.read = true; n++; }
    return ok({ marked: n, counts: apiCounts(ctx, me) }, n > 0);
  }
  if (method === 'GET' && seg[0] === 'files' && seg[1]) {
    apiRequireMe(me);
    const fid = safeDecode(seg[1]);
    const f = SAFE_ID.test(fid) && Object.prototype.hasOwnProperty.call(st.files, fid) ? st.files[fid] : null;
    const a = f ? findAppeal(st, f.appealId) : null;
    // Файл видят только автор и ответственные; для остальных — «не найден»
    if (!a || !(isStaffOf(ctx, me, a) || isAuthorOf(ctx, me, a))) failWith(404, 'Файл не найден');
    return { status: 200, file: { name: f.name, type: f.type, size: f.size, data: f.data } };
  }

  if (seg[0] === 'admin') {
    apiRequireAdmin(me);
    const sub = seg.slice(1).join('/');
    if (method === 'GET' && sub === 'config') return ok(apiAdminConfig(ctx));
    if (method === 'GET' && sub === 'outbox') return ok({ items: st.outbox.slice(-250).reverse(), bitrixLive: !!ctx.env.bitrixLive });
    if (method === 'PUT' && sub === 'rules') { st.rules = apiValidateRules(ctx, body.rules); apiAudit(ctx, me, 'rules', st.rules.length + ' правил'); return ok(apiAdminConfig(ctx), true); }
    if (method === 'POST' && sub === 'rules/test') {
      const r = routeAppeal(st, { type: body.type, categoryId: body.categoryId, authorDepartmentId: body.departmentId || null }, ctx.now);
      const u = getUser(st, r.assigneeId);
      return ok(Object.assign({}, r, { assignee: u ? { id: u.id, name: u.name, position: u.position } : null }));
    }
    if (method === 'PUT' && sub === 'categories') { st.categories = apiValidateCategories(ctx, body.categories); apiAudit(ctx, me, 'categories', st.categories.length + ' категорий'); return ok(apiAdminConfig(ctx), true); }
    if (method === 'PUT' && sub === 'sla') {
      const sla = {};
      for (const p of Object.keys(PRIORITIES)) {
        const v = (body.sla || {})[p] || {};
        const first = Math.round(Number(v.first)); const decision = Math.round(Number(v.decision));
        if (!(first >= 1 && first <= 30) || !(decision >= first && decision <= 90)) failWith(400, PRIORITIES[p].label + ': первый ответ 1–30 раб. дней, решение — не раньше первого ответа и не более 90');
        sla[p] = { first, decision };
      }
      st.settings.sla = sla;
      if (body.secondEscalationDays !== undefined) {
        const d = Math.round(Number(body.secondEscalationDays));
        if (!(d >= 1 && d <= 30)) failWith(400, 'Повторная эскалация: 1–30 дней');
        st.settings.secondEscalationDays = d;
      }
      for (const a of st.appeals) if (!isFinal(a)) recomputeDues(st, a);
      apiAudit(ctx, me, 'sla', JSON.stringify(sla));
      return ok(apiAdminConfig(ctx), true);
    }
    if (method === 'POST' && seg[1] === 'users' && seg[2] && seg[3] === 'password' && seg.length === 4) {
      if (!ctx.env.hashPassword) failWith(400, 'Пароли доступны только в серверной версии');
      const u = getUser(st, seg[2]);
      if (!u) failWith(404, 'Пользователь не найден');
      const chk = checkPasswordStrength(String(body.password || ''), u);
      if (!chk.ok) failWith(400, chk.reason);
      u.passwordHash = ctx.env.hashPassword(String(body.password));
      u.mustChangePassword = true; u.failedLogins = 0; u.lockedUntil = null;
      engine.dropUserSessions(u.id);
      apiAudit(ctx, me, 'password', u.name + ': выдан временный пароль');
      return ok(apiAdminConfig(ctx), true);
    }
    if (method === 'PUT' && seg[1] === 'users' && seg[2]) {
      const u = getUser(st, seg[2]);
      if (!u) failWith(404, 'Пользователь не найден');
      if (body.role !== undefined) { if (!ROLES[body.role]) failWith(400, 'Неизвестная роль'); if (u.id === me.id && body.role !== 'admin') failWith(400, 'Нельзя снять роль администратора с себя'); if (u.role !== body.role) { u.role = body.role; engine.dropUserSessions(u.id); } }
      if (body.deputyId !== undefined) {
        if (body.deputyId && (!getUser(st, body.deputyId) || body.deputyId === u.id)) failWith(400, 'Некорректный заместитель');
        u.deputyId = body.deputyId || null;
      }
      if (body.absent !== undefined) {
        u.absent = !!body.absent;
        if (u.absent) {
          const until = Number(body.absentUntil);
          if (!until || until <= ctx.now) failWith(400, 'Укажите дату окончания отсутствия');
          u.absentFrom = ctx.now; u.absentUntil = until;
        } else { u.absentFrom = null; u.absentUntil = null; }
      }
      apiAudit(ctx, me, 'user', u.name + ': ' + JSON.stringify(pick(body, ['role', 'deputyId', 'absent', 'absentUntil'])));
      return ok(apiAdminConfig(ctx), true);
    }
    if ((sub === 'time' || sub === 'reset') && !demoToolsAllowed(ctx)) failWith(403, 'Демо-инструменты отключены (DEMO_TOOLS=1 вне production)');
    if (method === 'POST' && sub === 'time') {
      const days = Number(body.offsetDays) || 0;
      if (days < 0 || days > 60) failWith(400, 'Сдвиг времени: 0–60 дней');
      st.settings.timeOffsetMs = Math.round(days * DAY);
      ctx.now = engine.now();
      const escalated = runSlaCheck(ctx, ctx.now);
      apiAudit(ctx, me, 'time', '+' + days + ' дн.');
      return ok({ nowMs: ctx.now, timeOffsetMs: st.settings.timeOffsetMs, escalated }, true);
    }
    if (method === 'POST' && sub === 'sla-check') { const escalated = runSlaCheck(ctx, ctx.now); return ok({ escalated, nowMs: ctx.now }, true); }
    if (method === 'POST' && sub === 'reset') { engine.reset(); return ok({ reset: true }, true); }
  }
  failWith(404, 'Маршрут не найден: ' + method + ' ' + path);
}

export function createEngine(env, initialState) {
  let state = initialState && initialState.version === STATE_VERSION && Array.isArray(initialState.appeals) ? initialState : buildSeedState(env);
  const engine = {
    now: () => env.now() + ((state.settings && state.settings.timeOffsetMs) || 0),
    // Сессии: случайный токен 256 бит; в состоянии хранится только HMAC токена, срок — 12 ч, есть отзыв
    createSession(userId) {
      const token = (env.randomHex || fallbackRandomHex)(32);
      const now = env.now();
      const sess = (state.sessions = state.sessions && typeof state.sessions === 'object' ? state.sessions : {});
      for (const k of Object.keys(sess)) if (!sess[k] || sess[k].exp < now) delete sess[k];
      const mine = Object.keys(sess).filter((k) => sess[k].userId === userId).sort((a, b) => sess[a].createdAt - sess[b].createdAt);
      while (mine.length >= 10) delete sess[mine.shift()]; // не более 10 активных сессий на пользователя
      sess[env.hmac('sess:' + token)] = { userId, createdAt: now, exp: now + SESSION_TTL_MS };
      return token;
    },
    tokenFor: (userId) => engine.createSession(userId), // для тестов
    sessionOf(token) {
      if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
      const sess = state.sessions || {};
      const key = env.hmac('sess:' + token);
      const s = Object.prototype.hasOwnProperty.call(sess, key) ? sess[key] : null;
      if (!s || s.exp < env.now()) return null;
      return s;
    },
    userFromToken(token) {
      const s = engine.sessionOf(token);
      const u = s ? getUser(state, s.userId) : null;
      return u && !u.disabled ? u : null;
    },
    dropSession(token) { if (engine.sessionOf(token)) delete state.sessions[env.hmac('sess:' + token)]; },
    dropUserSessions(userId, keepToken) {
      const keep = keepToken ? env.hmac('sess:' + keepToken) : null;
      for (const k of Object.keys(state.sessions || {})) if (state.sessions[k].userId === userId && k !== keep) delete state.sessions[k];
    },
    getState: () => state,
    setState(s) { state = s; },
    reset() { const sessions = state.sessions; state = buildSeedState(env); state.sessions = sessions || {}; },
    tick() { const ctx = { state, env, now: engine.now() }; return runSlaCheck(ctx, ctx.now); },
    handle(req) {
      const ctx = { state, env, now: engine.now() };
      const method = String((req && req.method) || 'GET').toUpperCase();
      const path = ('/' + String((req && req.path) || '/').replace(/^\/?api\/?/, '').replace(/^\/+|\/+$/g, '')).replace(/\/+/g, '/');
      ctx.token = req && typeof req.token === 'string' ? req.token : null;
      const me = engine.userFromToken(ctx.token);
      // Входные данные: только простые JSON-типы, без __proto__/constructor
      let body = sanitizeInput((req && req.body) || {});
      if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
      const rawQ = sanitizeInput((req && req.query) || {}) || {};
      const query = {};
      for (const k of Object.keys(rawQ)) if (typeof rawQ[k] === 'string' || typeof rawQ[k] === 'number') query[k] = String(rawQ[k]).slice(0, 500);
      try {
        return apiRoute(ctx, method, path, query, body, me, engine);
      } catch (e) {
        if (e instanceof AppError) return { status: e.status || 400, json: { error: e.message, details: e.details || null } };
        // Наружу — только общий текст; подробности и стек — в журнал сервера
        if (env.log) env.log('[engine]', method, path, e && e.stack ? e.stack : e);
        return { status: 500, json: { error: 'Внутренняя ошибка сервера' } };
      }
    },
  };
  return engine;
}
