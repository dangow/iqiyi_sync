// ==UserScript==
// @name         同步觀影（愛奇藝 / iOS Safari）
// @description  和 watch-sync 電腦版互通：同步播放/暫停/進度，並自動跳到對方選的影片
// @version      2.0
// @match        *://*.iqiyi.com/*
// @match        *://*.iq.com/*
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  if (window.__wsyncLoaded) return;
  window.__wsyncLoaded = true;

  var KEY_S = 'iqiyiSyncServer', KEY_R = 'iqiyiSyncRoom', KEY_U = 'wsyncUid';
  var sock = null, video = null, applying = false;
  var pending = false, requested = false, lastCount = 0, lastKey = null, firstTick = true;
  var bar = null, label = null;
  var cfg = { server: '', room: '' };

  // 每支手機一個固定 id，伺服器才能算「幾個人」
  var peerId = (function () {
    try {
      var u = localStorage.getItem(KEY_U);
      if (!u) { u = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(KEY_U, u); }
      return u;
    } catch (e) { return String(Math.random()).slice(2); }
  })();

  function root(h) { return h.split('.').slice(-2).join('.'); }
  function videoPage() { return /\/(play|v_)/.test(location.pathname); }
  function key(u) { try { return new URL(u, location.href).pathname; } catch (e) { return u; } }

  function loadCfg() {
    try { cfg.server = localStorage.getItem(KEY_S) || ''; cfg.room = localStorage.getItem(KEY_R) || ''; } catch (e) {}
  }
  function askCfg() {
    var s = prompt('伺服器網址（wss://...）', cfg.server);
    if (s === null) return false;
    var r = prompt('房間代碼（和朋友一樣）', cfg.room);
    if (r === null) return false;
    cfg.server = s.trim(); cfg.room = r.trim();
    try { localStorage.setItem(KEY_S, cfg.server); localStorage.setItem(KEY_R, cfg.room); } catch (e) {}
    return true;
  }

  function makeBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;display:flex;gap:6px;font:13px sans-serif;color:#fff;opacity:.9';
    label = document.createElement('div');
    label.style.cssText = 'padding:6px 10px;border-radius:6px;background:#b42318';
    label.onclick = function () { if (askCfg()) connect(); };   // 點狀態文字 = 修改設定
    var push = document.createElement('div');
    push.textContent = '↻';
    push.style.cssText = 'padding:6px 10px;border-radius:6px;background:#444';
    push.onclick = function () { send(video && video.paused ? 'pause' : 'play', true); };
    bar.appendChild(label); bar.appendChild(push);
    document.documentElement.appendChild(bar);
  }
  function setBadge(text, ok) {
    makeBar();
    label.textContent = '同步：' + text;
    label.style.background = ok ? '#1a7f37' : '#b42318';
  }

  function raw(obj) { if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj)); }

  function connect() {
    if (sock) { sock.__stop = true; try { sock.close(); } catch (e) {} sock = null; }
    if (!cfg.server || !cfg.room) { setBadge('點我設定', false); return; }
    var s;
    try { s = new WebSocket(cfg.server); } catch (e) { setBadge('網址格式錯誤（點我修改）', false); return; }
    sock = s; requested = false; lastCount = 0;
    setBadge('連線中…', false);
    s.onopen = function () { s.send(JSON.stringify({ type: 'join', room: cfg.room, peer: peerId })); };
    s.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.type === 'peers') {
        setBadge(m.count >= 2 ? '已連線（房內 ' + m.count + ' 人）' : '已連線，等朋友加入', m.count >= 2);
        if (!m.me && m.count > lastCount) sendNav();        // 有新人加入 → 把我的影片推給他
        lastCount = m.count;
        if (m.count >= 2 && !requested && m.me !== false) { requested = true; raw({ type: 'request' }); }  // 我是新加入的 → 要對方目前進度
      } else if (m.type === 'request') {
        if (video) raw({ type: video.paused ? 'pause' : 'play', time: video.currentTime });
      } else if (m.type === 'nav') {
        goTo(m.url);
      } else if (m.type === 'play' || m.type === 'pause') {
        handle(m);
      }                                                       // 其他（心跳 hb 等）一律忽略
    };
    s.onerror = function () { setBadge('連線失敗（點我修改）', false); };
    s.onclose = function () {
      if (s.__stop) return;
      setBadge('斷線，重連中…', false);
      setTimeout(function () { if (sock === s) connect(); }, 3000);
    };
  }

  function send(type, force) {
    if (!video || (applying && !force)) return;
    raw({ type: type, time: video.currentTime });
  }

  function handle(m) {
    if (!video) return;
    applying = true;
    if (typeof m.time === 'number' && Math.abs(video.currentTime - m.time) > 0.5) video.currentTime = m.time;
    if (m.type === 'play') {
      var p = video.play();
      if (p && p.catch) p.catch(function () { pending = true; setBadge('點一下頁面即可加入同步', false); });
    } else { video.pause(); }
    setTimeout(function () { applying = false; }, 1200);
  }

  // iOS 擋自動播放：使用者點一下 → 先在手勢內啟動播放，再向對方要最新進度
  function flush() {
    if (!pending || !video) return;
    pending = false;
    video.play().catch(function () {});
    raw({ type: 'request' });
    setBadge('已加入同步', true);
  }
  document.addEventListener('click', flush, true);
  document.addEventListener('touchend', flush, true);

  // 把我目前的影片網址告訴對方
  function sendNav() { if (videoPage()) raw({ type: 'nav', url: location.href }); }

  // 對方選了影片 → 我跳過去（只允許同一個網站；加防迴圈）
  function goTo(url) {
    var u; try { u = new URL(url); } catch (e) { return; }
    if (!/^https?:$/.test(u.protocol) || root(u.hostname) !== root(location.hostname)) return;
    if (key(url) === key(location.href)) return;
    try {
      var last = JSON.parse(sessionStorage.getItem('wsyncGo') || 'null');
      if (last && last.url === url && Date.now() - last.t < 30000) return;   // 30 秒內已跳過同一網址，不再重複
      sessionStorage.setItem('wsyncGo', JSON.stringify({ url: url, t: Date.now() }));
    } catch (e) {}
    setBadge('跳轉到對方選的影片…', true);
    location.href = url;
  }

  function bind(v) {
    v.addEventListener('play', function () { send('play'); });
    v.addEventListener('pause', function () { send('pause'); });
    v.addEventListener('seeked', function () { send(v.paused ? 'pause' : 'play'); });
  }

  loadCfg();
  if (!cfg.server || !cfg.room) {
    var asked = false; try { asked = sessionStorage.getItem('wsyncAsked') === '1'; } catch (e) {}
    if (!asked) { try { sessionStorage.setItem('wsyncAsked', '1'); } catch (e) {} askCfg(); }
  }
  connect();   // 一進頁面就連線（還沒開影片也能收到對方的跳轉）

  setInterval(function () {
    if (videoPage()) {
      var k = key(location.href);
      if (k !== lastKey) { if (!firstTick) sendNav(); lastKey = k; }   // 剛開頁面不推，之後換影片才推
    }
    firstTick = false;
    var v = document.querySelector('video');
    if (v && v !== video) { video = v; bind(v); }
  }, 1000);
})();
