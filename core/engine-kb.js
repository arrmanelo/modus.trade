// Инструкции и ответы, помощь до отправки обращения, эффект сервиса
import { failWith, getCategory, isAdminUser, isManagerUser } from './engine-core.js';
import { makeId, DAY } from './model.js';
import { buildTextIndex, findSimilar } from './text.js';

const SEED_KB = [
  { title: 'Как сбросить пароль от корпоративной почты', categoryHint: 'it', body: 'Откройте портал самообслуживания, нажмите «Забыли пароль» и подтвердите вход кодом из SMS. Новый пароль начнёт действовать в течение 5 минут. Если код не приходит, проверьте номер телефона в профиле Битрикс24.' },
  { title: 'Не работает принтер в офисе', categoryHint: 'it', body: 'Проверьте, что принтер включён и в лотке есть бумага. На компьютере удалите задание из очереди печати и отправьте документ снова. Если принтер показывает ошибку, перезагрузите его кнопкой питания.' },
  { title: 'Как получить доступ к общей папке отдела', categoryHint: 'it', body: 'Доступ выдаёт руководитель отдела через заявку в Битрикс24 в разделе «Доступы». Укажите путь к папке и нужный уровень: чтение или изменение. Обычно доступ появляется в течение рабочего дня.' },
  { title: 'Как оформить заявку на закупку канцелярии', categoryHint: 'proc', body: 'Заявки на канцелярию собираются до 25 числа каждого месяца. Заполните форму «Заявка на канцтовары» в Битрикс24, руководитель согласует её, отдел закупок доставит товары в первую неделю следующего месяца.' },
  { title: 'Где посмотреть остаток отпуска', categoryHint: 'hr', body: 'Остаток дней отпуска виден в профиле сотрудника в Битрикс24 в разделе «Отпуска». Данные обновляются раз в сутки. Если число кажется неверным, напишите в отдел кадров с указанием периода.' },
  { title: 'Как заказать справку с места работы', categoryHint: 'hr', body: 'Заполните запрос «Справка с места работы» в Битрикс24 и укажите, куда нужна справка. Готовую справку можно забрать в отделе кадров через 2 рабочих дня или получить скан на почту.' },
  { title: 'Пропуск на парковку для сотрудника', categoryHint: 'aho', body: 'Пропуск оформляет административно-хозяйственный отдел. Отправьте номер автомобиля и марку через заявку «Пропуск на парковку». Количество мест ограничено, при отсутствии мест вас поставят в лист ожидания.' },
  { title: 'Не работает кондиционер или холодно в помещении', categoryHint: 'aho', body: 'Проверьте режим на пульте: в межсезонье кондиционеры переводятся на вентиляцию. Если пульт не помогает, сообщите номер кабинета дежурному инженеру по внутреннему номеру 1100.' },
];

function ensureKb(ctx) {
  const st = ctx.state;
  if (!Array.isArray(st.kb)) {
    const cats = st.categories || [];
    const findCat = (hint) => { const c = cats.find((x) => (x.id || '').toLowerCase().includes(hint) || (x.groupId || '').toLowerCase().includes(hint)); return c ? c.id : null; };
    st.kb = SEED_KB.map((a, i) => ({ id: 'kb_' + (i + 1), title: a.title, body: a.body, categoryId: findCat(a.categoryHint), createdAt: (st.seededAt || ctx.now) - (30 - i) * DAY, updatedAt: (st.seededAt || ctx.now) - (30 - i) * DAY, authorId: null, archived: false, views: 0, helpful: 0, notHelpful: 0 }));
  }
  if (!Array.isArray(st.kbAttempts)) st.kbAttempts = [];
  return st;
}

function cleanStr(v, max) { return String(v == null ? '' : v).replace(/\s+$/g, '').slice(0, max); }
function projectArticle(st, a, full) {
  const c = a.categoryId ? (st.categories || []).find((x) => x.id === a.categoryId) : null;
  return { id: a.id, title: a.title, body: full ? a.body : a.body.slice(0, 220), categoryId: a.categoryId, categoryName: c ? c.name : null, updatedAt: a.updatedAt, views: a.views || 0, helpful: a.helpful || 0, notHelpful: a.notHelpful || 0, archived: !!a.archived };
}
function canEditKb(me) { return !!me && me.role !== 'employee'; }

