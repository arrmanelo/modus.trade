// Модус Сигнал — сервер MVP. Без внешних зависимостей: Node.js 20+, node:http, хранение в JSON-файле.
// Запуск: node server/server.js  →  http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../core/engine-api.js';
import { sanitizeInput } from '../core/security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const PORT = Number(process.env.PORT) || 3000;
// По умолчанию слушаем только локальный интерфейс. Для сети: HOST=0.0.0.0 (и обязательно HTTPS через reverse proxy)
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BITRIX = (process.env.BITRIX24_WEBHOOK_URL || '').replace(/\/+$/, '');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const MAX_BODY = 12 * 1024 * 1024; // 5 файлов × 2 МБ в base64 + текст
const PROD = process.env.NODE_ENV === 'production';
// Демо-вход без пароля (выбор роли) — только если явно включён. В production запрещён.
const DEMO_LOGIN = process.env.DEMO_LOGIN === '1' && !PROD;
// Демо-инструменты администратора (сдвиг времени, сброс данных) — так же
// Демо-аккаунты с паролем demo1234 (кнопки ролей на экране входа). Включены по умолчанию, в production выключены. DEMO_ACCOUNTS=0 — отключить.
const DEMO_ACCOUNTS = process.env.DEMO_ACCOUNTS !== '0' && !PROD;
const DEMO_TOOLS = process.env.DEMO_TOOLS === '1' && !PROD;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1' || /^https:/.test(PUBLIC_URL);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const HIBP_CHECK = process.env.HIBP_CHECK === '1';
const COOKIE = COOKIE_SECURE ? '__Host-ms_session' : 'ms_session';

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

function loadSecret() {
  if (process.env.APP_SECRET) {
    if (process.env.APP_SECRET.length < 32) { console.error('APP_SECRET должен быть не короче 32 символов'); process.exit(1); }
    return process.env.APP_SECRET;
  }
  if (PROD) { console.error('В production задайте APP_SECRET через переменную окружения (не храните ключ рядом с данными)'); process.exit(1); }
  const f = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

// Пароли: scrypt (N=2^15, r=8, p=1) + соль 16 байт; сравнение за постоянное время
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw).normalize('NFKC'), salt, 32, SCRYPT);
  return 'scrypt$' + SCRYPT.N + '$' + SCRYPT.r + '$' + SCRYPT.p + '$' + salt.toString('base64') + '$' + key.toString('base64');
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));
function verifyPassword(stored, pw) {
  const parts = String(stored || DUMMY_HASH).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, key] = parts;
  const expected = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(expected, got) && !!stored;
}

const env = {
  now: () => Date.now(),
  hmac: (s) => crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex'),
  randomHex: (n) => crypto.randomBytes(n).toString('hex'),
  hashPassword, verifyPassword,
  bitrixLive: !!BITRIX,
  demoLogin: DEMO_LOGIN,
  demoTools: DEMO_TOOLS,
  demoAccounts: DEMO_ACCOUNTS,
  demoPassword: DEMO_ACCOUNTS ? 'demo1234' : null,
  demoPasswordHash: DEMO_ACCOUNTS ? hashPassword('demo1234') : null,
  mode: 'server',
  log: (...a) => console.error(...a),
};

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    // Десериализация: только JSON.parse + удаление __proto__/constructor (защита от prototype pollution)
    return sanitizeInput(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')), -1000);
  } catch (e) {
    const bad = DB_FILE + '.broken-' + Date.now();
    fs.renameSync(DB_FILE, bad);
    console.warn('[db] файл повреждён, сохранён как', bad, '— создаю демо-данные заново');
    return null;
  }
}
const engine = createEngine(env, loadDb());

// Первый запуск без демо-входа: администратору нужен пароль
if (!DEMO_LOGIN) {
  const st = engine.getState();
  const admin = st.users.find((u) => u.role === 'admin');
  if (admin && !st.users.some((u) => u.passwordHash) && !(DEMO_ACCOUNTS && admin.demo)) {
    let pw = process.env.ADMIN_PASSWORD;
    if (!pw) pw = crypto.randomBytes(12).toString('base64url') + 'a1!';
    admin.passwordHash = hashPassword(pw);
    admin.mustChangePassword = true;
    console.log('\n[auth] Создан пароль администратора (' + admin.email + '). Смените его после входа.');
    if (!process.env.ADMIN_PASSWORD) console.log('[auth] Временный пароль: ' + pw + '\n');
  }
}

