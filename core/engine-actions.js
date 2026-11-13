// Модус Сигнал — действия с обращениями (все проверки прав и правил — здесь, а не в интерфейсе).
import { TYPES, PRIORITIES, STATUSES, TRANSITIONS, TRANSITION_META, DAY, makeId } from './model.js';
import { validateUpload, MAX_FILES, MAX_TOTAL_BYTES } from './security.js';
import { failWith, getUser, getCategory, userLabel, userWithPos, routeAppeal, recomputeDues, isFinal, pushEvent, notifyKey, notifyAuthor, authorKeyOf, anonRefOf, isStaffOf, isAuthorOf, accessLevel, isManagerUser, isUserAbsent, fmtDay } from './engine-core.js';


function cleanText(v, min, max, label) {
  const s = String(v == null ? '' : v).replace(/\r\n/g, '\n').trim();
  if (s.length < min) failWith(400, label + ': минимум ' + min + ' симв.');
  if (s.length > max) failWith(400, label + ': максимум ' + max + ' симв.');
  return s;
}
function quoteOf(s, n) { const t = String(s || ''); return '«' + (t.length > n ? t.slice(0, n - 1) + '…' : t) + '»'; }
function requireStaff(ctx, actor, a) {
  if (!isStaffOf(ctx, actor, a)) failWith(403, 'Действие доступно только ответственному, его руководителю или администратору');
}
function requireNotMerged(a) { if (a.mergedInto) failWith(409, a.id + ' объединено с ' + a.mergedInto + ' — работа ведётся там'); }
function unpauseClarify(ctx, a, at) {
  if (a.status === 'clarify' && a.clarifyStartedAt) {
    a.pausedMs = (a.pausedMs || 0) + Math.max(0, at - a.clarifyStartedAt);
    a.clarifyStartedAt = null;
    recomputeDues(ctx.state, a);
  }
}

export function b64OfText(text) {
  if (typeof Buffer !== 'undefined') return Buffer.from(String(text), 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(String(text))));
}

export function storeFiles(ctx, files, at, appealId) {
  if (files != null && !Array.isArray(files)) failWith(400, 'Вложения должны быть списком');
  const list = files || [];
  if (list.length > MAX_FILES) failWith(400, 'Можно приложить не более ' + MAX_FILES + ' файлов');
  const checked = list.map((f) => validateUpload(f, failWith));
  if (checked.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) failWith(400, 'Суммарный размер вложений — не более 8 МБ');
  const ids = [];
  for (const f of checked) {
    const id = makeId('f');
    ctx.state.files[id] = { id, name: f.name, type: f.type, size: f.size, data: f.data, at, appealId };
    ids.push(id);
  }
  return ids;
}

