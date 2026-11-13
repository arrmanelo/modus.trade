// Тесты безопасности: node --test tests/security.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createEngine } from '../core/engine-api.js';
import { checkPasswordStrength, validateUpload } from '../core/security.js';

const hmac = (s) => crypto.createHmac('sha256', 'test-secret').update(String(s)).digest('hex');
const hash = (pw) => 'plain$' + crypto.createHash('sha256').update(pw).digest('hex');
const verify = (h, pw) => !!h && h === hash(pw);
function mk(extra) {
  const env = Object.assign({ now: () => Date.parse('2026-11-13T10:00:00Z'), hmac, bitrixLive: false }, extra || {});
  const engine = createEngine(env);
  const call = (token, method, path, body, query) => engine.handle({ method, path: '/api' + path, body, query, token });
  return { engine, call, env };
}
const pwEnv = { mode: 'server', demoLogin: false, demoTools: false, hashPassword: hash, verifyPassword: verify, randomHex: (n) => crypto.randomBytes(n).toString('hex') };
const b64 = (s) => Buffer.from(s).toString('base64');

test('вход: на сервере без DEMO_LOGIN нельзя войти по userId, нужен пароль; токен не отдаётся в JSON', () => {
  const { engine, call } = mk(pwEnv);
  assert.equal(call(null, 'POST', '/login', { userId: 'u_admin' }).status, 400);
  const admin = engine.getState().users.find((u) => u.id === 'u_admin');
  admin.passwordHash = hash('Very$trongPass1');
  const bad = call(null, 'POST', '/login', { email: admin.email, password: 'nope' });
  assert.equal(bad.status, 401);
  assert.equal(call(null, 'POST', '/login', { email: 'nobody@x.ru', password: 'nope' }).json.error, bad.json.error, 'одинаковый текст — нельзя узнать, есть ли e-mail');
  const ok = call(null, 'POST', '/login', { email: admin.email.toUpperCase(), password: 'Very$trongPass1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.token, undefined);
  assert.match(ok.session.token, /^[0-9a-f]{64}$/);
  assert.equal(call(ok.session.token, 'GET', '/me').status, 200);
  call(ok.session.token, 'POST', '/logout');
  assert.equal(call(ok.session.token, 'GET', '/me').status, 401, 'после выхода токен недействителен');
});

test('вход: блокировка после 5 неудачных попыток', () => {
  const { engine, call } = mk(pwEnv);
  const u = engine.getState().users.find((x) => x.id === 'u_it');
  u.passwordHash = hash('Very$trongPass1');
  for (let i = 0; i < 5; i++) call(null, 'POST', '/login', { email: u.email, password: 'wrong' + i });
  assert.equal(call(null, 'POST', '/login', { email: u.email, password: 'Very$trongPass1' }).status, 429);
});

test('токены случайные, подделка и старый формат не работают', () => {
  const { engine, call } = mk();
  const t1 = engine.tokenFor('u_admin'); const t2 = engine.tokenFor('u_admin');
  assert.notEqual(t1, t2);
  assert.equal(call('u_admin.' + hmac('tok:u_admin').slice(0, 32), 'GET', '/me').status, 401);
  assert.equal(call('0'.repeat(64), 'GET', '/me').status, 401);
  assert.equal(call({ toString: () => t1 }, 'GET', '/me').status, 401);
});

test('анонимный /bootstrap на сервере не отдаёт справочник сотрудников', () => {
  const { call } = mk(pwEnv);
  const r = call(null, 'GET', '/bootstrap');
  assert.equal(r.status, 200);
  assert.equal(r.json.users.length, 0);
  assert.equal(r.json.demoUsers.length, 0);
  assert.equal(r.json.app.loginMode, 'password');
});

test('IDOR/BOLA: чужое обращение и файл — 404, админка — 403, без токена — 401', () => {
  const { engine, call } = mk();
  const emp = engine.tokenFor('u_emp_proc'); const other = engine.tokenFor('u_office'); const it = engine.tokenFor('u_it');
  const r = call(emp, 'POST', '/appeals', { type: 'problem', categoryId: 'c_it', title: 'Личная проблема с доступом', description: 'Не работает доступ к папке отдела, прошу проверить', isPublic: false, files: [{ name: 'a.txt', type: 'text/plain', data: b64('secret') }] });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json.appeal.id; const fid = r.json.appeal.attachments[0].id;
  assert.equal(call(other, 'GET', '/appeals/' + id).status, 404);
  assert.equal(call(other, 'GET', '/files/' + fid).status, 404);
  assert.equal(call(other, 'GET', '/appeals/NOPE-1').status, 404);
  assert.equal(call(other, 'POST', '/appeals/' + id + '/comment', { text: 'взлом' }).status, 404);
  assert.equal(call(null, 'GET', '/appeals').status, 401);
  for (const [m, p] of [['GET', '/admin/config'], ['PUT', '/admin/sla'], ['POST', '/admin/reset'], ['PUT', '/admin/users/u_emp_proc']]) {
    assert.equal(call(emp, m, p, { role: 'admin' }).status, 403, m + ' ' + p);
    assert.equal(call(it, m, p, { role: 'admin' }).status, 403, m + ' ' + p);
  }
  assert.equal(engine.getState().users.find((u) => u.id === 'u_emp_proc').role, 'employee');
});

test('массовое присвоение: лишние поля игнорируются', () => {
  const { engine, call } = mk();
  const emp = engine.tokenFor('u_emp_proc'); const admin = engine.tokenFor('u_admin');
  const r = call(emp, 'POST', '/appeals', { type: 'idea', categoryId: 'c_it', title: 'Идея по улучшению процесса', description: 'Предлагаю автоматизировать сверку данных', status: 'done', authorId: 'u_dir', assigneeId: 'u_emp_proc', id: 'A-999', votes: 1000 });
  assert.equal(r.status, 201);
  const a = engine.getState().appeals.find((x) => x.id === r.json.appeal.id);
  assert.equal(a.status, 'new'); assert.notEqual(a.id, 'A-999'); assert.notEqual(a.authorId, 'u_dir'); assert.notEqual(a.assigneeId, 'u_emp_proc');
  call(admin, 'PUT', '/admin/users/u_hr', { role: 'handler', passwordHash: 'x', email: 'evil@x.ru', name: 'Hacker' });
  const hr = engine.getState().users.find((u) => u.id === 'u_hr');
  assert.notEqual(hr.passwordHash, 'x'); assert.notEqual(hr.email, 'evil@x.ru'); assert.notEqual(hr.name, 'Hacker');
  const log = JSON.stringify(engine.getState().audit || engine.getState().auditLog || []);
  assert.ok(!log.includes('evil@x.ru'), 'в аудит пишутся только разрешённые поля');
});

test('prototype pollution и мусорные данные не ломают сервер', () => {
  const { engine, call } = mk();
  const admin = engine.tokenFor('u_admin');
  const body = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"rules":[]}');
  call(admin, 'PUT', '/admin/rules', body);
  assert.equal({}.polluted, undefined);
  const r = call(admin, 'GET', '/appeals/%E0%A4%A');
  assert.ok(r.status === 400 || r.status === 404);
  assert.equal(call(admin, 'POST', '/appeals', { title: { $ne: 1 }, text: ['x'], files: 'nope' }).status, 400);
});

test('ошибки 500 не раскрывают детали', () => {
  const { engine, call } = mk({ log: () => {} });
  const st = engine.getState(); st.appeals = null; // имитируем сбой
  const r = call(engine.tokenFor('u_admin'), 'GET', '/appeals');
  assert.equal(r.status, 500);
  assert.equal(r.json.error, 'Внутренняя ошибка сервера');
});

test('демо-инструменты выключены на сервере без DEMO_TOOLS', () => {
  const { engine, call } = mk(pwEnv);
  const t = engine.tokenFor('u_admin');
  assert.equal(call(t, 'POST', '/admin/reset').status, 403);
  assert.equal(call(t, 'POST', '/admin/time', { days: 3 }).status, 403);
});

test('пароли: проверка надёжности и смена', () => {
  for (const bad of ['short1A!', 'password123', 'qwertyuiop', 'aaaaaaaaaaaaaaaa', 'onlylowercase']) assert.equal(checkPasswordStrength(bad).ok, false, bad);
  assert.equal(checkPasswordStrength('Ivanov2026!x', { name: 'Иван Ivanov', email: 'ivanov@m.ru' }).ok, false);
  assert.equal(checkPasswordStrength('Kor0bka-Sinyaya').ok, true);
  assert.equal(checkPasswordStrength('длинная фраза про синий трамвай').ok, true);
  const { engine, call } = mk(pwEnv);
  const u = engine.getState().users.find((x) => x.id === 'u_dir');
  u.passwordHash = hash('Old-Passw0rd!x');
  const t = engine.tokenFor('u_dir'); const t2 = engine.tokenFor('u_dir');
  assert.equal(call(t, 'POST', '/me/password', { currentPassword: 'wrong', newPassword: 'New-Passw0rd!x' }).status, 403);
  assert.equal(call(t, 'POST', '/me/password', { currentPassword: 'Old-Passw0rd!x', newPassword: '123' }).status, 400);
  assert.equal(call(t, 'POST', '/me/password', { currentPassword: 'Old-Passw0rd!x', newPassword: 'New-Passw0rd!x' }).status, 200);
  assert.equal(call(t2, 'GET', '/me').status, 401, 'другие сессии завершены');
  assert.equal(call(t, 'GET', '/me').status, 200);
});

test('файлы: тип, сигнатура, размер и имя проверяются', () => {
  const fail = (s, m) => { throw Object.assign(new Error(m), { status: s }); };
  assert.throws(() => validateUpload({ name: 'x.svg', type: 'image/png', data: b64('<svg onload=alert(1)>') }, fail), /тип/);
  assert.throws(() => validateUpload({ name: 'x.html', data: b64('<script>') }, fail), /тип/);
  assert.throws(() => validateUpload({ name: 'x.png', type: 'image/png', data: b64('<svg onload=alert(1)>') }, fail), /не соответствует/);
  assert.throws(() => validateUpload({ name: 'x.txt', data: '###' }, fail), /повреж/);
  assert.throws(() => validateUpload({ name: 'big.txt', data: b64('a'.repeat(2 * 1024 * 1024 + 10)) }, fail), /2 МБ/);
  const ok = validateUpload({ name: '../../etc/\u202Egnp.exe.txt', type: 'text/html', data: b64('hello') }, fail);
  assert.equal(ok.name, 'gnp.exe.txt');
  assert.equal(ok.type, 'text/plain', 'тип берётся из проверки, а не от клиента');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  assert.equal(validateUpload({ name: 'p.PNG', data: png }, fail).type, 'image/png');
});
