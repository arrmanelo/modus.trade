// Модус Сигнал — аналитика для руководителей и выгрузка в CSV.
import { TYPES, STATUSES, PRIORITIES, SLA_KINDS, DAY, HOUR } from './model.js';
import { failWith, getUser, getDept, getCategory, userLabel, isFinal, overdueOf, isManagerUser, isStaffOf, isAuthorOf, fmtDay } from './engine-core.js';
import { buildTextIndex, clusterTexts, topTermsOf } from './text.js';

function anAvg(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; }
function anMedian(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function anShare(n, d) { return d ? n / d : null; }
function anRound(x, k) { if (x === null || x === undefined) return null; const p = Math.pow(10, k || 0); return Math.round(x * p) / p; }
function anWeekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const w = (d.getDay() + 6) % 7; // понедельник = 0
  d.setDate(d.getDate() - w);
  return d.getTime();
}

export function analyticsBase(ctx, f, viewer) {
  const flt = f || {};
  const from = flt.from ? Number(flt.from) : null;
  const to = flt.to ? Number(flt.to) : null;
  return ctx.state.appeals.filter((a) => {
    if (!viewer || !(isStaffOf(ctx, viewer, a) || isAuthorOf(ctx, viewer, a))) return false;
    if (from && a.createdAt < from) return false;
    if (to && a.createdAt > to) return false;
    if (flt.type && a.type !== flt.type) return false;
    if (flt.categoryId && a.categoryId !== flt.categoryId) return false;
    if (flt.groupId) { const c = getCategory(ctx.state, a.categoryId); if (!c || c.groupId !== flt.groupId) return false; }
    if (flt.departmentId) {
      if (flt.departmentId === 'anon') { if (!a.anonymous) return false; }
      else if (a.authorDepartmentId !== flt.departmentId) return false;
    }
    if (flt.assigneeId && a.assigneeId !== flt.assigneeId) return false;
    return true;
  });
}