// ---------- создание ----------
export function createAppeal(ctx, actor, input, at, opts) {
  const o = opts || {};
  const state = ctx.state;
  if (!actor) failWith(401, 'Нужно войти в систему');
  const type = input.type;
  if (!TYPES[type]) failWith(400, 'Выберите тип обращения');
  const cat = getCategory(state, input.categoryId);
  if (!cat || cat.enabled === false) failWith(400, 'Выберите категорию');
  const title = cleanText(input.title, 5, 140, 'Заголовок');
  const description = cleanText(input.description, 15, 4000, 'Описание');
  const proposedSolution = input.proposedSolution ? cleanText(input.proposedSolution, 0, 2000, 'Предлагаемое решение') : '';
  const priority = PRIORITIES[input.priority] ? input.priority : (type === 'praise' ? 'low' : 'medium');
  const anonymous = !!input.anonymous;
  const isPublic = input.isPublic === undefined ? !anonymous : !!input.isPublic;
  const seq = o.seq || state.seq + 1;
  state.seq = Math.max(state.seq, seq);
  const id = 'A-' + String(seq).padStart(3, '0');
  if (state.appeals.some((x) => x.id === id)) failWith(409, 'Номер ' + id + ' уже занят');
  const authorDepartmentId = anonymous ? null : actor.departmentId;
  const routing = routeAppeal(state, { type, categoryId: cat.id, authorDepartmentId }, at);
  const a = {
    id, seq, type, categoryId: cat.id, title, description, proposedSolution, priority, status: 'new',
    anonymous, authorId: anonymous ? null : actor.id, authorRef: anonymous ? anonRefOf(ctx, actor.id) : null,
    authorDepartmentId, isPublic, assigneeId: routing.assigneeId,
    routing: { ruleId: routing.ruleId, trace: routing.trace, fallback: routing.fallback },
    createdAt: at, updatedAt: at, firstResponseAt: null, decisionAt: null, dueDate: null, clarifyStartedAt: null,
    pausedMs: 0, reopenedAt: null, resolvedAt: null, decision: '', result: '', rejection: '', closingNote: '',
    nextAction: String(input.nextAction || '').slice(0, 500), rating: null, escalations: [], supporters: [], watchers: [],
    mergedInto: null, duplicates: [], related: [], attachments: [], events: [], source: o.source || 'user',
  };
  recomputeDues(state, a);
  a.attachments = storeFiles(ctx, input.files, at, id);
  pushEvent(a, { at, kind: 'created', actorId: anonymous ? null : actor.id, byAuthor: true });
  pushEvent(a, { at, kind: 'assigned', actorId: null, system: true, assigneeId: a.assigneeId, reason: routing.fallback ? 'Автоматическая маршрутизация (резервный получатель)' : 'Автоматическая маршрутизация по категории', trace: routing.trace });
  state.appeals.push(a);
  notifyKey(ctx, a.assigneeId, a, 'assigned', 'Новое обращение ' + id + ' ' + quoteOf(title, 90) + ' (' + TYPES[type].label.toLowerCase() + ', приоритет — ' + PRIORITIES[priority].label.toLowerCase() + '). Первый ответ — до ' + fmtDay(a.firstResponseDue) + '.', at);
  notifyAuthor(ctx, a, 'created', 'Обращение ' + id + ' зарегистрировано. Ответственный: ' + userWithPos(state, a.assigneeId) + '. Первый ответ — до ' + fmtDay(a.firstResponseDue) + '.', at);
  return a;
}

// ---------- смена статуса ----------
const AUTHOR_STATUS_TEXT = {
  review: (a, t) => 'Обращение ' + a.id + ' взято на рассмотрение' + (t ? ': ' + quoteOf(t, 160) : '.'),
  clarify: (a, t) => 'По ' + a.id + ' нужно уточнение: ' + quoteOf(t, 200) + ' Ответьте комментарием в карточке.',
  progress: (a, t) => 'По ' + a.id + ' принято решение: ' + quoteOf(t, 200) + ' Плановый срок — ' + fmtDay(a.dueDate) + '.',
  done: (a, t) => a.id + ' реализовано: ' + quoteOf(t, 200) + ' Оцените, пожалуйста, результат.',
  rejected: (a, t) => a.id + ' отклонено. Причина: ' + quoteOf(t, 220),
  closed: (a, t) => a.id + ' закрыто: ' + quoteOf(t, 200),
};

