// Модус Сигнал — ядро: состояние, маршрутизация, сроки (SLA), права доступа, уведомления, проекции.
// Чистый JS без зависимостей: работает и на сервере (Node), и в браузере (автономная демо-версия).
import { STATUSES, TRANSITIONS, DEFAULT_SLA, SLA_KINDS, DAY, addBusinessDays, makeId, deepClone } from './model.js';
import { SEED_DEPARTMENTS, SEED_USERS, SEED_GROUPS, SEED_CATEGORIES, SEED_RULES } from './seed-org.js';

export const STATE_VERSION = 3;

export class AppError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export function failWith(status, message, details) { throw new AppError(status, message, details); }

export function createEmptyState(now) {
  return {
    version: STATE_VERSION,
    createdAt: now,
    settings: {
      sla: deepClone(DEFAULT_SLA),
      timeOffsetMs: 0,
      coordinatorId: 'u_admin',
      similarThreshold: 0.16,
      secondEscalationDays: 2,
    },
    departments: deepClone(SEED_DEPARTMENTS),
    users: deepClone(SEED_USERS).map((u) => ({
      id: u.id, name: u.name, position: u.position, departmentId: u.departmentId, role: u.role,
      demo: u.demo || 0, deputyId: u.deputyId || null,
      email: u.id.slice(2).replace(/_/g, '.') + '@modus-trade.example',
      absent: false, absentFrom: null, absentUntil: null,
      seedAbsentFromDaysAgo: u.absentFromDaysAgo || null, seedAbsentUntilDays: u.absentUntilDays || null,
    })),
    groups: deepClone(SEED_GROUPS),
    categories: deepClone(SEED_CATEGORIES),
    rules: deepClone(SEED_RULES),
    appeals: [],
    seq: 0,
    notifications: [],
    outbox: [],
    files: {},
    audit: [],
  };
}

