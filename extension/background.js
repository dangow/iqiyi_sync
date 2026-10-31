// WebSocket 放在背景，避免被 Netflix / YouTube 的 CSP 擋掉
const conns = new Set();

// ---- 安全：頁面（main.js）和網頁上的其他腳本共用同一個環境，所以背景這邊要自己驗證 ----
const TYPES = new Set(['play', 'pause', 'nav', 'request']);
// 送出前：只放行已知類型與驗證過的欄位
function cleanOut(m) {
  if (!m || typeof m !== 'object' || !TYPES.has(m.type)) return null;
  const o = { type: m.type };
  if (m.type === 'play' || m.type === 'pause') {
    if (typeof m.time !== 'number' || !isFinite(m.time) || m.time < 0) return null;
    o.time = m.time;
  }
  if (m.type === 'nav') {
    if (typeof m.url !== 'string' || m.url.length > 2000) return null;
    try { if (new URL(m.url).protocol !== 'https:') return null; } catch { return null; }
    o.url = m.url;
  }
  return o;
}
// 收到後：伺服器的訊息也不盡信，只放行已知類型
function cleanIn(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.type === 'hb') return m;
  if (m.type === 'status') return { type: 'status', text: String(m.text || '').slice(0, 100), ok: !!m.ok };
  if (m.type === 'peers') return { type: 'peers', count: Number(m.count) || 0, me: !!m.me };
  return cleanOut(m);
}
// 只允許加密連線；ws:// 只限本機測試
function serverOk(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'wss:' || (x.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname));
  } catch { return false; }
}

// 每個瀏覽器一個固定 id，加上分頁 id，伺服器才能分辨「幾個人」而不是「幾條連線」
const uidP = chrome.storage.local.get('uid').then(async ({ uid }) => {
  if (uid) return uid;
  uid = crypto.randomUUID();
  await chrome.storage.local.set({ uid });
  return uid;
});

async function connect(c) {
  if (c.ws) { c.ws.onclose = null; c.ws.close(); c.ws = null; }
  const { server, room } = await chrome.storage.local.get(['server', 'room']);
  const say = (text, ok) => c.port.postMessage({ type: 'status', text, ok });
  if (!server || !room) return say('尚未設定伺服器/房間', false);
  if (!serverOk(server)) return say('請使用 wss:// 網址（ws:// 只能用於 localhost）', false);
  const peer = (await uidP) + '-' + (c.port.sender.tab ? c.port.sender.tab.id : 0);
  let ws;
  try { ws = new WebSocket(server); } catch { return say('網址格式錯誤', false); }
  c.ws = ws;
  say('連線中…', false);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, peer }));
  ws.onmessage = (e) => { try { const m = cleanIn(JSON.parse(e.data)); if (m) c.port.postMessage(m); } catch {} };
  ws.onerror = () => say('連線失敗', false);
  ws.onclose = () => {
    if (!conns.has(c)) return;
    say('斷線，重連中…', false);
    setTimeout(() => { if (conns.has(c) && c.ws === ws) connect(c); }, 3000);
  };
}

chrome.runtime.onConnect.addListener((port) => {
  const c = { port, ws: null };
  conns.add(c);
  connect(c);
  port.onMessage.addListener((m) => {
    const o = cleanOut(m);
    if (o && c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(o));
  });
  port.onDisconnect.addListener(() => {
    conns.delete(c);
    if (c.ws) { c.ws.onclose = null; c.ws.close(); }
  });
});

chrome.storage.onChanged.addListener((ch) => {
  if (ch.server || ch.room) conns.forEach(connect);
});