export function changeStatus(ctx, actor, a, payload, at, opts) {
  const o = opts || {};
  requireStaff(ctx, actor, a);
  requireNotMerged(a);
  const to = payload.to;
  const from = a.status;
  if (!STATUSES[to]) failWith(400, 'Неизвестный статус');
  if (!(TRANSITIONS[from] || []).includes(to)) failWith(409, 'Переход «' + STATUSES[from].label + '» → «' + STATUSES[to].label + '» недоступен');
  const reopen = isFinal(a) && to === 'review';
  if (reopen && !isManagerUser(actor)) failWith(403, 'Вернуть закрытое обращение может только руководитель или администратор');
  const meta = TRANSITION_META[to] || {};
  const required = meta.text === 'required' || reopen;
  const text = required ? cleanText(payload.text, 3, 3000, reopen ? 'Причина возврата' : meta.textLabel) : cleanText(payload.text, 0, 3000, 'Комментарий');
  let due = null;
  if (to === 'progress') {
    due = Number(payload.dueDate);
    if (!due) failWith(400, 'Укажите плановый срок реализации');
    if (!o.seed && due < at - DAY) failWith(400, 'Срок реализации не может быть в прошлом');
  }
  unpauseClarify(ctx, a, at);
  if (reopen) {
    a.reopenedAt = at; a.result = ''; a.rejection = ''; a.closingNote = ''; a.resolvedAt = null; a.rating = null;
    a.decisionAt = null; a.dueDate = null; a.pausedMs = 0;
    recomputeDues(ctx.state, a);
  }
  if (to === 'clarify') { a.clarifyStartedAt = at; a.clarifyQuestion = text; }
  if (to === 'progress') { a.decision = text; a.dueDate = due; a.decisionAt = a.decisionAt || at; }
  if (to === 'done') { a.result = text; a.resolvedAt = at; a.decisionAt = a.decisionAt || at; }
  if (to === 'rejected') { a.rejection = text; a.resolvedAt = at; a.decisionAt = a.decisionAt || at; }
  if (to === 'closed') { a.closingNote = text; a.resolvedAt = at; a.decisionAt = a.decisionAt || at; }
  a.status = to;
  if (!a.firstResponseAt) a.firstResponseAt = at;
  pushEvent(a, { at, kind: 'status', actorId: actor.id, from, to, text, dueDate: due || undefined, reopen: reopen || undefined });
  const msg = reopen ? a.id + ' возвращено на рассмотрение: ' + quoteOf(text, 200) : AUTHOR_STATUS_TEXT[to](a, text);
  notifyAuthor(ctx, a, 'status', msg, at, isAuthorOf(ctx, actor, a) ? authorKeyOf(a) : null);
  if (to === 'progress' && !reopen) {
    // Битрикс24: принятое решение становится задачей ответственному (tasks.task.add)
    const asg = getUser(ctx.state, a.assigneeId);
    ctx.state.outbox.push({ id: makeId('o'), at, channel: 'bitrix24', method: 'tasks.task.add', to: asg ? asg.name : '—', userId: a.assigneeId, appealId: a.id,
      subject: a.id + ' · ' + a.title, body: 'Решение: ' + text + (due ? '\nСрок: ' + fmtDay(due) : ''), deadline: due || null, status: ctx.env.bitrixLive ? 'queued' : 'simulated' });
  }
  if (isFinal(a)) {
    for (const sid of a.supporters) if (sid !== actor.id) notifyKey(ctx, sid, a, 'status', 'Обращение ' + a.id + ' ' + quoteOf(a.title, 80) + ', которое вы поддержали: «' + STATUSES[to].label + '».', at);
  }
  return a;
}

// ---------- комментарии ----------
export function addComment(ctx, actor, a, payload, at) {
  const staff = isStaffOf(ctx, actor, a);
  const mine = isAuthorOf(ctx, actor, a);
  if (!staff && !mine) failWith(403, 'Комментировать могут автор и ответственные сотрудники');
  requireNotMerged(a);
  const internal = !!payload.internal;
  if (internal && !staff) failWith(403, 'Внутренние заметки доступны только ответственным');
  const text = cleanText(payload.text, 1, 3000, 'Комментарий');
  const byAuthor = mine && !staff;
  pushEvent(a, { at, kind: 'comment', actorId: byAuthor && a.anonymous ? null : actor.id, byAuthor: byAuthor || undefined, text, internal });
  if (byAuthor) {
    notifyKey(ctx, a.assigneeId, a, 'comment', 'Автор ответил по ' + a.id + ': ' + quoteOf(text, 200), at);
    if (a.status === 'clarify') {
      unpauseClarify(ctx, a, at);
      a.status = 'review';
      pushEvent(a, { at, kind: 'status', actorId: null, system: true, from: 'clarify', to: 'review', text: 'Автор дал уточнение — обращение возвращено на рассмотрение' });
    }
  } else if (!internal) {
    if (!a.firstResponseAt) a.firstResponseAt = at;
    notifyAuthor(ctx, a, 'comment', 'Новый комментарий по ' + a.id + ' от ' + actor.name + ': ' + quoteOf(text, 200), at, mine ? authorKeyOf(a) : null);
    if (actor.id !== a.assigneeId) notifyKey(ctx, a.assigneeId, a, 'comment', actor.name + ' прокомментировал(а) ' + a.id + ': ' + quoteOf(text, 160), at);
  } else if (actor.id !== a.assigneeId) {
    notifyKey(ctx, a.assigneeId, a, 'comment', 'Внутренняя заметка по ' + a.id + ' от ' + actor.name + ': ' + quoteOf(text, 160), at);
  }
  return a;
}