function suggest(ctx, text, limit) {
  const st = ensureKb(ctx);
  const pool = st.kb.filter((a) => !a.archived);
  if (!pool.length || String(text).replace(/[\s.]/g, '').length < 6) return [];
  const index = buildTextIndex(pool.map((a) => ({ id: a.id, text: a.title + '. ' + a.title + '. ' + a.body })));
  return findSimilar(index, text, { limit: limit || 3, threshold: 0.08, exclude: [] }).map((f) => pool.find((a) => a.id === f.id)).filter(Boolean);
}

function attemptStats(st, attempts) {
  const r = { total: attempts.length, solved: 0, created: 0, joined: 0, unknown: 0 };
  attempts.forEach((t) => { if (t.outcome === 'solved') r.solved++; else if (t.outcome === 'created') r.created++; else if (t.outcome === 'joined') r.joined++; else r.unknown++; });
  return r;
}

function impact(ctx, me, q) {
  const st = ensureKb(ctx);
  const days = Math.min(365, Math.max(7, Number(q.days) || 30));
  const from = ctx.now - days * DAY;
  const prevFrom = from - days * DAY;
  const scope = isManagerUser(me) && !isAdminUser(me) ? (a) => (!!me.departmentId && a.authorDepartmentId === me.departmentId) || a.assigneeId === me.id : () => true;
  const all = st.appeals.filter((a) => !a.mergedInto).filter(scope);
  const inRange = (a, f, t) => a.createdAt >= f && a.createdAt < t;
  const cur = all.filter((a) => inRange(a, from, ctx.now + 1));
  const prev = all.filter((a) => inRange(a, prevFrom, from));
  const resolved = (list) => list.filter((a) => a.resolvedAt);
  const avgH = (list, field) => { const xs = list.filter((a) => a[field]).map((a) => (a[field] - a.createdAt) / 3600000).filter((x) => x >= 0); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; };
  const rated = (list) => list.filter((a) => a.rating);
  const avgRating = (list) => { const r = rated(list); return r.length ? r.reduce((s, a) => s + Number(a.rating.score || a.rating), 0) / r.length : null; };
  const kpi = (list) => ({ created: list.length, implemented: list.filter((a) => a.status === 'done').length, resolved: resolved(list).length,
    avgFirstResponseH: avgH(list, 'firstResponseAt'), avgResolveH: avgH(list, 'resolvedAt'), avgRating: avgRating(list), rated: rated(list).length });
  const attemptsCur = st.kbAttempts.filter((t) => t.at >= from && (!isManagerUser(me) || isAdminUser(me) || t.departmentId === me.departmentId));
  const effects = all.filter((a) => a.status === 'done' && a.resolvedAt && a.resolvedAt >= from).sort((a, b) => b.resolvedAt - a.resolvedAt).slice(0, 8)
    .map((a) => ({ id: a.id, title: a.title, categoryId: a.categoryId, result: a.result || a.decision || '', resolvedAt: a.resolvedAt, supporters: (a.supporters || []).length }));
  const byCat = {};
  cur.forEach((a) => { const k = a.categoryId || 'other'; byCat[k] = byCat[k] || { categoryId: k, name: (getCategory(st, k) || {}).name || 'Без категории', created: 0, implemented: 0 }; byCat[k].created++; if (a.status === 'done') byCat[k].implemented++; });
  const topArticles = st.kb.filter((a) => !a.archived).sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || (b.views || 0) - (a.views || 0)).slice(0, 5).map((a) => projectArticle(st, a, false));
  return { days, scope: isAdminUser(me) ? 'company' : 'department', current: kpi(cur), previous: kpi(prev), deflection: attemptStats(st, attemptsCur), effects, byCategory: Object.values(byCat).sort((a, b) => b.created - a.created).slice(0, 8), topArticles };
}