let saveTimer = null;
function saveNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(engine.getState()), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { saveNow(); } catch (e) { console.error('[db] не удалось сохранить', e); } }, 250);
}
saveNow();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
// CSP: только свои скрипты; inline-скрипт темы в index.html разрешён по хешу (считается при старте)
function inlineScriptHashes() {
  try {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    return Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'");
  } catch (e) { return []; }
}
const CSP = [
  "default-src 'self'", "script-src 'self' " + inlineScriptHashes().join(' '), "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'", "frame-src blob:",
].join('; ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': CSP,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
if (COOKIE_SECURE) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

function send(res, status, headers, body) {
  if (res.headersSent) { try { res.end(); } catch (e) { /* ignore */ } return; }
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(body);
}
function sendJson(res, status, obj, extra) {
  send(res, status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}), JSON.stringify(obj));
}
function contentDisposition(kind, name) {
  const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_');
  return kind + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

// ---------- ограничение частоты запросов (скользящее окно в памяти) ----------
const buckets = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n++;
  return b.n > limit ? Math.ceil((b.start + windowMs - now) / 1000) : 0;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.start > 15 * 60 * 1000) buckets.delete(k); }, 60 * 1000).unref();
const LIMITS = [
  // [префикс, метод, лимит, окно]
  ['/api/login', 'POST', 10, 15 * 60 * 1000],
  ['/api/me/password', 'POST', 10, 15 * 60 * 1000],
  ['/api/appeals', 'POST', 60, 60 * 1000],
  ['/api/', 'MUTATE', 120, 60 * 1000],
  ['/api/', 'ANY', 600, 60 * 1000],
  ['/', 'ANY', 1200, 60 * 1000],
];
function clientIp(req) {
  if (TRUST_PROXY) { const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (xf) return xf; }
  return req.socket.remoteAddress || '?';
}
function checkRate(req, pathname) {
  const ip = clientIp(req);
  const mutate = req.method !== 'GET' && req.method !== 'HEAD';
  for (const [prefix, m, limit, win] of LIMITS) {
    if (!pathname.startsWith(prefix)) continue;
    if (m === 'MUTATE' && !mutate) continue;
    if (m !== 'ANY' && m !== 'MUTATE' && m !== req.method) continue;
    const wait = rateLimited(prefix + '|' + m + '|' + ip, limit, win);
    if (wait) return wait;
  }
  return 0;
}

// ---------- тело запроса ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.resume(); return; }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > MAX_BODY) { failed = true; reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (failed) return;
      if (!chunks.length) return resolve({});
      if (!/^application\/json\b/i.test(ct)) return reject(Object.assign(new Error('Ожидается Content-Type: application/json'), { status: 415 }));
      let parsed;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return reject(Object.assign(new Error('Некорректный JSON'), { status: 400 })); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(Object.assign(new Error('Ожидается JSON-объект'), { status: 400 }));
      resolve(sanitizeInput(parsed));
    });
    req.on('error', reject);
  });
}

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* битая cookie — игнорируем */ }
  }
  return out;
}
function sessionCookie(token, maxAgeSec) {
  return COOKIE + '=' + (token || '') + '; Path=/; HttpOnly; SameSite=Strict' + (COOKIE_SECURE ? '; Secure' : '') + '; Max-Age=' + (token ? maxAgeSec : 0);
}

// Проверка источника для изменяющих запросов (CSRF): Origin/Referer должен совпадать с хостом,
// и должен быть заголовок X-Requested-With (браузер не пошлёт его кросс-доменно без CORS — а CORS мы не разрешаем)
function sameOrigin(req) {
  const host = String(req.headers.host || '');
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true; // не браузер (curl, интеграции) — остаётся проверка токена
  try { const u = new URL(origin); return u.host === host || (PUBLIC_URL && u.origin === new URL(PUBLIC_URL).origin); } catch (e) { return false; }
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad request');
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep)) return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
  if (path.basename(file).startsWith('.')) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
    const ext = path.extname(file).toLowerCase();
    send(res, 200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' }, req.method === 'HEAD' ? undefined : data);
  });
}