// ---------- назначение, приоритет, сроки ----------
export function reassignAppeal(ctx, actor, a, payload, at, opts) {
  requireStaff(ctx, actor, a);
  requireNotMerged(a);
  if (isFinal(a)) failWith(409, 'Обращение уже закрыто');
  const target = getUser(ctx.state, payload.assigneeId);
  if (!target) failWith(400, 'Выберите нового ответственного');
  if (target.role === 'employee') failWith(400, 'Назначить можно ответственного, руководителя или администратора');
  if (target.id === a.assigneeId) failWith(400, target.name + ' уже ответственный');
  if (isUserAbsent(target, at) && !(opts && opts.seed)) failWith(400, target.name + ' отсутствует' + (target.absentUntil ? ' до ' + fmtDay(target.absentUntil) : '') + ' — выберите другого сотрудника');
  const reason = cleanText(payload.reason, 3, 500, 'Причина переназначения');
  const fromId = a.assigneeId;
  a.assigneeId = target.id;
  pushEvent(a, { at, kind: 'assigned', actorId: actor.id, assigneeId: target.id, fromId, reason });
  notifyKey(ctx, target.id, a, 'assigned', actor.name + ' назначил(а) вам ' + a.id + ' ' + quoteOf(a.title, 90) + '. Причина: ' + reason, at);
  if (fromId !== actor.id) notifyKey(ctx, fromId, a, 'info', a.id + ' передано: ' + target.name + '.', at);
  notifyAuthor(ctx, a, 'status', 'По ' + a.id + ' новый ответственный: ' + userWithPos(ctx.state, target.id) + '.', at);
  return a;
}

export function setPriority(ctx, actor, a, payload, at) {
  requireStaff(ctx, actor, a);
  requireNotMerged(a);
  if (!PRIORITIES[payload.priority]) failWith(400, 'Неизвестный приоритет');
  if (payload.priority === a.priority) return a;
  const from = a.priority;
  a.priority = payload.priority;
  recomputeDues(ctx.state, a);
  pushEvent(a, { at, kind: 'priority', actorId: actor.id, from, to: a.priority, text: String(payload.reason || '').slice(0, 300) });
  return a;
}

export function setDueDate(ctx, actor, a, payload, at) {
  requireStaff(ctx, actor, a);
  if (a.status !== 'progress') failWith(409, 'Срок реализации меняется только в статусе «В работе»');
  const due = Number(payload.dueDate);
  if (!due || due < at - DAY) failWith(400, 'Укажите новый срок (не в прошлом)');
  const text = cleanText(payload.reason, 3, 500, 'Причина переноса');
  const from = a.dueDate;
  a.dueDate = due;
  pushEvent(a, { at, kind: 'due', actorId: actor.id, from, to: due, text });
  notifyAuthor(ctx, a, 'due', 'Срок реализации ' + a.id + ' перенесён на ' + fmtDay(due) + '. Причина: ' + quoteOf(text, 200), at);
  return a;
}

export function setNextAction(ctx, actor, a, payload, at) {
  requireStaff(ctx, actor, a);
  const text = cleanText(payload.text, 0, 500, 'Следующий шаг');
  a.nextAction = text;
  pushEvent(a, { at, kind: 'nextAction', actorId: actor.id, text, internal: true });
  return a;
}

export function setPublic(ctx, actor, a, payload, at) {
  requireStaff(ctx, actor, a);
  a.isPublic = !!payload.isPublic;
  pushEvent(a, { at, kind: 'publish', actorId: actor.id, isPublic: a.isPublic, internal: true });
  return a;
}

// ---------- сотрудники: поддержка, оценка, отзыв ----------
export function toggleSupport(ctx, actor, a, at) {
  if (!accessLevel(ctx, actor, a)) failWith(403, 'Нет доступа к обращению');
  if (isAuthorOf(ctx, actor, a)) failWith(400, 'Нельзя поддержать собственное обращение');
  if (isFinal(a) || a.mergedInto) failWith(409, 'Обращение уже закрыто');
  const i = a.supporters.indexOf(actor.id);
  if (i >= 0) a.supporters.splice(i, 1);
  else {
    a.supporters.push(actor.id);
    const n = a.supporters.length;
    if (n === 3 || n === 5 || n === 10) notifyKey(ctx, a.assigneeId, a, 'supported', a.id + ' ' + quoteOf(a.title, 80) + ' поддержали уже ' + n + ' коллеги.', at);
  }
  a.updatedAt = Math.max(a.updatedAt, at);
  return { supported: i < 0, count: a.supporters.length };
}

