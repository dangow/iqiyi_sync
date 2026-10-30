// WebSocket 放在背景，避免被 Netflix / YouTube 的 CSP 擋掉
const conns = new Set();

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
  const peer = (await uidP) + '-' + (c.port.sender.tab ? c.port.sender.tab.id : 0);
  let ws;
  try { ws = new WebSocket(server); } catch { return say('網址格式錯誤', false); }
  c.ws = ws;
  say('連線中…', false);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, peer }));
  ws.onmessage = (e) => { try { c.port.postMessage(JSON.parse(e.data)); } catch {} };
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
    if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(m));
  });
  port.onDisconnect.addListener(() => {
    conns.delete(c);
    if (c.ws) { c.ws.onclose = null; c.ws.close(); }
  });
});

chrome.storage.onChanged.addListener((ch) => {
  if (ch.server || ch.room) conns.forEach(connect);
});