export function computeAnalytics(ctx, viewer, filters) {
  if (!viewer) failWith(401, 'Нужно войти в систему');
  if (!isManagerUser(viewer)) failWith(403, 'Аналитика доступна руководителям и администратору');
  const state = ctx.state;
  const now = ctx.now;
  const all = analyticsBase(ctx, filters, viewer);
  const merged = all.filter((a) => a.mergedInto);
  const list = all.filter((a) => !a.mergedInto);
  const total = list.length;

  const byType = {}; for (const t of Object.keys(TYPES)) byType[t] = 0;
  const byStatus = {}; for (const s of Object.keys(STATUSES)) byStatus[s] = 0;
  const byPriority = {}; for (const p of Object.keys(PRIORITIES)) byPriority[p] = 0;
  for (const a of list) { byType[a.type]++; byStatus[a.status]++; byPriority[a.priority]++; }

  const reviewed = list.filter((a) => a.status !== 'new' || a.firstResponseAt).length;
  const answered = list.filter((a) => a.firstResponseAt);
  const frHours = answered.map((a) => (a.firstResponseAt - a.createdAt) / HOUR);
  const onTime = answered.filter((a) => a.firstResponseAt <= a.firstResponseDue).length;
  const lateUnanswered = list.filter((a) => !a.firstResponseAt && now > a.firstResponseDue && !isFinal(a)).length;
  const finals = list.filter((a) => isFinal(a));
  const withResult = finals.filter((a) => (a.result || a.rejection || a.closingNote || '').trim()).length;
  const done = list.filter((a) => a.status === 'done');
  const rated = list.filter((a) => a.rating && a.rating.score);
  const resolveDays = finals.filter((a) => a.resolvedAt).map((a) => (a.resolvedAt - a.createdAt) / DAY);
  const overdue = list.map((a) => ({ a, od: overdueOf(a, now) })).filter((x) => x.od);

  const kpi = {
    total, merged: merged.length,
    reviewedShare: anRound(anShare(reviewed, total), 3),
    avgFirstResponseHours: anRound(anAvg(frHours), 1),
    medianFirstResponseHours: anRound(anMedian(frHours), 1),
    firstResponseOnTimeShare: anRound(anShare(onTime, answered.length + lateUnanswered), 3),
    closedShare: anRound(anShare(finals.length, total), 3),
    resultShare: anRound(anShare(withResult, total), 3),
    implemented: done.length,
    rejected: byStatus.rejected,
    open: total - finals.length,
    overdue: overdue.length,
    avgRating: anRound(anAvg(rated.map((a) => a.rating.score)), 2),
    ratedCount: rated.length,
    avgResolveDays: anRound(anAvg(resolveDays), 1),
    anonymousCount: list.filter((a) => a.anonymous).length,
  };

  const overdueList = overdue
    .sort((x, y) => x.od.due - y.od.due)
    .map(({ a, od }) => ({
      id: a.id, title: a.title, status: a.status, priority: a.priority, kind: od.kind, kindLabel: SLA_KINDS[od.kind],
      due: od.due, daysOverdue: anRound((now - od.due) / DAY, 1), assigneeId: a.assigneeId, assigneeLabel: userLabel(state, a.assigneeId),
      escalatedTo: (a.escalations || []).filter((e) => e.key === od.kind + ':' + od.due).map((e) => userLabel(state, e.toId)),
    }));

  const catMap = new Map();
  const groupMap = new Map();
  for (const a of list) {
    const c = getCategory(state, a.categoryId);
    const gid = c ? c.groupId : 'g_other';
    for (const [m, key, name] of [[catMap, a.categoryId, c ? c.name : a.categoryId], [groupMap, gid, (state.groups.find((g) => g.id === gid) || {}).name || gid]]) {
      if (!m.has(key)) m.set(key, { id: key, name, total: 0, open: 0, done: 0, rejected: 0, overdue: 0, problem: 0, idea: 0, praise: 0 });
      const r = m.get(key);
      r.total++; r[a.type]++;
      if (!isFinal(a)) r.open++;
      if (a.status === 'done') r.done++;
      if (a.status === 'rejected') r.rejected++;
      if (overdueOf(a, now)) r.overdue++;
    }
  }
  const byCategory = [...catMap.values()].sort((x, y) => y.total - x.total);
  const byGroup = [...groupMap.values()].sort((x, y) => y.total - x.total);

  const depMap = new Map();
  for (const a of list) {
    const key = a.anonymous ? 'anon' : (a.authorDepartmentId || 'none');
    if (!depMap.has(key)) {
      const d = getDept(state, key);
      depMap.set(key, { id: key, name: key === 'anon' ? 'Анонимные обращения' : (d ? d.name : '—'), total: 0, problem: 0, idea: 0, praise: 0, done: 0 });
    }
    const r = depMap.get(key);
    r.total++; r[a.type]++; if (a.status === 'done') r.done++;
  }
  const byDepartment = [...depMap.values()].sort((x, y) => y.total - x.total);

  const loadMap = new Map();
  for (const a of list) {
    const id = a.assigneeId;
    if (!loadMap.has(id)) {
      const u = getUser(state, id);
      loadMap.set(id, { id, name: u ? u.name : '—', position: u ? u.position : '', absent: !!(u && u.absent), total: 0, open: 0, overdue: 0, done: 0, fr: [] });
    }
    const r = loadMap.get(id);
    r.total++;
    if (!isFinal(a)) r.open++;
    if (overdueOf(a, now)) r.overdue++;
    if (a.status === 'done') r.done++;
    if (a.firstResponseAt) r.fr.push((a.firstResponseAt - a.createdAt) / HOUR);
  }
  const handlers = [...loadMap.values()].map((r) => ({ id: r.id, name: r.name, position: r.position, absent: r.absent, total: r.total, open: r.open, overdue: r.overdue, done: r.done, avgFirstResponseHours: anRound(anAvg(r.fr), 1) }))
    .sort((x, y) => y.open - x.open || y.total - x.total);

  const weeks = [];
  const w0 = anWeekStart(now);
  for (let i = 7; i >= 0; i--) {
    const start = w0 - i * 7 * DAY;
    const end = start + 7 * DAY;
    weeks.push({
      start, label: fmtDay(start).slice(0, 5),
      created: list.filter((a) => a.createdAt >= start && a.createdAt < end).length,
      resolved: list.filter((a) => a.resolvedAt && a.resolvedAt >= start && a.resolvedAt < end).length,
    });
  }

  // Повторяющиеся проблемы: кластеры похожих текстов (без положительных отзывов); дубли, уже объединённые, учитываются в родителе
  const docs = all.filter((a) => a.type !== 'praise').map((a) => ({ id: a.id, text: a.title + '. ' + a.description }));
  const index = buildTextIndex(docs);
  const clusters = clusterTexts(index, docs.map((d) => d.id), (state.settings.clusterThreshold || 0.2))
    .map((c) => {
      const items = c.members.map((id) => all.find((a) => a.id === id));
      const cats = [...new Set(items.map((a) => a.categoryId))];
      return {
        members: c.members, size: c.members.length, strength: anRound(c.strength, 2), terms: topTermsOf(index, c.members, 3),
        open: items.filter((a) => !isFinal(a)).length,
        supporters: items.reduce((s, a) => s + a.supporters.length, 0),
        categories: cats.map((id) => (getCategory(state, id) || {}).name || id),
        titles: items.map((a) => ({ id: a.id, title: a.title, status: a.status, mergedInto: a.mergedInto })),
      };
    })
    .sort((x, y) => y.size - x.size || y.supporters - x.supporters);

  const topSupported = list.filter((a) => a.supporters.length > 0)
    .sort((x, y) => y.supporters.length - x.supporters.length || y.createdAt - x.createdAt)
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title, type: a.type, status: a.status, supporters: a.supporters.length }));

  const funnel = [
    { key: 'created', label: 'Поступило', value: total },
    { key: 'reviewed', label: 'Рассмотрено', value: reviewed },
    { key: 'decided', label: 'Принято решение', value: list.filter((a) => ['progress', 'done', 'rejected', 'closed'].includes(a.status)).length },
    { key: 'done', label: 'Реализовано', value: done.length },
  ];

  return { generatedAt: now, filters: filters || {}, kpi, byType, byStatus, byPriority, overdueList, byCategory, byGroup, byDepartment, handlers, weeks, clusters, topSupported, funnel };
}

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

