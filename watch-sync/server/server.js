const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// 同一個埠同時提供 WebSocket 與 iOS 用的網頁 (public/index.html)
const srv = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
});
const wss = new WebSocketServer({ server: srv });
const rooms = new Map();

// count 算「人數」(不重複的 peer)，不是連線數；me 標出誰是剛加入的
function broadcastPeers(room, joiner) {
  const set = rooms.get(room);
  if (!set) return;
  const count = new Set([...set].map((c) => c.peer)).size;
  for (const c of set) {
    if (c.readyState === 1) c.send(JSON.stringify({ type: 'peers', count, me: !!joiner && c.peer === joiner.peer }));
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      ws.room = String(m.room).slice(0, 64);
      ws.peer = String(m.peer || Math.random()).slice(0, 80);
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
      rooms.get(ws.room).add(ws);
      console.log(`[加入] 房間 ${ws.room}，目前 ${rooms.get(ws.room).size} 條連線`);
      broadcastPeers(ws.room, ws);
      return;
    }
    if (!ws.room) return;
    const url = typeof m.url === 'string' ? m.url.slice(0, 2000) : undefined;
    const out = JSON.stringify({ type: m.type, time: m.time, vid: m.vid, url });
    for (const c of rooms.get(ws.room)) if (c.peer !== ws.peer && c.readyState === 1) c.send(out);
  });
  ws.on('close', () => {
    const s = rooms.get(ws.room);
    if (s) {
      s.delete(ws);
      if (!s.size) rooms.delete(ws.room); else broadcastPeers(ws.room);
    }
  });
});

// 每 20 秒送一次心跳：避免 Render 閒置斷線，也讓 Chrome 背景程式不被休眠
setInterval(() => {
  for (const c of wss.clients) if (c.readyState === 1) c.send('{"type":"hb"}');
}, 20000);

srv.listen(process.env.PORT || 8080, () => console.log('sync server running'));