export function kbRoute(ctx, method, path, q, body, me) {
  if (!(path === '/kb' || path.startsWith('/kb/') || path === '/impact')) return null;
  if (!me) failWith(401, 'Войдите в систему');
  const st = ensureKb(ctx);
  const ok = (json, changed) => ({ status: 200, json, changed: !!changed });
  if (method === 'GET' && path === '/impact') {
    if (!isManagerUser(me)) failWith(403, 'Раздел доступен руководителям и администратору');
    return ok(impact(ctx, me, q || {}));
  }
  if (method === 'GET' && path === '/kb') {
    const term = String((q && q.q) || '').trim().toLowerCase();
    const cat = (q && q.cat) || '';
    let items = st.kb.filter((a) => (canEditKb(me) && q && q.archived === '1') ? a.archived : !a.archived);
    if (cat) items = items.filter((a) => a.categoryId === cat);
    if (term) items = items.filter((a) => (a.title + ' ' + a.body).toLowerCase().includes(term));
    items = items.slice().sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || b.updatedAt - a.updatedAt);
    return ok({ items: items.map((a) => projectArticle(st, a, false)), canEdit: canEditKb(me), total: items.length });
  }
  if (method === 'POST' && path === '/kb/suggest') {
    const text = cleanStr(body.title, 200) + '. ' + cleanStr(body.text, 2000);
    const found = suggest(ctx, text, 3);
    if (!found.length) return ok({ items: [], attemptId: null });
    let t = body.attemptId ? st.kbAttempts.find((x) => x.id === body.attemptId && x.userId === me.id) : null;
    if (!t) { t = { id: makeId('att'), userId: me.id, departmentId: me.departmentId || null, at: ctx.now, viewed: [], outcome: null }; st.kbAttempts.push(t); if (st.kbAttempts.length > 5000) st.kbAttempts.splice(0, st.kbAttempts.length - 5000); }
    return ok({ items: found.map((a) => projectArticle(st, a, true)), attemptId: t.id }, true);
  }
  if (method === 'POST' && path === '/kb/attempt') {
    const t = st.kbAttempts.find((x) => x.id === body.attemptId && x.userId === me.id);
    if (!t) failWith(404, 'Попытка не найдена');
    if (body.viewed) { const art = st.kb.find((a) => a.id === body.viewed); if (art && !t.viewed.includes(art.id)) { t.viewed.push(art.id); art.views = (art.views || 0) + 1; } }
    if (body.outcome) {
      if (!['solved', 'created', 'joined'].includes(body.outcome)) failWith(400, 'Неизвестный исход');
      if (!t.outcome) {
        t.outcome = body.outcome; t.outcomeAt = ctx.now; t.appealId = body.appealId || null;
        if (body.outcome === 'solved') t.viewed.forEach((id) => { const art = st.kb.find((a) => a.id === id); if (art) art.helpful = (art.helpful || 0) + 1; });
      }
    }
    return ok({ attempt: { id: t.id, outcome: t.outcome, viewed: t.viewed.length } }, true);
  }
  const seg = path.split('/').filter(Boolean);
  if (seg.length === 2 && method === 'GET') {
    const a = st.kb.find((x) => x.id === seg[1]);
    if (!a || (a.archived && !canEditKb(me))) failWith(404, 'Инструкция не найдена');
    return ok({ article: projectArticle(st, a, true), canEdit: canEditKb(me) });
  }
  if (method === 'POST' && (path === '/kb' || seg.length === 2)) {
    if (!canEditKb(me)) failWith(403, 'Редактировать инструкции могут ответственные, руководители и администратор');
    const title = cleanStr(body.title, 160).trim(); const text = cleanStr(body.body, 6000).trim();
    let a = seg.length === 2 ? st.kb.find((x) => x.id === seg[1]) : null;
    if (seg.length === 2 && !a) failWith(404, 'Инструкция не найдена');
    if (body.archived != null && a) { a.archived = !!body.archived; a.updatedAt = ctx.now; return ok({ article: projectArticle(st, a, true) }, true); }
    if (title.length < 5) failWith(400, 'Заголовок слишком короткий');
    if (text.length < 20) failWith(400, 'Опишите решение подробнее, минимум 20 символов');
    const categoryId = body.categoryId && getCategory(st, body.categoryId) ? body.categoryId : null;
    if (!a) { a = { id: makeId('kb'), createdAt: ctx.now, authorId: me.id, archived: false, views: 0, helpful: 0, notHelpful: 0 }; st.kb.unshift(a); }
    Object.assign(a, { title, body: text, categoryId, updatedAt: ctx.now, editorId: me.id });
    return ok({ article: projectArticle(st, a, true) }, true);
  }
  failWith(404, 'Маршрут не найден: ' + method + ' ' + path);
}
