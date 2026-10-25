// 頁面環境：找 <video>、監聽播放事件、套用對方的操作、同步「選了哪部影片」
(() => {
  const H = location.hostname;
  const site = /netflix\.com$/.test(H) ? 'netflix' : /youtube\.com$/.test(H) ? 'youtube' : 'iqiyi';
  const root = H.split('.').slice(-2).join('.');
  const isTop = window === top;
  const videoPage = () => site === 'iqiyi' ? /\/(play|v_)/.test(location.pathname) : location.pathname.startsWith('/watch');
  const active = () => site === 'iqiyi' || videoPage();
  // 判斷「是不是同一部影片」：YouTube 看 v 參數，其他看網址路徑
  const key = (u) => {
    try {
      const x = new URL(u, location.href);
      return site === 'youtube' ? x.searchParams.get('v') || x.pathname : x.origin + x.pathname;
    } catch { return u; }
  };
  let video = null, applying = false, badge = null, lastKey = null, lastCount = 0, firstTick = true;
  const post = (m, start) => window.postMessage({ src: 'wsync', dir: 'bg', m, start }, '*');

  function setBadge(text, ok) {
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

  // Netflix 直接改 video.currentTime 會出錯，必須走它自己的 player API
  function nf() {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      return vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
    } catch { return null; }
  }
  const seek = (t) => { const p = site === 'netflix' && nf(); p ? p.seek(t * 1000) : (video.currentTime = t); };
  const play = () => {
    const p = site === 'netflix' && nf();
    Promise.resolve(p ? p.play() : video.play()).catch(() => console.log('[同步] play 被擋，請在頁面點一下'));
  };
  const pause = () => { const p = site === 'netflix' && nf(); p ? p.pause() : video.pause(); };

  function send(type) {
    if (!video || applying) return;
    post({ type, time: video.currentTime });
  }

  function handle(m) {
    if (!video) return;
    applying = true;
    if (typeof m.time === 'number' && Math.abs(video.currentTime - m.time) > 0.5) seek(m.time);
    if (m.type === 'play') play(); else pause();
    setTimeout(() => { applying = false; }, 1200);
  }

  // 把我目前的影片網址告訴對方（只有最上層頁面負責）
  const sendNav = () => { if (isTop && videoPage()) post({ type: 'nav', url: location.href }); };

  // 對方選了影片 → 我跳過去（只允許同一個網站，避免被導去別處）
  function goTo(url) {
    if (!isTop) return;
    let u;
    try { u = new URL(url); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.split('.').slice(-2).join('.') !== root) return;
    if (key(url) !== key(location.href)) {
      setBadge('跳轉到對方選的影片…', true);
      location.href = url;
    }
  }

  function bind(v) {
    v.addEventListener('play', () => send('play'));
    v.addEventListener('pause', () => send('pause'));
    v.addEventListener('seeked', () => send(v.paused ? 'pause' : 'play'));
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.src !== 'wsync' || d.dir !== 'main' || !d.m) return;
    const m = d.m;
    if (m.type === 'status') setBadge(m.text, m.ok);
    else if (m.type === 'peers') {
      setBadge(m.count >= 2 ? `已連線（房內 ${m.count} 人）` : '已連線，等朋友加入', m.count >= 2);
      // 有新朋友加入 → 原本在房裡的人把自己的影片推給新人
      if (isTop && !m.me && m.count > lastCount) sendNav();
      lastCount = m.count;
    } else if (m.type === 'nav') goTo(m.url);
    else if (m.type === 'play' || m.type === 'pause') handle(m);
  });

  // Alt+S：把我目前的進度推給對方
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's' && video) send(video.paused ? 'pause' : 'play');
  });

  // YouTube / Netflix 是單頁應用，所以持續輪詢
  setInterval(() => {
    if (isTop) {
      post(null, true); // 最上層頁面一進來就連線（還沒開影片也能收到對方的跳轉）
      if (videoPage()) {
        const k = key(location.href);
        if (k !== lastKey) { if (!firstTick) sendNav(); lastKey = k; } // 剛開頁面不推，之後換影片才推
      }
      firstTick = false;
    }
    if (!active()) return;
    const v = document.querySelector('video');
    if (v && v !== video) {
      video = v;
      bind(v);
      post(null, true);
    }
  }, 1000);
})();
