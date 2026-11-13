import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createEngine } from '../core/engine-api.js';

function fixture() {
  const env = { now: () => Date.parse('2026-11-13T10:00:00Z'), hmac: (s) => crypto.createHmac('sha256', 'kb-only').update(s).digest('hex'), bitrixLive: false };
  const engine = createEngine(env);
  const call = (user, method, path, body = {}, query = {}) => engine.handle({ method, path, body, query, token: user ? engine.tokenFor(user) : null });
  return { engine, call };
}

test('Инструкции: список, поиск, права на редактирование', () => {
  const { call } = fixture();
  assert.equal(call(null, 'GET', '/kb').status, 401);
  const list = call('u_emp_proc', 'GET', '/kb');
  assert.equal(list.status, 200); assert.ok(list.json.items.length >= 5); assert.equal(list.json.canEdit, false);
  assert.ok(call('u_emp_proc', 'GET', '/kb', {}, { q: 'принтер' }).json.items.length >= 1);
  assert.equal(call('u_emp_proc', 'POST', '/kb', { title: 'Новая инструкция', body: 'Достаточно длинный текст инструкции' }).status, 403);
  const cr = call('u_it', 'POST', '/kb', { title: 'Как подключить VPN из дома', body: 'Установите клиент VPN с портала и войдите под рабочей учётной записью.' });
  assert.equal(cr.status, 200);
  const id = cr.json.article.id;
  assert.equal(call('u_emp_proc', 'GET', '/kb/' + id).json.article.title, 'Как подключить VPN из дома');
  assert.equal(call('u_it', 'POST', '/kb/' + id, { archived: true }).status, 200);
  assert.equal(call('u_emp_proc', 'GET', '/kb/' + id).status, 404);
});

test('Помощь до отправки: подсказка, просмотр, исход считается один раз', () => {
  const { call } = fixture();
  const s = call('u_emp_proc', 'POST', '/kb/suggest', { title: 'Не работает принтер', text: 'Принтер в офисе не печатает документы' });
  assert.equal(s.status, 200); assert.ok(s.json.items.length >= 1); assert.ok(s.json.attemptId);
  const art = s.json.items[0].id; const att = s.json.attemptId;
  call('u_emp_proc', 'POST', '/kb/attempt', { attemptId: att, viewed: art });
  call('u_emp_proc', 'POST', '/kb/attempt', { attemptId: att, viewed: art });
  assert.equal(call('u_emp_proc', 'POST', '/kb/attempt', { attemptId: att, outcome: 'solved' }).json.attempt.outcome, 'solved');
  assert.equal(call('u_emp_proc', 'POST', '/kb/attempt', { attemptId: att, outcome: 'created' }).json.attempt.outcome, 'solved');
  assert.equal(call('u_it', 'POST', '/kb/attempt', { attemptId: att, outcome: 'created' }).status, 404);
  const a = call('u_emp_proc', 'GET', '/kb/' + art).json.article; assert.equal(a.views, 1); assert.equal(a.helpful, 1);
});

test('Эффект сервиса: только для руководителей, с показателями', () => {
  const { call, engine } = fixture();
  assert.equal(call('u_emp_proc', 'GET', '/impact').status, 403);
  const admin = engine.getState().users.find((u) => u.role === 'admin').id;
  const r = call(admin, 'GET', '/impact', {}, { days: 30 });
  assert.equal(r.status, 200); assert.equal(r.json.scope, 'company');
  for (const k of ['created', 'implemented', 'resolved', 'avgRating']) assert.ok(k in r.json.current);
  assert.ok('solved' in r.json.deflection);
});

test('Эффект сервиса: подразделение автора, личные назначения и изоляция чужих обращений', () => {
  const { call, engine } = fixture();
  const st = engine.getState();
  const now = Date.parse('2026-11-13T10:00:00Z');
  const day = 86400000;
  const appeal = (id, authorDepartmentId, assigneeId, age) => ({
    id, title: id, authorDepartmentId, assigneeId, categoryId: 'c_it',
    createdAt: now - age * day, resolvedAt: now - (age - 1) * day,
    status: 'done', result: 'Готово', supporters: [],
  });
  st.appeals = [
    appeal('own-department', 'd_proc', 'u_it', 2),
    appeal('direct-assignment', 'd_acc', 'u_proc_head', 3),
    appeal('foreign', 'd_acc', 'u_it', 4),
    appeal('anonymous', null, 'u_it', 5),
    appeal('previous-department', 'd_proc', 'u_it', 40),
  ];
  const r = call('u_proc_head', 'GET', '/impact');
  assert.equal(r.status, 200);
  assert.equal(r.json.current.created, 2);
  assert.equal(r.json.previous.created, 1);
  assert.deepEqual(r.json.effects.map(a => a.id).sort(), ['direct-assignment', 'own-department']);
  assert.equal(r.json.byCategory[0].created, 2);
  assert.equal(call('u_admin', 'GET', '/impact').json.current.created, 4);
  for (const id of ['u_it', 'u_contracts', 'u_docs']) {
    assert.equal(call(id, 'GET', '/impact').status, 403);
    assert.equal(call(id, 'GET', '/analytics').status, 403);
  }
});