// Пароль в базах утечек (Have I Been Pwned, k-анонимность: наружу уходят 5 символов SHA-1). Включается HIBP_CHECK=1.
async function pwnedCount(pw) {
  if (!HIBP_CHECK || !pw) return 0;
  const sha = crypto.createHash('sha1').update(String(pw)).digest('hex').toUpperCase();
  try {
    const ctrl = AbortSignal.timeout(3000);
    const r = await fetch('https://api.pwnedpasswords.com/range/' + sha.slice(0, 5), { headers: { 'Add-Padding': 'true' }, signal: ctrl });
    if (!r.ok) return 0;
    const line = (await r.text()).split('\n').find((l) => l.startsWith(sha.slice(5)));
    return line ? Number(line.split(':')[1]) || 0 : 0;
  } catch (e) { return 0; } // сервис недоступен — не блокируем, остаётся локальная проверка
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const wait = checkRate(req, pathname);
  if (wait) return sendJson(res, 429, { error: 'Слишком много запросов. Повторите через ' + wait + ' с.' }, { 'Retry-After': String(wait) });
  if (pathname === '/healthz') return sendJson(res, 200, { ok: true });
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, '');
    return serveStatic(req, res, pathname);
  }
  // CORS не разрешаем никому: заголовков Access-Control-Allow-* нет; preflight отклоняем
  if (req.method === 'OPTIONS') return send(res, 405, {}, '');
  const mutate = req.method !== 'GET' && req.method !== 'HEAD';
  if (mutate && (!sameOrigin(req) || (req.headers.origin && req.headers['x-requested-with'] !== 'modus'))) {
    return sendJson(res, 403, { error: 'Запрос с чужого сайта отклонён' });
  }
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
  }
  const query = {};
  for (const [k, v] of url.searchParams.entries()) { if (k !== 'token' && k.length <= 40 && !(k in query)) query[k] = v.slice(0, 500); }
  // Токен — только из HttpOnly-cookie или заголовка Authorization (не из URL: попадает в логи и историю)
  const auth = String(req.headers.authorization || '');
  const cookies = parseCookies(req.headers.cookie);
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookies[COOKIE] || null;

  if (req.method === 'POST' && (pathname === '/api/me/password' || /^\/api\/admin\/users\/[^/]+\/password$/.test(pathname))) {
    const n = await pwnedCount(body.newPassword || body.password);
    if (n > 0) return sendJson(res, 400, { error: 'Этот пароль встречается в утечках (' + n + ' раз). Выберите другой.' });
  }

  const r = engine.handle({ method: req.method, path: pathname, query, body, token });
  if (r.changed) scheduleSave();
  const extra = {};
  if (r.session !== undefined) extra['Set-Cookie'] = sessionCookie(r.session && r.session.token, r.session && r.session.maxAgeSec);
  if (r.text !== undefined) {
    return send(res, r.status, Object.assign(extra, { 'Content-Type': r.contentType || 'text/plain; charset=utf-8', 'Content-Disposition': contentDisposition('attachment', r.filename || 'export.csv'), 'Cache-Control': 'no-store' }), r.text);
  }
  if (r.file) {
    const buf = Buffer.from(r.file.data, 'base64');
    // Показывать в браузере — только безопасные растровые картинки и PDF; всё остальное — скачиванием.
    const inline = /^image\/(png|jpeg|gif|webp)$/.test(r.file.type) || r.file.type === 'application/pdf';
    return send(res, r.status, {
      'Content-Type': r.file.type || 'application/octet-stream',
      'Content-Disposition': contentDisposition(inline && query.download !== '1' ? 'inline' : 'attachment', r.file.name),
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'Content-Length': buf.length, 'Cache-Control': 'private, no-store',
    }, buf);
  }
  return sendJson(res, r.status, r.json, extra);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[http]', req.method, req.url, e);
    sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
  });
});
server.headersTimeout = 20 * 1000;
server.requestTimeout = 60 * 1000;
server.keepAliveTimeout = 5 * 1000;
server.maxHeadersCount = 60;
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