export function exportCsv(ctx, viewer, filters) {
  if (!viewer) failWith(401, 'Нужно войти в систему');
  if (!isManagerUser(viewer)) failWith(403, 'Выгрузка доступна руководителям и администратору');
  const state = ctx.state;
  const head = ['Номер', 'Тип', 'Группа', 'Категория', 'Заголовок', 'Статус', 'Приоритет', 'Автор', 'Подразделение автора', 'Ответственный',
    'Создано', 'Первый ответ', 'Часов до первого ответа', 'Срок решения', 'Плановый срок реализации', 'Просрочка', 'Решение / результат / причина отказа',
    'Поддержали', 'Оценка автора', 'Объединено в'];
  const rows = [head];
  for (const a of analyticsBase(ctx, filters, viewer).sort((x, y) => x.seq - y.seq)) {
    const c = getCategory(state, a.categoryId);
    const g = c ? state.groups.find((x) => x.id === c.groupId) : null;
    const od = overdueOf(a, ctx.now);
    const au = a.anonymous ? null : getUser(state, a.authorId);
    const dep = au ? getDept(state, a.authorDepartmentId) : null;
    rows.push([
      a.id, TYPES[a.type].label, g ? g.name : '', c ? c.name : '', a.title, STATUSES[a.status].label, PRIORITIES[a.priority].label,
      au ? au.name : 'Анонимно', dep ? dep.name : '', userLabel(state, a.assigneeId),
      csvDateTime(a.createdAt), csvDateTime(a.firstResponseAt), a.firstResponseAt ? anRound((a.firstResponseAt - a.createdAt) / HOUR, 1) : '',
      csvDateTime(a.decisionDue), csvDateTime(a.dueDate), od ? SLA_KINDS[od.kind] : '',
      a.result || a.rejection || a.closingNote || a.decision || '', a.supporters.length, a.rating ? a.rating.score : '', a.mergedInto || '',
    ]);
  }
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
