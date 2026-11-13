/* Транспорт API: сервер (fetch) или автономный режим (то же ядро в браузере) */
(function () {
  'use strict';
  const MS = window.MS;
  const TOKEN_KEY = 'modus.token';
  const STATE_KEY = 'modus.state.v3';
  const SECRET_KEY = 'modus.secret';
  const standalone = window.MODUS_MODE === 'standalone';
  let engine = null;

  // Серверный режим: токен живёт ТОЛЬКО в HttpOnly-cookie (JS его не видит, XSS не украдёт).
  // Автономная демо-версия без сервера: токен в sessionStorage (до закрытия вкладки), данные и так лежат в этом браузере.
  function getToken() { if (!standalone) return ''; try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.removeItem(TOKEN_KEY); if (!standalone) return; if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  const SAFE_HEADERS = { 'X-Requested-With': 'modus' };

  // Демо-HMAC для автономного режима (на сервере — настоящий HMAC-SHA256)
  function h32(str, seed) {
    let x = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
    x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15;
    return (x >>> 0).toString(16).padStart(8, '0');
  }
  function secret() {
    let s = localStorage.getItem(SECRET_KEY);
    if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(SECRET_KEY, s); }
    return s;
  }
  function getEngine() {
    if (engine) return engine;
    const key = secret();
    const env = {
      now: () => Date.now(),
      hmac: (m) => { let out = ''; for (let i = 0; i < 8; i++) out += h32(key + '|' + m + '|' + i, Math.imul(i + 1, 0x9e3779b1)); return out; },
      bitrixLive: false,
      mode: 'standalone',
      demoAccounts: true,
      demoPasswordHash: 'demo1234',
      verifyPassword: (stored, pw) => !!stored && stored === 'demo1234' && pw === 'demo1234',
    };
    let saved = null;
    try { const raw = localStorage.getItem(STATE_KEY); if (raw) saved = JSON.parse(raw); } catch (e) { saved = null; }
    engine = window.ModusEngine.createEngine(env, saved || undefined);
    save();
    setInterval(() => { if (engine.tick()) { save(); if (MS.app) MS.app.refresh(); } }, 60000);
    return engine;
  }
  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(engine.getState())); }
    catch (e) { if (MS.ui) MS.ui.toast('Хранилище браузера переполнено: удалите крупные вложения или сбросьте демо', 'err'); }
  }

  function qs(query) {
    if (!query) return '';
    const parts = [];
    for (const k in query) { const v = query[k]; if (v === undefined || v === null || v === '' || v === false) continue; parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v === true ? '1' : v)); }
    return parts.length ? '?' + parts.join('&') : '';
  }
  function fail(status, json) {
    const e = new Error((json && json.error) || ('Ошибка ' + status));
    e.status = status; e.details = json && json.details;
    if (status === 401 && MS.app && MS.app.onUnauthorized) MS.app.onUnauthorized();
    return e;
  }
  function cleanQuery(query) { const q = {}; for (const k in query || {}) { const v = query[k]; if (v !== undefined && v !== null && v !== '' && v !== false) q[k] = v === true ? '1' : String(v); } return q; }

  function local(method, path, body, query) {
    const eng = getEngine();
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const r = eng.handle({ method, path: '/api' + path, query: cleanQuery(query), body: body || {}, token: getToken() });
        if (r.changed) save();
        if (r.status >= 400) reject(fail(r.status, r.json));
        else resolve(r.json !== undefined ? r.json : r);
      }, 0);
    });
  }
  async function remote(method, path, body, query) {
    const headers = Object.assign({ Accept: 'application/json' }, SAFE_HEADERS);
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined && method !== 'GET') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch('/api' + path + qs(query), opts); }
    catch (e) { throw new Error('Сервер недоступен. Проверьте, что он запущен.'); }
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok) throw fail(res.status, json);
    return json;
  }
  function request(method, path, body, query) { return standalone ? local(method, path, body, query) : remote(method, path, body, query); }

  function saveBlob(blob, name, open) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Даже если попросили открыть — открываем только безопасные типы, остальное скачиваем
    const safe = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(blob.type || '');
    if (open && safe) a.target = '_blank'; else a.download = String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f\u202a-\u202e]/g, '_');
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64 || ''); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || 'application/octet-stream' });
  }
  function nameFromDisposition(h, fallback) {
    const m = /filename\*=UTF-8''([^;]+)/i.exec(h || ''); if (m) return decodeURIComponent(m[1]);
    const m2 = /filename="?([^";]+)"?/i.exec(h || ''); return m2 ? m2[1] : fallback;
  }

  async function downloadCsv(query) {
    if (standalone) {
      const r = getEngine().handle({ method: 'GET', path: '/api/export.csv', query: cleanQuery(query), token: getToken() });
      if (r.status >= 400) throw fail(r.status, r.json);
      return saveBlob(new Blob([r.text], { type: 'text/csv;charset=utf-8' }), r.filename);
    }
    const res = await fetch('/api/export.csv' + qs(query), { headers: SAFE_HEADERS, credentials: 'same-origin' });
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) { j = null; } throw fail(res.status, j); }
    saveBlob(await res.blob(), nameFromDisposition(res.headers.get('Content-Disposition'), 'export.csv'));
  }
  async function openFile(f) {
    // Открывать во вкладке — только безопасные типы (SVG/HTML из blob: выполнились бы с нашим origin)
    const viewable = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(f.type || '');
    if (standalone) {
      const r = getEngine().handle({ method: 'GET', path: '/api/files/' + f.id, query: {}, token: getToken() });
      if (r.status >= 400) throw fail(r.status, r.json);
      return saveBlob(b64ToBlob(r.file.data, r.file.type), r.file.name, viewable);
    }
    const res = await fetch('/api/files/' + encodeURIComponent(f.id), { headers: SAFE_HEADERS, credentials: 'same-origin' });
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) { j = null; } throw fail(res.status, j); }
    saveBlob(await res.blob(), f.name, viewable);
  }
  function resetLocal() { localStorage.removeItem(STATE_KEY); setToken(''); engine = null; }

  MS.api = {
    standalone, getToken, setToken, request, downloadCsv, openFile, resetLocal,
    get: (p, q) => request('GET', p, undefined, q),
    post: (p, b) => request('POST', p, b || {}),
    put: (p, b) => request('PUT', p, b || {}),
  };
})();