// Контроль сроков: раз в минуту проверяем SLA и эскалируем просрочки
setInterval(() => {
  try { if (engine.tick() > 0) scheduleSave(); } catch (e) { console.error('[sla]', e); }
}, 60 * 1000).unref();

// Битрикс24 (облако): ИСХОДЯЩИЕ вызовы входящего вебхука портала. Входящих вебхуков у нас нет.
// URL вебхука содержит секрет — храните его только в переменной окружения BITRIX24_WEBHOOK_URL.
async function b24(method, params) {
  if (!/^[a-z.]+$/.test(method)) throw new Error('bad method');
  const resp = await fetch(BITRIX + '/' + method + '.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal: AbortSignal.timeout(10000) });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || j.error) throw new Error(String(j.error_description || j.error || 'HTTP ' + resp.status).slice(0, 300));
  return j.result;
}
async function bitrixUserIdOf(u) {
  if (!u) return null;
  if (u.bitrixUserId) return u.bitrixUserId;
  if (!u.email) return null;
  const found = await b24('user.get', { FILTER: { EMAIL: u.email } });
  if (found && found[0]) { u.bitrixUserId = Number(found[0].ID); scheduleSave(); return u.bitrixUserId; }
  return null;
}
async function flushBitrix() {
  if (!BITRIX) return;
  const st = engine.getState();
  const now = Date.now();
  const queued = st.outbox.filter((o) => o.channel === 'bitrix24' && (o.status === 'queued' || (o.status === 'error' && (o.attempts || 0) < 5 && now >= (o.retryAt || 0)))).slice(0, 10);
  for (const o of queued) {
    try {
      const u = st.users.find((x) => x.id === o.userId);
      const bid = await bitrixUserIdOf(u);
      if (!bid) { o.status = 'skipped'; o.error = 'Сотрудник не найден в Битрикс24 (нет bitrixUserId и совпадения по e-mail)'; continue; }
      const link = PUBLIC_URL && o.appealId ? '\n' + PUBLIC_URL + '/#/appeal/' + o.appealId : '';
      if (o.method === 'tasks.task.add') {
        const r = await b24('tasks.task.add', { fields: { TITLE: '[Модус Сигнал] ' + o.subject, DESCRIPTION: o.body + link, RESPONSIBLE_ID: bid, DEADLINE: o.deadline ? new Date(o.deadline).toISOString() : undefined } });
        o.externalId = r && r.task && r.task.id;
        const a = st.appeals.find((x) => x.id === o.appealId); if (a && o.externalId) a.bitrixTaskId = o.externalId;
      } else {
        await b24('im.notify.system.add', { USER_ID: bid, MESSAGE: '[B]' + o.subject + '[/B]\n' + o.body + link });
      }
      o.status = 'sent'; o.error = null;
    } catch (e) {
      o.attempts = (o.attempts || 0) + 1;
      o.status = 'error'; o.error = e.message; o.retryAt = Date.now() + Math.min(30 * 60 * 1000, 30 * 1000 * 2 ** o.attempts);
    }
  }
  if (queued.length) scheduleSave();
}
if (BITRIX) setInterval(() => { flushBitrix().catch((e) => console.error('[bitrix]', e)); }, 10 * 1000).unref();

function shutdown() { try { saveNow(); } finally { process.exit(0); } }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log('Модус Сигнал запущен: http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  console.log('Данные: ' + DB_FILE + (env.bitrixLive ? ' · Битрикс24: вебхук подключён' : ' · Битрикс24: режим имитации'));
  console.log('Вход: ' + (DEMO_LOGIN ? 'ДЕМО (выбор роли без пароля) — не для рабочей среды!' : 'по e-mail и паролю') + (DEMO_TOOLS ? ' · демо-инструменты включены' : ''));
  if (HOST === '0.0.0.0' && !COOKIE_SECURE) console.warn('[!] Сервер доступен из сети без HTTPS. Поставьте reverse proxy с TLS и COOKIE_SECURE=1.');
});
