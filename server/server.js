const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// ---- 可用環境變數調整（Render → Environment）----
const PORT = process.env.PORT || 8080;
const MIN_ROOM_LEN = parseInt(process.env.MIN_ROOM_LEN || '8', 10);        // 房間代碼最短長度
const MAX_PER_ROOM = parseInt(process.env.MAX_PER_ROOM || '20', 10);       // 每個房間最多連線數
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '300', 10); // 伺服器總連線上限
// 選用：只允許這些來源連線，逗號分隔，可用 * 當萬用字元，例如：
//   chrome-extension://*,https://*.iq.com,https://*.iqiyi.com
// 沒設定 = 不檢查來源。伺服器自己的網頁（iPhone YouTube 網頁版）永遠允許。
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const TYPES = new Set(['play', 'pause', 'nav', 'request']);

// ---- HTTP：只提供網頁版首頁與健康檢查，並加上基本安全標頭 ----
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',                              // 禁止被別的網站用 iframe 嵌入（防點擊劫持）
  'Referrer-Policy': 'strict-origin-when-cross-origin',   // YouTube 內嵌播放器需要 referrer，不能用 no-referrer
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const srv = http.createServer((req, res) => {
  let p = '/';
  try { p = new URL(req.url, 'http://x').pathname; } catch {}
  if (p === '/healthz') { res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p !== '/' && p !== '/index.html') { res.writeHead(404, SEC_HEADERS); return res.end('not found'); }
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, buf) => {
    if (err) { res.writeHead(404, SEC_HEADERS); return res.end('not found'); }
    res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server: srv, maxPayload: 4096 }); // 訊息最大 4KB（預設是 100MB）
const rooms = new Map();

function matchOrigin(pattern, origin) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp('^' + esc + '$').test(origin);
}
function originAllowed(origin, host) {
  if (!ALLOWED_ORIGINS.length) return true;
  if (!origin) return false;
  try { if (new URL(origin).host === host) return true; } catch { return false; }
  return ALLOWED_ORIGINS.some((p) => matchOrigin(p, origin));
}

function safeUrl(s) {
  if (typeof s !== 'string' || s.length > 2000) return null;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

// count 算「人數」(不重複的 peer)，不是連線數；me 標出誰是剛加入的
function broadcastPeers(room, joiner) {
  const set = rooms.get(room);
  if (!set) return;
  const count = new Set([...set].map((c) => c.peer)).size;
  for (const c of set) {
    if (c.readyState === 1) c.send(JSON.stringify({ type: 'peers', count, me: !!joiner && c.peer === joiner.peer }));
  }
}
const status = (ws, text) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'status', text, ok: false }));

wss.on('connection', (ws, req) => {
  if (!originAllowed(req.headers.origin, req.headers.host)) {
    console.log('[拒絕] 來源不符:', String(req.headers.origin).slice(0, 80));
    return ws.close(1008, 'origin');
  }
  if (wss.clients.size > MAX_CONNECTIONS) return ws.close(1013, 'busy');

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.bucket = { n: 0, t: Date.now() };
  // 連上後 10 秒內沒送 join 就斷線，避免有人佔著連線不用
  const joinTimer = setTimeout(() => { if (!ws.room) ws.close(1008, 'no join'); }, 10000);

  ws.on('message', (raw) => {
    // 速率限制：每 10 秒最多 60 則，超過直接斷線
    const now = Date.now();
    if (now - ws.bucket.t > 10000) ws.bucket = { n: 0, t: now };
    if (++ws.bucket.n > 60) return ws.close(1008, 'rate');

    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.type === 'join') {
      clearTimeout(joinTimer);
      if (ws.room) return;                                   // 已經加入過，不能中途換房間
      const room = typeof m.room === 'string' ? m.room.trim().slice(0, 64) : '';
      if (room.length < MIN_ROOM_LEN) return status(ws, `房間代碼至少 ${MIN_ROOM_LEN} 個字元，請換長一點的`);
      const set = rooms.get(room) || new Set();
      if (set.size >= MAX_PER_ROOM) return status(ws, '房間人數已滿');
      ws.peer = (typeof m.peer === 'string' && m.peer ? m.peer : crypto.randomUUID()).slice(0, 80);
      ws.room = room;
      set.add(ws);
      rooms.set(room, set);
      // 紀錄只留代碼的雜湊前 6 碼，不把房間代碼寫進日誌
      console.log(`[加入] 房間#${crypto.createHash('sha256').update(room).digest('hex').slice(0, 6)}，目前 ${set.size} 條連線`);
      broadcastPeers(room, ws);
      return;
    }

    if (!ws.room || !TYPES.has(m.type)) return;

    // 只轉發驗證過的欄位，其餘一律丟掉
    const out = { type: m.type };
    if (m.type === 'play' || m.type === 'pause') {
      if (typeof m.time !== 'number' || !Number.isFinite(m.time) || m.time < 0 || m.time > 1e6) return;
      out.time = m.time;
    }
    if (m.type === 'nav') {
      const url = safeUrl(m.url);
      if (!url) return;
      out.url = url;
    }
    if (typeof m.vid === 'string' && /^[\w-]{11}$/.test(m.vid)) out.vid = m.vid;

    const msg = JSON.stringify(out);
    for (const c of rooms.get(ws.room)) if (c.peer !== ws.peer && c.readyState === 1) c.send(msg);
  });

  ws.on('close', () => {
    clearTimeout(joinTimer);
    const s = rooms.get(ws.room);
    if (s) {
      s.delete(ws);
      if (!s.size) rooms.delete(ws.room); else broadcastPeers(ws.room);
    }
  });
  ws.on('error', () => {});
});

// 每 20 秒送一次心跳：避免 Render 閒置斷線，也讓 Chrome 背景程式不被休眠
setInterval(() => {
  for (const c of wss.clients) if (c.readyState === 1) c.send('{"type":"hb"}');
}, 20000);

// 每 30 秒檢查死連線：沒回應 ping 的直接清掉
setInterval(() => {
  for (const c of wss.clients) {
    if (!c.isAlive) { c.terminate(); continue; }
    c.isAlive = false;
    c.ping();
  }
}, 30000);

srv.listen(PORT, () => console.log('sync server running on port ' + PORT));
