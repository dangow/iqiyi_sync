(() => {
  let sock = null;
  let video = null;
  let applying = false;
  let badge = null;
  let cfg = {};
  const bound = new WeakSet();

  function setBadge(text, ok) {
    if (!video) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:2147483647;padding:4px 8px;' +
        'border-radius:6px;font:12px sans-serif;color:#fff;pointer-events:none;opacity:.85';
      document.documentElement.appendChild(badge);
    }
    badge.textContent = '同步：' + text;
    badge.style.background = ok ? '#1a7f37' : '#b42318';
  }

  async function loadCfg() {
    cfg = await chrome.storage.local.get(['server', 'room']);
  }

  function connect() {
    if (sock) { sock.__stop = true; sock.close(); sock = null; }
    if (!video) return;
    if (!cfg.server || !cfg.room) { setBadge('尚未設定伺服器/房間', false); return; }
    let s;
    try { s = new WebSocket(cfg.server); } catch (e) { setBadge('網址格式錯誤', false); return; }
    sock = s;
    setBadge('連線中…', false);
    s.onopen = () => s.send(JSON.stringify({ type: 'join', room: cfg.room }));
    s.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'peers') {
        setBadge(m.count >= 2 ? `已連線（房內 ${m.count} 人）` : '已連線，等朋友加入', m.count >= 2);
        return;
      }
      handle(m);
    };
    s.onerror = () => setBadge('連線失敗', false);
    s.onclose = () => {
      if (s.__stop) return;
      setBadge('斷線，重連中…', false);
      setTimeout(() => { if (sock === s) connect(); }, 3000);
    };
  }

  function send(type) {
    if (!video || !sock || sock.readyState !== 1 || applying) return;
    sock.send(JSON.stringify({ type, time: video.currentTime }));
    console.log('[愛奇藝同步] 送出', type, video.currentTime.toFixed(1));
  }

  function handle(m) {
    if (!video) return;
    console.log('[愛奇藝同步] 收到', m.type, m.time);
    applying = true;
    if (typeof m.time === 'number' && Math.abs(video.currentTime - m.time) > 0.5) {
      video.currentTime = m.time;
    }
    if (m.type === 'play') video.play().catch((e) => console.log('[愛奇藝同步] play 被擋，請在頁面點一下', e));
    if (m.type === 'pause') video.pause();
    setTimeout(() => { applying = false; }, 600);
  }

  function bind(v) {
    if (bound.has(v)) return;
    bound.add(v);
    v.addEventListener('play', () => send('play'));
    v.addEventListener('pause', () => send('pause'));
    v.addEventListener('seeked', () => send(v.paused ? 'pause' : 'play'));
  }

  // Alt+S：把我目前的進度推給對方
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's' && video) {
      send(video.paused ? 'pause' : 'play');
    }
  });

  chrome.storage.onChanged.addListener(() => loadCfg().then(connect));

  loadCfg().then(() => {
    setInterval(() => {
      const v = document.querySelector('video');
      if (v && v !== video) {
        video = v;
        bind(v);
        console.log('[愛奇藝同步] 找到影片元素');
        connect();
      }
    }, 1000);
  });
})();
