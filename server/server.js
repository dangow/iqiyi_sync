const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const rooms = new Map();

function broadcastPeers(room) {
  const set = rooms.get(room);
  if (!set) return;
  const msg = JSON.stringify({ type: 'peers', count: set.size });
  for (const c of set) if (c.readyState === 1) c.send(msg);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      ws.room = String(m.room).slice(0, 64);
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
      rooms.get(ws.room).add(ws);
      console.log(`[加入] 房間 ${ws.room}，目前 ${rooms.get(ws.room).size} 人`);
      broadcastPeers(ws.room);
      return;
    }
    if (!ws.room) return;
    console.log(`[轉發] 房間 ${ws.room}: ${m.type} @ ${Number(m.time).toFixed(1)}`);
    for (const c of rooms.get(ws.room)) {
      if (c !== ws && c.readyState === 1) c.send(JSON.stringify({ type: m.type, time: m.time }));
    }
  });
  ws.on('close', () => {
    const s = rooms.get(ws.room);
    if (s) {
      s.delete(ws);
      console.log(`[離開] 房間 ${ws.room}，剩 ${s.size} 人`);
      if (!s.size) rooms.delete(ws.room); else broadcastPeers(ws.room);
    }
  });
});
console.log('sync server running');
