// Модус Сигнал — общие функции безопасности (работают и в Node, и в браузере).

const COMMON = new Set(('123456 1234567 12345678 123456789 1234567890 12345678910 password password1 password123 qwerty qwerty123 qwertyuiop ' +
  '111111 000000 123123 abc123 iloveyou admin admin123 administrator welcome welcome1 letmein monkey dragon football baseball ' +
  'master sunshine princess passw0rd p@ssw0rd p@ssword 1q2w3e4r 1q2w3e4r5t zaq12wsx qazwsx qazwsxedc 1qaz2wsx ' +
  'йцукен йцукенгшщз пароль пароль123 привет modus modustrade modus123 modus2026 signal123 company123 changeme').split(' '));

// Проверка надёжности пароля: длина, разнообразие, словарь, отсутствие имени/e-mail
export function checkPasswordStrength(pw, user) {
  const s = String(pw == null ? '' : pw);
  if (s.length < 10) return { ok: false, reason: 'Пароль должен быть не короче 10 символов' };
  if (s.length > 128) return { ok: false, reason: 'Пароль слишком длинный (максимум 128 символов)' };
  const low = s.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[0-9!@#$%^&*._-]+$/, ''))) return { ok: false, reason: 'Пароль слишком распространённый' };
  if (/^(.)\1+$/.test(s)) return { ok: false, reason: 'Пароль из одного повторяющегося символа' };
  let classes = 0;
  if (/[a-zа-яё]/.test(s)) classes++;
  if (/[A-ZА-ЯЁ]/.test(s)) classes++;
  if (/[0-9]/.test(s)) classes++;
  if (/[^A-Za-zА-Яа-яЁё0-9]/.test(s)) classes++;
  if (classes < 3 && s.length < 16) return { ok: false, reason: 'Используйте минимум 3 вида символов (строчные, заглавные, цифры, знаки) или пароль от 16 символов' };
  if (user) {
    const parts = [user.email && String(user.email).split('@')[0], ...String(user.name || '').split(/\s+/)].filter((x) => x && x.length >= 3).map((x) => x.toLowerCase());
    if (parts.some((p) => low.includes(p))) return { ok: false, reason: 'Пароль не должен содержать имя или e-mail' };
  }
  return { ok: true };
}

// Криптостойкий случайный hex (Node 19+/браузер — globalThis.crypto)
export function randomHex(bytes) {
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) throw new Error('Нет криптостойкого генератора случайных чисел');
  const arr = new Uint8Array(bytes);
  c.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Глубокая очистка входного тела: удаляет опасные ключи, ограничивает вложенность, размер массивов и типы
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function sanitizeInput(v, depth) {
  const d = depth || 0;
  if (d > 8) return undefined;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => sanitizeInput(x, d + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) { if (BAD_KEYS.has(k)) continue; const x = sanitizeInput(v[k], d + 1); if (x !== undefined) out[k] = x; }
    return out;
  }
  return undefined;
}

// Оставить в объекте только разрешённые поля (защита от массового присвоения)
export function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj && Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
  return out;
}

// ---------- вложения ----------
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
// Разрешённые типы: расширение → MIME и проверка сигнатуры (magic bytes)
const FILE_TYPES = {
  png: { mime: 'image/png', sig: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  jpg: { mime: 'image/jpeg', sig: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', sig: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { mime: 'image/gif', sig: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  webp: { mime: 'image/webp', sig: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
  pdf: { mime: 'application/pdf', sig: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: zipSig },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: zipSig },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sig: zipSig },
  txt: { mime: 'text/plain', sig: textSig },
  csv: { mime: 'text/csv', sig: textSig },
};
function zipSig(b) { return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; }
function textSig(b) { for (let i = 0; i < b.length; i++) { if (b[i] === 0) return false; } return true; }
export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPES);

function b64Head(data, n) {
  const chunk = data.slice(0, Math.ceil(n / 3) * 4);
  const bin = typeof Buffer !== 'undefined' ? Buffer.from(chunk, 'base64') : Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0));
  return bin;
}

// Имя файла: без путей, управляющих и bidi-символов (подмена расширения через U+202E), без ведущих точек
export function cleanFileName(name) {
  let s = String(name || 'файл').normalize('NFC');
  s = s.split(/[\\/]/).pop();
  s = s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  s = s.replace(/[:*?"<>|;]+/g, '_').replace(/^\.+/, '').trim();
  if (s.length > 120) { const ext = s.includes('.') ? s.slice(s.lastIndexOf('.')) : ''; s = s.slice(0, 120 - ext.length) + ext; }
  return s || 'файл';
}

// Возвращает { name, type, size, data } или бросает понятную ошибку через fail(status, msg)
export function validateUpload(f, fail) {
  if (!f || typeof f !== 'object') fail(400, 'Некорректное вложение');
  const name = cleanFileName(f.name);
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const spec = FILE_TYPES[ext];
  if (!spec) fail(400, 'Файл «' + name + '»: недопустимый тип. Разрешены: ' + ALLOWED_EXTENSIONS.join(', '));
  const data = String(f.data || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!data) fail(400, 'Файл «' + name + '» пустой');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) fail(400, 'Файл «' + name + '»: повреждённые данные');
  const size = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (size > MAX_FILE_BYTES) fail(400, 'Файл «' + name + '» больше 2 МБ');
  const head = b64Head(data, spec === FILE_TYPES.txt || spec === FILE_TYPES.csv ? Math.min(size, 4096) : 16);
  if (!spec.sig(head)) fail(400, 'Файл «' + name + '»: содержимое не соответствует расширению .' + ext);
  // Тип берём из расширения и сигнатуры, а не из того, что прислал клиент
  return { name, type: spec.mime, size, data };
}