export function rateAppeal(ctx, actor, a, payload, at) {
  if (!isAuthorOf(ctx, actor, a)) failWith(403, 'Оценить результат может только автор');
  if (!isFinal(a) || a.mergedInto) failWith(409, 'Оценка доступна после завершения работы');
  if (a.rating) failWith(409, 'Оценка уже поставлена');
  const score = Math.round(Number(payload.score));
  if (!(score >= 1 && score <= 5)) failWith(400, 'Оценка — от 1 до 5');
  const text = cleanText(payload.text, 0, 1000, 'Комментарий к оценке');
  a.rating = { score, text, at };
  pushEvent(a, { at, kind: 'rated', actorId: a.anonymous ? null : actor.id, byAuthor: true, score, text });
  notifyKey(ctx, a.assigneeId, a, 'rated', 'Автор оценил результат по ' + a.id + ': ' + score + '/5' + (text ? ' — ' + quoteOf(text, 160) : '.'), at);
  return a;
}

export function withdrawAppeal(ctx, actor, a, payload, at) {
  if (!isAuthorOf(ctx, actor, a)) failWith(403, 'Отозвать обращение может только автор');
  requireNotMerged(a);
  if (!['new', 'review', 'clarify'].includes(a.status)) failWith(409, 'После принятия решения отозвать обращение нельзя');
  const text = cleanText(payload && payload.text, 0, 500, 'Причина');
  const from = a.status;
  unpauseClarify(ctx, a, at);
  a.status = 'closed';
  a.closingNote = 'Отозвано автором' + (text ? ': ' + text : '');
  a.resolvedAt = at;
  pushEvent(a, { at, kind: 'status', actorId: a.anonymous ? null : actor.id, byAuthor: true, withdrawn: true, from, to: 'closed', text: a.closingNote });
  notifyKey(ctx, a.assigneeId, a, 'status', 'Автор отозвал ' + a.id + ' ' + quoteOf(a.title, 80) + '.', at);
  return a;
}

// ---------- объединение дублей ----------
export function mergeAppeals(ctx, actor, src, target, at) {
  requireStaff(ctx, actor, src);
  if (!target || target.id === src.id) failWith(400, 'Выберите другое обращение для объединения');
  if (!accessLevel(ctx, actor, target)) failWith(404, 'Обращение для объединения не найдено');
  requireNotMerged(src);
  if (target.mergedInto) failWith(409, target.id + ' само объединено с ' + target.mergedInto);
  if (isFinal(src)) failWith(409, 'Закрытое обращение нельзя объединить');
  const from = src.status;
  unpauseClarify(ctx, src, at);
  src.status = 'closed';
  src.mergedInto = target.id;
  src.closingNote = 'Объединено с ' + target.id + ' ' + quoteOf(target.title, 100) + ' — решение будет принято там.';
  src.resolvedAt = at; src.decisionAt = src.decisionAt || at; src.firstResponseAt = src.firstResponseAt || at;
  target.duplicates = (target.duplicates || []).concat(src.id);
  target.related = Array.from(new Set((target.related || []).concat(src.id)));
  src.related = Array.from(new Set((src.related || []).concat(target.id)));
  const sup = new Set(target.supporters.concat(src.supporters));
  if (!src.anonymous && src.authorId) sup.add(src.authorId);
  if (!target.anonymous && target.authorId) sup.delete(target.authorId);
  target.supporters = Array.from(sup);
  target.watchers = Array.from(new Set((target.watchers || []).concat([authorKeyOf(src)], src.watchers || [])));
  pushEvent(src, { at, kind: 'merged', actorId: actor.id, targetId: target.id, from, to: 'closed', text: src.closingNote });
  pushEvent(target, { at, kind: 'duplicate', actorId: actor.id, sourceId: src.id, text: 'Присоединено дублирующее обращение ' + src.id + ' ' + quoteOf(src.title, 100) });
  notifyKey(ctx, authorKeyOf(src), src, 'merged', 'Ваше обращение ' + src.id + ' объединено с похожим ' + target.id + ' ' + quoteOf(target.title, 90) + '. Вы будете получать уведомления о его статусе.', at);
  if (target.assigneeId !== actor.id) notifyKey(ctx, target.assigneeId, target, 'merged', 'К ' + target.id + ' присоединён дубль ' + src.id + ' (' + userLabel(ctx.state, actor.id) + '). Поддержавших: ' + target.supporters.length + '.', at);
  return target;
}