// ---------- справочники ----------
export function getUser(state, id) { return state.users.find((u) => u.id === id) || null; }
export function getDept(state, id) { return state.departments.find((d) => d.id === id) || null; }
export function getCategory(state, id) { return state.categories.find((c) => c.id === id) || null; }
export function findAppeal(state, id) { return state.appeals.find((a) => a.id === id) || null; }
export function getAppeal(state, id) {
  const a = findAppeal(state, id);
  if (!a) failWith(404, 'Обращение ' + id + ' не найдено');
  return a;
}
export function userLabel(state, id) { const u = getUser(state, id); return u ? u.name : '—'; }
export function userWithPos(state, id) { const u = getUser(state, id); return u ? u.name + ' (' + u.position + ')' : '—'; }
export function headOfDept(state, deptId) { const d = getDept(state, deptId); return d ? d.headId : null; }
export function coordinatorOf(state) { return state.settings.coordinatorId || 'u_admin'; }
export function isUserAbsent(u, at) { return !!(u && u.absent && (!u.absentUntil || at < u.absentUntil)); }
export function fmtDay(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

// ---------- маршрутизация ----------
export function matchRule(state, input) {
  return state.rules.find((r) => r.enabled !== false
    && (!r.type || r.type === input.type)
    && (!r.categoryId || r.categoryId === input.categoryId)
    && (!r.authorDepartmentId || r.authorDepartmentId === input.authorDepartmentId)) || null;
}

// Если ответственный отсутствует: заместитель → руководитель подразделения → координатор
export function resolveAvailable(state, startId, at, trace) {
  const coord = coordinatorOf(state);
  const seen = new Set();
  let cur = startId;
  for (let step = 0; step < 6; step++) {
    const u = getUser(state, cur);
    if (!u) { trace.push('Пользователь не найден → координатор'); return { id: coord, fallback: true }; }
    if (!isUserAbsent(u, at)) return { id: cur, fallback: step > 0 };
    seen.add(cur);
    let next = null; let why = '';
    if (u.deputyId && !seen.has(u.deputyId)) { next = u.deputyId; why = 'заместитель'; }
    else {
      const h = headOfDept(state, u.departmentId);
      if (h && !seen.has(h)) { next = h; why = 'руководитель подразделения'; }
      else if (!seen.has(coord)) { next = coord; why = 'координатор системы'; }
    }
    trace.push(u.name + ' отсутствует' + (u.absentUntil ? ' до ' + fmtDay(u.absentUntil) : '') + (next ? ' → ' + why + ': ' + userLabel(state, next) : ''));
    if (!next) return { id: coord, fallback: true };
    cur = next;
  }
  return { id: coord, fallback: true };
}

export function routeAppeal(state, input, at) {
  const trace = [];
  const rule = matchRule(state, input);
  let target = null;
  if (!rule) {
    target = coordinatorOf(state);
    trace.push('Подходящее правило не найдено → координатор системы распределит вручную');
  } else {
    trace.push('Правило: ' + rule.name);
    if (rule.target && rule.target.kind === 'authorDepartmentHead') {
      target = input.authorDepartmentId ? headOfDept(state, input.authorDepartmentId) : null;
      if (target) trace.push('Руководитель подразделения автора: ' + userLabel(state, target));
      else { target = coordinatorOf(state); trace.push('Подразделение автора скрыто (анонимно) → координатор системы'); }
    } else {
      target = rule.target ? rule.target.userId : coordinatorOf(state);
    }
  }
  const res = resolveAvailable(state, target, at, trace);
  trace.push('Назначено: ' + userWithPos(state, res.id));
  return { assigneeId: res.id, ruleId: rule ? rule.id : null, trace, fallback: res.fallback || !rule };
}

// ---------- сроки ----------
export function slaFor(state, priority) {
  const s = state.settings.sla || DEFAULT_SLA;
  return s[priority] || DEFAULT_SLA[priority] || DEFAULT_SLA.medium;
}
export function recomputeDues(state, a) {
  const s = slaFor(state, a.priority);
  a.firstResponseDue = addBusinessDays(a.createdAt, s.first);
  a.decisionDue = addBusinessDays(a.reopenedAt || a.createdAt, s.decision) + (a.pausedMs || 0);
}
export function isFinal(a) { return !!(STATUSES[a.status] && STATUSES[a.status].final); }

export function overdueOf(a, at) {
  if (isFinal(a) || a.mergedInto) return null;
  if (a.status === 'new' && !a.firstResponseAt && at > a.firstResponseDue) return { kind: 'first', due: a.firstResponseDue };
  if ((a.status === 'new' || a.status === 'review') && !a.decisionAt && at > a.decisionDue) return { kind: 'decision', due: a.decisionDue };
  if (a.status === 'progress' && a.dueDate && at > a.dueDate) return { kind: 'implementation', due: a.dueDate };
  return null;
}

export function deadlineOf(a) {
  if (isFinal(a) || a.mergedInto) return null;
  if (a.status === 'clarify') return { kind: 'paused', due: null };
  if (a.status === 'new' && !a.firstResponseAt) return { kind: 'first', due: a.firstResponseDue };
  if (a.status === 'new' || a.status === 'review') return { kind: 'decision', due: a.decisionDue };
  if (a.status === 'progress') return { kind: 'implementation', due: a.dueDate };
  return null;
}

export function escalationTargetFor(state, a, at) {
  const coord = coordinatorOf(state);
  const asg = getUser(state, a.assigneeId);
  let to = asg ? headOfDept(state, asg.departmentId) : null;
  if (!to || to === a.assigneeId) to = coord;
  const tu = getUser(state, to);
  if (isUserAbsent(tu, at)) {
    const dep = tu.deputyId ? getUser(state, tu.deputyId) : null;
    to = dep && !isUserAbsent(dep, at) ? dep.id : coord;
  }
  return to === a.assigneeId ? coord : to;
}

export function pushEvent(a, ev) {
  const e = Object.assign({ id: makeId('ev') }, ev);
  a.events.push(e);
  a.updatedAt = Math.max(a.updatedAt || 0, ev.at);
  return e;
}

// Анти-потеря: просрочка → руководитель ответственного; если через N дней всё ещё просрочено → координатор.
export function runSlaCheck(ctx, at) {
  const state = ctx.state;
  const coord = coordinatorOf(state);
  const second = (state.settings.secondEscalationDays || 2) * DAY;
  let count = 0;
  for (const a of state.appeals) {
    const od = overdueOf(a, at);
    if (!od) continue;
    a.escalations = a.escalations || [];
    const key = od.kind + ':' + od.due;
    const first = a.escalations.find((e) => e.key === key);
    let toId = null; let level = 1;
    if (!first) toId = escalationTargetFor(state, a, at);
    else if (first.level === 1 && at > first.at + second && first.toId !== coord && !a.escalations.some((e) => e.key === key && e.level === 2)) { toId = coord; level = 2; }
    if (!toId) continue;
    a.escalations.push({ key, level, kind: od.kind, due: od.due, toId, at });
    pushEvent(a, { at, kind: 'escalated', actorId: null, system: true, internal: true, toId, slaKind: od.kind, due: od.due, level });
    const what = SLA_KINDS[od.kind];
    notifyKey(ctx, toId, a, 'escalation', (level === 2 ? 'Повторная эскалация. ' : '') + 'Нарушен срок «' + what + '» по ' + a.id + ' «' + a.title + '». Ответственный: ' + userLabel(state, a.assigneeId) + '.', at);
    if (toId !== a.assigneeId) notifyKey(ctx, a.assigneeId, a, 'overdue', 'Срок «' + what + '» по ' + a.id + ' истёк. Обращение эскалировано: ' + userLabel(state, toId) + '.', at);
    count++;
  }
  return count;
}

// ---------- уведомления ----------
const NOTIFY_TITLES = {
  created: 'Обращение зарегистрировано', assigned: 'Назначено вам', status: 'Изменён статус',
  comment: 'Новый комментарий', escalation: 'Эскалация', overdue: 'Просрочка', rated: 'Оценка автора',
  merged: 'Объединение дублей', supported: 'Поддержка коллег', due: 'Перенос срока', info: 'Информация',
};
export function anonRefOf(ctx, userId) { return ctx.env.hmac('anon:' + userId).slice(0, 24); }
export function authorKeyOf(a) { return a.anonymous ? 'ref:' + a.authorRef : a.authorId; }
export function viewerKeys(ctx, user) { return [user.id, 'ref:' + anonRefOf(ctx, user.id)]; }

export function notifyKey(ctx, key, a, kind, text, at) {
  if (!key) return;
  const state = ctx.state;
  state.notifications.push({ id: makeId('n'), key, appealId: a ? a.id : null, kind, text, at, read: false });
  if (state.notifications.length > 3000) state.notifications.splice(0, state.notifications.length - 3000);
  if (key.startsWith('ref:')) return; // анонимный автор — только внутри системы, без e-mail и Битрикс24
  const u = getUser(state, key);
  if (!u) return;
  const subject = (a ? a.id + ' · ' : '') + (NOTIFY_TITLES[kind] || 'Уведомление');
  state.outbox.push({ id: makeId('o'), at, channel: 'email', to: u.email, toName: u.name, subject, body: text, status: 'simulated' });
  state.outbox.push({ id: makeId('o'), at, channel: 'bitrix24', to: u.name, userId: u.id, method: 'im.notify.system.add', subject, body: text, appealId: a ? a.id : null, status: ctx.env.bitrixLive ? 'queued' : 'simulated' });
  if (state.outbox.length > 800) state.outbox.splice(0, state.outbox.length - 800);
}

// Автор + авторы объединённых дублей (watchers)
export function notifyAuthor(ctx, a, kind, text, at, exceptKey) {
  const keys = [authorKeyOf(a)].concat(a.watchers || []);
  for (const k of new Set(keys)) if (k && k !== exceptKey) notifyKey(ctx, k, a, kind, text, at);
}

// ---------- права доступа ----------
export function isAdminUser(u) { return !!u && u.role === 'admin'; }
export function isManagerUser(u) { return !!u && (u.role === 'manager' || u.role === 'admin'); }
export function isAuthorOf(ctx, u, a) {
  if (!u) return false;
  return a.anonymous ? a.authorRef === anonRefOf(ctx, u.id) : a.authorId === u.id;
}
// «Служебный» доступ: администратор, ответственный, адресат эскалации, руководитель ответственного
export function isStaffOf(ctx, u, a) {
  if (!u) return false;
  if (isAdminUser(u)) return true;
  if (a.assigneeId === u.id) return true;
  if ((a.escalations || []).some((e) => e.toId === u.id)) return true;
  const asg = getUser(ctx.state, a.assigneeId);
  return !!asg && headOfDept(ctx.state, asg.departmentId) === u.id;
}
export function accessLevel(ctx, u, a) {
  if (isStaffOf(ctx, u, a)) return 'staff';
  if (isAuthorOf(ctx, u, a)) return 'author';
  if (a.isPublic) return 'public';
  return null;
}

export function availableActions(ctx, u, a, level, mine) {
  const staff = level === 'staff';
  const fin = isFinal(a);
  const canReopen = isManagerUser(u);
  const transitions = staff && !a.mergedInto ? (TRANSITIONS[a.status] || []).filter((to) => !(fin && to === 'review') || canReopen) : [];
  return {
    transitions,
    comment: (staff || mine) && !a.mergedInto,
    internalComment: staff,
    assign: staff && !fin && !a.mergedInto,
    priority: staff && !fin && !a.mergedInto,
    due: staff && a.status === 'progress',
    nextAction: staff && !fin,
    merge: staff && !fin && !a.mergedInto,
    publish: staff,
    support: !mine && !fin && !a.mergedInto && level !== null,
    rate: mine && fin && !a.mergedInto && !a.rating,
    withdraw: mine && ['new', 'review', 'clarify'].includes(a.status) && !a.mergedInto,
  };
}

// ---------- проекции (что видит конкретный пользователь) ----------
function projectEventFor(ctx, a, e, staff) {
  const out = Object.assign({}, e);
  if (e.byAuthor && a.anonymous) { out.actorId = null; out.actorLabel = 'Автор (анонимно)'; }
  else out.actorLabel = e.actorId ? userLabel(ctx.state, e.actorId) : 'Система';
  if (e.assigneeId) out.assigneeLabel = userWithPos(ctx.state, e.assigneeId);
  if (e.toId) out.toLabel = userWithPos(ctx.state, e.toId);
  if (!staff) { delete out.trace; delete out.reasonInternal; }
  return out;
}

export function projectAppeal(ctx, u, a, full) {
  const level = accessLevel(ctx, u, a);
  if (!level) return null;
  const state = ctx.state;
  const staff = level === 'staff';
  const mine = isAuthorOf(ctx, u, a);
  const cat = getCategory(state, a.categoryId);
  const au = a.anonymous ? null : getUser(state, a.authorId);
  const asg = getUser(state, a.assigneeId);
  const od = overdueOf(a, ctx.now);
  const p = {
    id: a.id, seq: a.seq, type: a.type, categoryId: a.categoryId, groupId: cat ? cat.groupId : null,
    title: a.title, description: a.description, proposedSolution: a.proposedSolution || '',
    priority: a.priority, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt,
    isPublic: a.isPublic, anonymous: a.anonymous, level, mine,
    author: au ? { id: au.id, name: au.name, position: au.position, departmentId: au.departmentId } : null,
    authorLabel: au ? au.name : 'Анонимно',
    authorDepartmentId: au ? a.authorDepartmentId : null,
    assignee: asg ? { id: asg.id, name: asg.name, position: asg.position, departmentId: asg.departmentId } : null,
    supportersCount: a.supporters.length, supportedByMe: !!u && a.supporters.includes(u.id),
    decision: a.decision || '', dueDate: a.dueDate || null, result: a.result || '', rejection: a.rejection || '', closingNote: a.closingNote || '',
    rating: a.rating || null, mergedInto: a.mergedInto || null, duplicates: a.duplicates || [],
    overdue: (staff || mine) && od ? od : null,
    deadline: staff || mine ? deadlineOf(a) : null,
    commentsCount: a.events.filter((e) => e.kind === 'comment' && (staff || !e.internal)).length,
    attachmentsCount: (staff || mine) ? a.attachments.length : 0,
    source: a.source,
  };
  if (staff) {
    p.firstResponseDue = a.firstResponseDue; p.decisionDue = a.decisionDue;
    p.firstResponseAt = a.firstResponseAt || null; p.decisionAt = a.decisionAt || null;
    p.routing = a.routing; p.nextAction = a.nextAction || '';
    p.escalations = (a.escalations || []).map((e) => Object.assign({ toLabel: userWithPos(state, e.toId) }, e));
  }
  if (full) {
    p.attachments = (staff || mine) ? a.attachments.map((id) => state.files[id]).filter(Boolean).map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })) : [];
    p.events = a.events.filter((e) => staff || !e.internal).map((e) => projectEventFor(ctx, a, e, staff));
    p.supporters = staff ? a.supporters.map((id) => userLabel(state, id)) : [];
    p.actions = availableActions(ctx, u, a, level, mine);
    p.related = (a.related || []).map((id) => findAppeal(state, id)).filter((x) => x && accessLevel(ctx, u, x)).map((x) => ({ id: x.id, title: x.title, status: x.status }));
  }
  return p;
}
